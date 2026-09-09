import { Prisma } from "@prisma/client";
import type {
  CancelReason,
  OrderRole,
  OrderSide,
  OrderStatus,
  OrderTypeValue,
  TimeInForce,
} from "@stockdesk/shared";
import { prisma } from "../../lib/prisma.js";

const RESTING_STATUSES: readonly OrderStatus[] = ["OPEN", "TRIGGERED"];
const CLIENT_ORDER_ID_COLUMN = "clientOrderId";

export interface DecimalLike {
  toString: () => string;
}

export interface OrderRow {
  id: string;
  accountId: string;
  clientOrderId: string | null;
  symbol: string;
  side: OrderSide;
  type: OrderTypeValue;
  role: OrderRole;
  status: OrderStatus;
  timeInForce: TimeInForce;
  quantity: DecimalLike;
  limitPrice: DecimalLike | null;
  stopPrice: DecimalLike | null;
  stopLossPrice: DecimalLike | null;
  takeProfitPrice: DecimalLike | null;
  reservedCash: DecimalLike;
  avgFillPrice: DecimalLike | null;
  commission: DecimalLike;
  parentOrderId: string | null;
  ocoGroupId: string | null;
  cancelReason: CancelReason | null;
  rejectReason: string | null;
  version: number;
  expiresAt: Date | null;
  triggeredAt: Date | null;
  filledAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrderData {
  accountId: string;
  clientOrderId: string | null;
  symbol: string;
  side: OrderSide;
  type: OrderTypeValue;
  status: OrderStatus;
  timeInForce: TimeInForce;
  quantity: string;
  limitPrice: string | null;
  stopPrice: string | null;
  stopLossPrice: string | null;
  takeProfitPrice: string | null;
  reservedCash: string;
  commission: string;
  expiresAt: Date | null;
}

export type OrderClient = Pick<Prisma.TransactionClient, "order">;

export interface CreateOrderResult {
  created: boolean;
  order: OrderRow;
}

export function isDuplicateClientOrderIdError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;

  const target = error.meta?.target;
  if (typeof target === "string") return target.includes(CLIENT_ORDER_ID_COLUMN);
  if (Array.isArray(target)) return target.includes(CLIENT_ORDER_ID_COLUMN);

  return false;
}

export async function findByClientOrderId(
  accountId: string,
  clientOrderId: string,
): Promise<OrderRow | null> {
  return await prisma.order.findFirst({ where: { accountId, clientOrderId } });
}

export async function findOrder(accountId: string, orderId: string): Promise<OrderRow | null> {
  return await prisma.order.findFirst({ where: { id: orderId, accountId } });
}

export async function listOpenOrdersForSymbol(
  accountId: string,
  symbol: string,
): Promise<OrderRow[]> {
  return await prisma.order.findMany({
    where: { accountId, symbol, status: { in: [...RESTING_STATUSES] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

/**
 * The unique index on (accountId, clientOrderId) decides the race between two placements that carry
 * the same key: the loser reads the winning row through the top-level client, because a duplicate
 * key inside a transaction leaves that transaction unusable for the recovery read.
 */
export async function createOrder(
  client: OrderClient,
  data: CreateOrderData,
): Promise<CreateOrderResult> {
  const key = data.clientOrderId;

  if (key !== null) {
    const existing = await findByClientOrderId(data.accountId, key);

    if (existing !== null) return { created: false, order: existing };
  }

  try {
    return { created: true, order: await client.order.create({ data }) };
  } catch (error) {
    if (key === null || !isDuplicateClientOrderIdError(error)) throw error;

    const existing = await findByClientOrderId(data.accountId, key);
    if (existing === null) throw error;

    return { created: false, order: existing };
  }
}
