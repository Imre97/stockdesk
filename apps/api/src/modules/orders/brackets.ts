import { randomUUID } from "node:crypto";
import { Decimal, priceToApi, quantityToApi } from "@stockdesk/shared";
import {
  cancelRestingOrder,
  createChildOrder,
  reduceOrderQuantity,
  type CreateChildData,
} from "./order-writes.js";
import {
  findOrderById,
  listOcoSiblings,
  listRestingChildren,
  type OrderClient,
  type OrderRow,
} from "./repository.js";

export interface BracketEntry {
  id: string;
  accountId: string;
  symbol: string;
  side: OrderRow["side"];
  role: OrderRow["role"];
  stopLossPrice: Decimal | null;
  takeProfitPrice: Decimal | null;
}

export interface CreateChildrenInput {
  entry: BracketEntry;
  filledQuantity: Decimal;
  quantityAfter: Decimal;
  commission: string;
}

export interface AdjustChildrenInput {
  accountId: string;
  symbol: string;
  quantityAfter: Decimal;
  excludeIds: string[];
  at: Date;
}

function childBase(
  entry: BracketEntry,
  quantity: string,
  commission: string,
  ocoGroupId: string,
): Omit<CreateChildData, "type" | "role" | "limitPrice" | "stopPrice"> {
  return {
    accountId: entry.accountId,
    symbol: entry.symbol,
    side: entry.side === "BUY" ? "SELL" : "BUY",
    quantity,
    commission,
    parentOrderId: entry.id,
    ocoGroupId,
  };
}

/**
 * Children are closing orders: they never reserve and are capped at the absolute position the entry
 * left behind, so a bracket can never flip the position it is meant to protect.
 */
export async function createBracketChildren(
  client: OrderClient,
  input: CreateChildrenInput,
): Promise<OrderRow[]> {
  const { entry } = input;
  const stopLossPrice = entry.stopLossPrice;
  const takeProfitPrice = entry.takeProfitPrice;

  if (entry.role !== "ENTRY") return [];
  if (stopLossPrice === null && takeProfitPrice === null) return [];

  const capped = Decimal.min(input.filledQuantity, input.quantityAfter.absoluteValue());
  if (capped.lessThanOrEqualTo(0)) return [];

  const quantity = quantityToApi(capped);
  const ocoGroupId = randomUUID();
  const base = childBase(entry, quantity, input.commission, ocoGroupId);
  const children: OrderRow[] = [];

  if (stopLossPrice !== null) {
    children.push(
      await createChildOrder(client, {
        ...base,
        type: "STOP",
        role: "STOP_LOSS",
        stopPrice: priceToApi(stopLossPrice),
        limitPrice: null,
      }),
    );
  }

  if (takeProfitPrice !== null) {
    children.push(
      await createChildOrder(client, {
        ...base,
        type: "LIMIT",
        role: "TAKE_PROFIT",
        limitPrice: priceToApi(takeProfitPrice),
        stopPrice: null,
      }),
    );
  }

  return children;
}

export async function cancelOcoSibling(
  client: OrderClient,
  ocoGroupId: string,
  filledOrderId: string,
  at: Date,
): Promise<OrderRow[]> {
  const siblings = await listOcoSiblings(client, ocoGroupId, filledOrderId);
  const cancelled: OrderRow[] = [];

  for (const sibling of siblings) {
    const count = await cancelRestingOrder(client, sibling.id, "OCO_SIBLING_FILLED", at);
    if (count === 0) continue;

    const row = await findOrderById(client, sibling.id);
    if (row !== null) cancelled.push(row);
  }

  return cancelled;
}

/**
 * Any fill on a symbol can shrink the position under an active child: the child follows down to the
 * remaining absolute quantity and is cancelled once nothing is left to close.
 */
export async function adjustClosingChildren(
  client: OrderClient,
  input: AdjustChildrenInput,
): Promise<OrderRow[]> {
  const absolute = input.quantityAfter.absoluteValue();
  const children = await listRestingChildren(client, input.accountId, input.symbol);
  const touched: OrderRow[] = [];

  for (const child of children) {
    if (input.excludeIds.includes(child.id)) continue;

    const quantity = new Decimal(child.quantity.toString());
    let count = 0;

    if (absolute.isZero()) {
      count = await cancelRestingOrder(client, child.id, "POSITION_CLOSED", input.at);
    } else if (quantity.greaterThan(absolute)) {
      count = await reduceOrderQuantity(client, child.id, quantityToApi(absolute));
    }

    if (count === 0) continue;

    const row = await findOrderById(client, child.id);
    if (row !== null) touched.push(row);
  }

  return touched;
}
