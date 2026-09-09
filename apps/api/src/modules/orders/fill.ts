import type { Prisma } from "@prisma/client";
import { Decimal, priceToApi, quantityToApi, roundMoney, toApiString } from "@stockdesk/shared";
import type { AppConfig } from "../../lib/config.js";
import type { AccountsDependencies } from "../accounts/snapshot-writer.js";
import { adjustClosingChildren, cancelOcoSibling, createBracketChildren } from "./brackets.js";
import { writeTradeCash } from "./cash-writer.js";
import { publishFill, publishOrderUpdate } from "./engine-events.js";
import { decideFill, rejectionReason } from "./evaluation.js";
import { markFilled, markRejected } from "./order-writes.js";
import { applyFillToPosition, lockPosition } from "./position-writer.js";
import type { PositionRecord } from "./positions-repository.js";
import { findOrderById, isRestingStatus, type OrderRow } from "./repository.js";
import { toOrderDto, toPositionRecordDto, toTradeDto, type TradeRow } from "./serializers.js";
import { prisma } from "../../lib/prisma.js";

const MONEY_PLACES = 2;

export interface FillIndex {
  add: (order: OrderRow) => void;
  remove: (orderId: string) => void;
}

export interface FillContext {
  config: AppConfig;
  accounts: AccountsDependencies;
  index: FillIndex;
  log: (message: string) => void;
}

export interface FillAttempt {
  orderId: string;
  price: Decimal;
  at: Date;
}

interface FillOutcome {
  userId: string;
  order: OrderRow;
  trade: TradeRow | null;
  position: PositionRecord | null;
  children: OrderRow[];
}

const STOP_TYPES: readonly OrderRow["type"][] = ["STOP", "STOP_LIMIT"];

function triggerStampFor(order: OrderRow, at: Date): Date | null {
  if (order.triggeredAt !== null || !STOP_TYPES.includes(order.type)) return null;

  return at;
}

function decimalOf(value: { toString: () => string } | null): Decimal | null {
  return value === null ? null : new Decimal(value.toString());
}

function toEvaluable(order: OrderRow): Parameters<typeof decideFill>[0] {
  return {
    side: order.side,
    type: order.type,
    status: order.status,
    limitPrice: decimalOf(order.limitPrice),
    stopPrice: decimalOf(order.stopPrice),
  };
}

async function rejectInside(
  tx: Prisma.TransactionClient,
  order: OrderRow,
  userId: string,
  reason: string,
): Promise<FillOutcome | null> {
  if ((await markRejected(tx, order.id, reason)) === 0) return null;

  const rejected = await findOrderById(tx, order.id);
  if (rejected === null) return null;

  return { userId, order: rejected, trade: null, position: null, children: [] };
}

