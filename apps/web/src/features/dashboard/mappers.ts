import type { UTCTimestamp } from "lightweight-charts";
import {
  formatMoney,
  formatPercent,
  formatQuantity,
  formatSignedMoney,
  type EquityPoint,
  type Position,
} from "@stockdesk/shared";

import { pnlTone, type PnlTone } from "../accounts/mappers";

const MILLISECONDS_PER_SECOND = 1000;

export interface EquitySeriesPoint {
  time: UTCTimestamp;
  value: number;
}

export interface PositionViewModel {
  symbol: string;
  quantity: string;
  averageCost: string;
  lastPrice: string;
  marketValue: string;
  unrealizedPnl: string;
  unrealizedPnlPct: string;
  unrealizedTone: PnlTone;
  dailyChange: string;
  dailyChangePct: string;
  dailyTone: PnlTone;
}

/**
 * The only sanctioned Decimal to number conversion in the web app: Lightweight Charts
 * accepts plain numbers and unix seconds, and nothing downstream does money math on them.
 */
export function toEquitySeries(points: EquityPoint[]): EquitySeriesPoint[] {
  return points.map((point) => ({
    time: Math.trunc(new Date(point.at).getTime() / MILLISECONDS_PER_SECOND) as UTCTimestamp,
    value: point.equity.toNumber(),
  }));
}

export function toPositionViewModel(position: Position, locale: string): PositionViewModel {
  return {
    symbol: position.symbol,
    quantity: formatQuantity(position.quantity, locale),
    averageCost: formatMoney(position.averageCost, locale),
    lastPrice: formatMoney(position.lastPrice, locale),
    marketValue: formatMoney(position.marketValue, locale),
    unrealizedPnl: formatSignedMoney(position.unrealizedPnl, locale),
    unrealizedPnlPct: formatPercent(position.unrealizedPnlPct, locale),
    unrealizedTone: pnlTone(position.unrealizedPnl),
    dailyChange: formatSignedMoney(position.dailyChange, locale),
    dailyChangePct: formatPercent(position.dailyChangePct, locale),
    dailyTone: pnlTone(position.dailyChange),
  };
}
