import { toApiString, type OrderDto } from "@stockdesk/shared";
import type { DecimalLike, OrderRow } from "./repository.js";

const QUANTITY_PLACES = 6;
const PRICE_PLACES = 4;
const MONEY_PLACES = 2;

function money(value: DecimalLike): string {
  return toApiString(value.toString(), MONEY_PLACES);
}

function price(value: DecimalLike | null): string | null {
  return value === null ? null : toApiString(value.toString(), PRICE_PLACES);
}

function timestamp(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export function toOrderDto(row: OrderRow): OrderDto {
  return {
    id: row.id,
    accountId: row.accountId,
    clientOrderId: row.clientOrderId,
    symbol: row.symbol,
    side: row.side,
    type: row.type,
    role: row.role,
    status: row.status,
    timeInForce: row.timeInForce,
    quantity: toApiString(row.quantity.toString(), QUANTITY_PLACES),
    limitPrice: price(row.limitPrice),
    stopPrice: price(row.stopPrice),
    stopLossPrice: price(row.stopLossPrice),
    takeProfitPrice: price(row.takeProfitPrice),
    reservedCash: money(row.reservedCash),
    avgFillPrice: price(row.avgFillPrice),
    commission: money(row.commission),
    parentOrderId: row.parentOrderId,
    ocoGroupId: row.ocoGroupId,
    cancelReason: row.cancelReason,
    rejectReason: row.rejectReason,
    version: row.version,
    expiresAt: timestamp(row.expiresAt),
    triggeredAt: timestamp(row.triggeredAt),
    filledAt: timestamp(row.filledAt),
    cancelledAt: timestamp(row.cancelledAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
