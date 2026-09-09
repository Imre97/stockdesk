import {
  Decimal,
  placeOrderSchema,
  priceToApi,
  quantityToApi,
  toApiString,
  type ModifyOrderInput,
  type OrderDto,
} from "@stockdesk/shared";
import { prisma } from "../../lib/prisma.js";
import type { AccountRecord } from "../accounts/repository.js";
import { requireOwnedAccount } from "../accounts/service.js";
import { afterCashChange, currentTime } from "../accounts/snapshot-writer.js";
import { loadOrderContext, type OrdersDependencies } from "./context.js";
import { orderNotFound, orderNotModifiable, resolveWriteConflict } from "./conflicts.js";
import { publishOrderUpdate } from "./engine-events.js";
import { nextSessionClose } from "./expiry.js";
import {
  assertModifiableFields,
  mergedPlacement,
  quantityAbovePosition,
} from "./modify-fields.js";
import { applyModification, type ModifyWrite } from "./order-writes.js";
import { findPosition } from "./positions-repository.js";
import { findOrder, findOrderById, isRestingStatus, type OrderRow } from "./repository.js";
import { toOrderDto } from "./serializers.js";

const MONEY_PLACES = 2;

export interface ModifyResult {
  order: OrderDto;
}

function optionalPrice(value: Decimal | null | undefined): string | null {
  return value === null || value === undefined ? null : priceToApi(value);
}

function timeInForceWrite(
  request: ModifyOrderInput,
  merged: { timeInForce: OrderRow["timeInForce"] },
  now: Date,
): ModifyWrite {
  if (request.timeInForce === undefined) return {};

  return {
    timeInForce: merged.timeInForce,
    expiresAt: merged.timeInForce === "DAY" ? nextSessionClose(now) : null,
  };
}

async function entryWrite(
  account: AccountRecord,
  order: OrderRow,
  request: ModifyOrderInput,
  dependencies: OrdersDependencies,
): Promise<ModifyWrite> {
  const merged = placeOrderSchema.parse(mergedPlacement(order, request));
  const context = await loadOrderContext(account, merged, dependencies, {
    id: order.id,
    reservedCash: new Decimal(order.reservedCash.toString()),
  });

  return {
    quantity: quantityToApi(merged.quantity),
    limitPrice: optionalPrice(merged.limitPrice),
    stopPrice: optionalPrice(merged.stopPrice),
    stopLossPrice: optionalPrice(merged.stopLossPrice),
    takeProfitPrice: optionalPrice(merged.takeProfitPrice),
    reservedCash: toApiString(context.validation.reservation, MONEY_PLACES),
    ...timeInForceWrite(request, merged, currentTime(dependencies.accounts)),
  };
}

/**
 * A bracket child closes what the position still holds, so its quantity is capped there and it
 * keeps the zero reservation every closing child carries.
 */
async function childWrite(order: OrderRow, request: ModifyOrderInput): Promise<ModifyWrite> {
  const quantity = request.quantity ?? new Decimal(order.quantity.toString());
  const position = await findPosition(order.accountId, order.symbol);
  const held =
    position === null
      ? new Decimal(0)
      : new Decimal(position.quantity.toString()).absoluteValue();

  if (quantity.greaterThan(held)) throw quantityAbovePosition();

  return {
    quantity: quantityToApi(quantity),
    ...(request.limitPrice === undefined ? {} : { limitPrice: priceToApi(request.limitPrice) }),
    ...(request.stopPrice === undefined ? {} : { stopPrice: priceToApi(request.stopPrice) }),
  };
}

async function settle(
  userId: string,
  order: OrderRow,
  dependencies: OrdersDependencies,
  reservationChanged: boolean,
): Promise<OrderDto> {
  const updated = (await findOrderById(prisma, order.id)) ?? order;

  dependencies.engine.indexAdd(updated);
  publishOrderUpdate(dependencies.accounts, userId, toOrderDto(updated));

  await dependencies.engine.evaluateOrder(updated.id);

  const current = (await findOrderById(prisma, order.id)) ?? updated;

  if (reservationChanged && current.status !== "FILLED") {
    await afterCashChange(userId, dependencies.accounts);
  }

  return toOrderDto(current);
}

/**
 * The whole state machine is decided by one conditional write on `(id, version, resting status)`:
 * a stale client version and an order the engine or the expiry job already decided are told apart
 * by the re-read that follows a write which matched nothing.
 */
export async function modifyOrder(
  userId: string,
  accountId: string,
  orderId: string,
  request: ModifyOrderInput,
  dependencies: OrdersDependencies,
): Promise<ModifyResult> {
  const account = await requireOwnedAccount(userId, accountId);
  const order = await findOrder(account.id, orderId);

  if (order === null) throw orderNotFound();
  if (!isRestingStatus(order.status)) throw orderNotModifiable();

  assertModifiableFields(order, request);

  const write =
    order.role === "ENTRY"
      ? await entryWrite(account, order, request, dependencies)
      : await childWrite(order, request);

  if ((await applyModification(prisma, order.id, request.version, write)) === 0) {
    await resolveWriteConflict(account.id, order.id, request.version, orderNotModifiable);
  }

  return { order: await settle(userId, order, dependencies, write.reservedCash !== undefined) };
}
