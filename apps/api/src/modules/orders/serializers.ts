import {
  toApiString,
  type OrderDto,
  type PositionRecordDto,
  type TradeDto,
} from "@stockdesk/shared";
import type { PositionRecord } from "./positions-repository.js";
import type { DecimalLike, OrderRow } from "./repository.js";

const QUANTITY_PLACES = 6;
const PRICE_PLACES = 4;
const MONEY_PLACES = 2;

export interface TradeRow {
  id: string;
  orderId: string;
  accountId: string;
  symbol: string;
  side: OrderRow["side"];
  quantity: DecimalLike;
  price: DecimalLike;
  amount: DecimalLike;
  commission: DecimalLike;
  realizedPnl: DecimalLike | null;
  executedAt: Date;
}

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

export function toTradeDto(row: TradeRow): TradeDto {
  return {
    id: row.id,
    orderId: row.orderId,
    accountId: row.accountId,
    symbol: row.symbol,
    side: row.side,
    quantity: toApiString(row.quantity.toString(), QUANTITY_PLACES),
    price: toApiString(row.price.toString(), PRICE_PLACES),
    amount: money(row.amount),
    commission: money(row.commission),
    realizedPnl: row.realizedPnl === null ? null : money(row.realizedPnl),
    executedAt: row.executedAt.toISOString(),
  };
}

export function toPositionRecordDto(record: PositionRecord): PositionRecordDto {
  return {
    id: record.id,
    accountId: record.accountId,
    symbol: record.symbol,
    quantity: toApiString(record.quantity.toString(), QUANTITY_PLACES),
    averageCost: toApiString(record.averageCost.toString(), PRICE_PLACES),
    realizedPnl: money(record.realizedPnl),
    openedAt: record.openedAt.toISOString(),
    closedAt: timestamp(record.closedAt),
    updatedAt: record.updatedAt.toISOString(),
  };
}
