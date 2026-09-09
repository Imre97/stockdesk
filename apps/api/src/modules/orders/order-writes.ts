import { Prisma } from "@prisma/client";
import type {
  CancelReason,
  OrderRole,
  OrderSide,
  OrderTypeValue,
  TimeInForce,
} from "@stockdesk/shared";
import { RESTING_STATUSES, type OrderClient, type OrderRow } from "./repository.js";

export interface FillWrite {
  avgFillPrice: string;
  filledAt: Date;
  triggeredAt: Date | null;
}

/**
 * Every engine transition carries the same predicate: the row must still be resting. A `count` of
 * zero means the user path, the expiry job or another engine pass already moved it, so the caller
 * skips instead of overwriting a decided order.
 */
export async function markFilled(
  client: OrderClient,
  orderId: string,
  write: FillWrite,
): Promise<number> {
  const { count } = await client.order.updateMany({
    where: { id: orderId, status: { in: [...RESTING_STATUSES] } },
    data: {
      status: "FILLED",
      avgFillPrice: write.avgFillPrice,
      filledAt: write.filledAt,
      reservedCash: "0",
      version: { increment: 1 },
      ...(write.triggeredAt === null ? {} : { triggeredAt: write.triggeredAt }),
    },
  });

  return count;
}

export async function markTriggered(
  client: OrderClient,
  orderId: string,
  at: Date,
): Promise<number> {
  const { count } = await client.order.updateMany({
    where: { id: orderId, status: "OPEN" },
    data: { status: "TRIGGERED", triggeredAt: at, version: { increment: 1 } },
  });

  return count;
}

export async function markRejected(
  client: OrderClient,
  orderId: string,
  rejectReason: string,
): Promise<number> {
  const { count } = await client.order.updateMany({
    where: { id: orderId, status: { in: [...RESTING_STATUSES] } },
    data: { status: "REJECTED", rejectReason, reservedCash: "0", version: { increment: 1 } },
  });

  return count;
}

export async function cancelRestingOrder(
  client: OrderClient,
  orderId: string,
  cancelReason: CancelReason,
  at: Date,
): Promise<number> {
  const { count } = await client.order.updateMany({
    where: { id: orderId, status: { in: [...RESTING_STATUSES] } },
    data: {
      status: "CANCELLED",
      cancelReason,
      cancelledAt: at,
      reservedCash: "0",
      version: { increment: 1 },
    },
  });

  return count;
}

export async function reduceOrderQuantity(
  client: OrderClient,
  orderId: string,
  quantity: string,
): Promise<number> {
  const { count } = await client.order.updateMany({
    where: {
      id: orderId,
      status: { in: [...RESTING_STATUSES] },
      quantity: { gt: new Prisma.Decimal(quantity) },
    },
    data: { quantity, version: { increment: 1 } },
  });

  return count;
}

export interface CreateChildData {
  accountId: string;
  symbol: string;
  side: OrderSide;
  type: OrderTypeValue;
  role: OrderRole;
  quantity: string;
  limitPrice: string | null;
  stopPrice: string | null;
  commission: string;
  parentOrderId: string;
  ocoGroupId: string;
}

export async function createChildOrder(
  client: OrderClient,
  data: CreateChildData,
): Promise<OrderRow> {
  return await client.order.create({
    data: { ...data, status: "OPEN", timeInForce: "GTC", reservedCash: "0" },
  });
}

export interface ModifyWrite {
  quantity?: string;
  limitPrice?: string | null;
  stopPrice?: string | null;
  stopLossPrice?: string | null;
  takeProfitPrice?: string | null;
  timeInForce?: TimeInForce;
  expiresAt?: Date | null;
  reservedCash?: string;
}

/**
 * The user path owns the row through its version (L-18): the resting predicate keeps the engine's
 * decision, and the version keeps a client that read an older row from overwriting a newer one.
 */
export async function applyModification(
  client: OrderClient,
  orderId: string,
  version: number,
  write: ModifyWrite,
): Promise<number> {
  const { count } = await client.order.updateMany({
    where: { id: orderId, version, status: { in: [...RESTING_STATUSES] } },
    data: { ...write, version: { increment: 1 } },
  });

  return count;
}

export async function cancelByUser(
  client: OrderClient,
  orderId: string,
  version: number,
  at: Date,
): Promise<number> {
  const { count } = await client.order.updateMany({
    where: { id: orderId, version, status: { in: [...RESTING_STATUSES] } },
    data: {
      status: "CANCELLED",
      cancelReason: "USER",
      cancelledAt: at,
      reservedCash: "0",
      version: { increment: 1 },
    },
  });

  return count;
}

/**
 * The expiry job owns the transition by status alone (L-18): a row a user cancelled or the engine
 * filled in the meantime is no longer resting, so the same statement that expires the due orders
 * leaves every decided one untouched.
 */
export async function expireDayOrders(
  client: OrderClient,
  orderIds: string[],
  now: Date,
): Promise<number> {
  if (orderIds.length === 0) return 0;

  const { count } = await client.order.updateMany({
    where: {
      id: { in: orderIds },
      timeInForce: "DAY",
      status: { in: [...RESTING_STATUSES] },
      expiresAt: { lte: now },
    },
    data: { status: "EXPIRED", reservedCash: "0", version: { increment: 1 } },
  });

  return count;
}