async function bookFill(
  tx: Prisma.TransactionClient,
  attempt: FillAttempt,
  config: AppConfig,
): Promise<FillOutcome | null> {
  const order = await findOrderById(tx, attempt.orderId);
  if (order === null || !isRestingStatus(order.status)) return null;

  const decision = decideFill(toEvaluable(order), attempt.price);
  if (decision.kind !== "fill") return null;

  const account = await tx.account.findUnique({ where: { id: order.accountId } });
  if (account === null) return null;

  const quantity = new Decimal(order.quantity.toString());
  const commission = new Decimal(order.commission.toString());
  const listed = await tx.symbol.findFirst({ where: { symbol: order.symbol, isActive: true } });
  const held = await lockPosition(tx, order.accountId, order.symbol);
  const reason = rejectionReason({ side: order.side, quantity }, listed, held.quantity);

  if (reason !== null) return await rejectInside(tx, order, account.userId, reason);

  const filledCount = await markFilled(tx, order.id, {
    avgFillPrice: priceToApi(decision.price),
    filledAt: attempt.at,
    triggeredAt: triggerStampFor(order, attempt.at),
  });

  if (filledCount === 0) return null;

  const filled = await findOrderById(tx, order.id);
  if (filled === null) return null;

  const fill = {
    accountId: order.accountId,
    symbol: order.symbol,
    side: order.side,
    quantity,
    price: decision.price,
    commission,
    at: attempt.at,
  };

  const position = await applyFillToPosition(tx, held, fill);
  const amount = new Decimal(roundMoney(decision.price.times(quantity)));

  const trade = await tx.trade.create({
    data: {
      orderId: order.id,
      accountId: order.accountId,
      symbol: order.symbol,
      side: order.side,
      quantity: quantityToApi(quantity),
      price: priceToApi(decision.price),
      amount: toApiString(amount, MONEY_PLACES),
      commission: toApiString(commission, MONEY_PLACES),
      realizedPnl:
        position.realizedPnl === null ? null : toApiString(position.realizedPnl, MONEY_PLACES),
      executedAt: attempt.at,
    },
  });

  await writeTradeCash(tx, {
    accountId: order.accountId,
    userId: account.userId,
    side: order.side,
    symbol: order.symbol,
    quantity,
    amount,
    commission,
    tradeId: trade.id,
    at: attempt.at,
  });

  const children = await applyBrackets(tx, {
    order,
    quantityAfter: position.quantityAfter,
    filledQuantity: quantity,
    config,
    at: attempt.at,
  });

  return { userId: account.userId, order: filled, trade, position: position.record, children };
}

interface BracketPass {
  order: OrderRow;
  quantityAfter: Decimal;
  filledQuantity: Decimal;
  config: AppConfig;
  at: Date;
}

async function applyBrackets(
  tx: Prisma.TransactionClient,
  pass: BracketPass,
): Promise<OrderRow[]> {
  const { order, quantityAfter } = pass;
  const created = await createBracketChildren(tx, {
    entry: {
      id: order.id,
      accountId: order.accountId,
      symbol: order.symbol,
      side: order.side,
      role: order.role,
      stopLossPrice: decimalOf(order.stopLossPrice),
      takeProfitPrice: decimalOf(order.takeProfitPrice),
    },
    filledQuantity: pass.filledQuantity,
    quantityAfter,
    commission: toApiString(pass.config.commissionPerOrder, MONEY_PLACES),
  });

  const cancelled =
    order.ocoGroupId === null
      ? []
      : await cancelOcoSibling(tx, order.ocoGroupId, order.id, pass.at);

  const adjusted = await adjustClosingChildren(tx, {
    accountId: order.accountId,
    symbol: order.symbol,
    quantityAfter,
    excludeIds: [order.id, ...created.map((row) => row.id), ...cancelled.map((row) => row.id)],
    at: pass.at,
  });

  return [...created, ...cancelled, ...adjusted];
}

function reindex(context: FillContext, outcome: FillOutcome): void {
  context.index.remove(outcome.order.id);

  for (const child of outcome.children) {
    if (isRestingStatus(child.status)) context.index.add(child);
    else context.index.remove(child.id);
  }
}

/**
 * One transaction carries the whole fill: the conditional status write decides the race, and every
 * row that follows it is only reached by the writer that won. The broadcasts happen after commit.
 */
export async function executeFill(attempt: FillAttempt, context: FillContext): Promise<boolean> {
  const outcome = await prisma.$transaction(
    async (tx) => await bookFill(tx, attempt, context.config),
  );

  if (outcome === null) return false;

  reindex(context, outcome);

  if (outcome.trade === null || outcome.position === null) {
    publishOrderUpdate(context.accounts, outcome.userId, toOrderDto(outcome.order));
    context.log(`Order ${outcome.order.id} was rejected: ${outcome.order.rejectReason ?? ""}`);

    return false;
  }

  await publishFill(context.accounts, {
    userId: outcome.userId,
    trade: toTradeDto(outcome.trade),
    order: toOrderDto(outcome.order),
    children: outcome.children.map(toOrderDto),
    position: toPositionRecordDto(outcome.position),
  });

  return true;
}
