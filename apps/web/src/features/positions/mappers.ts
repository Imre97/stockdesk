import { Decimal, type DecimalValue, type Position } from "@stockdesk/shared";

import { toPositionViewModel, type PositionViewModel } from "../dashboard/mappers";
import type { QuoteTick } from "../market/mappers";

const MONEY_DECIMAL_PLACES = 2;
const PERCENT_MULTIPLIER = 100;
const ZERO = new Decimal(0);

export interface PositionEntry {
  symbol: string;
  quantity: DecimalValue;
  averageCost: DecimalValue;
  realizedPnl: DecimalValue;
}

function roundMoney(value: DecimalValue): DecimalValue {
  return value.toDecimalPlaces(MONEY_DECIMAL_PLACES, Decimal.ROUND_HALF_EVEN);
}

function percentOf(value: DecimalValue, base: DecimalValue): DecimalValue {
  if (base.isZero()) return ZERO;

  return roundMoney(value.dividedBy(base).times(PERCENT_MULTIPLIER));
}

export function toPositionEntry(source: PositionEntry): PositionEntry {
  return {
    symbol: source.symbol,
    quantity: source.quantity,
    averageCost: source.averageCost,
    realizedPnl: source.realizedPnl,
  };
}

export function toValuedPosition(entry: PositionEntry, quote: QuoteTick | null): Position {
  const lastPrice = quote?.price ?? entry.averageCost;
  const prevClose = quote?.prevClose ?? null;
  const unrealizedPnl = roundMoney(lastPrice.minus(entry.averageCost).times(entry.quantity));
  const dailyChange = prevClose === null ? ZERO : roundMoney(lastPrice.minus(prevClose).times(entry.quantity));

  return {
    symbol: entry.symbol,
    quantity: entry.quantity,
    averageCost: entry.averageCost,
    lastPrice,
    marketValue: roundMoney(entry.quantity.times(lastPrice)),
    unrealizedPnl,
    unrealizedPnlPct: percentOf(unrealizedPnl, entry.averageCost.times(entry.quantity).absoluteValue()),
    dailyChange,
    dailyChangePct:
      prevClose === null ? ZERO : percentOf(dailyChange, prevClose.times(entry.quantity).absoluteValue()),
    realizedPnl: entry.realizedPnl,
  };
}

export function toPositionRow(
  entry: PositionEntry,
  quote: QuoteTick | null,
  locale: string,
): PositionViewModel {
  return toPositionViewModel(toValuedPosition(entry, quote), locale);
}
