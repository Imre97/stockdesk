import { formatQuantity, type DecimalValue, type SymbolDetail, type Trade, type TradeSide } from "@stockdesk/shared";

import { pnlTone, type PnlTone } from "../accounts/mappers";
import {
  formatChange,
  formatCompactNumber,
  formatPrice,
  formatRatio,
  formatTimestamp,
  formatYield,
} from "./mappers";

const RANGE_SEPARATOR = " – ";

export interface KeyStatRow {
  labelKey: string;
  value: string | null;
}

export interface TradeRowView {
  id: string;
  executedAt: string;
  side: TradeSide;
  sideKey: string;
  quantity: string;
  price: string;
  amount: string;
  amountTone: PnlTone;
  realizedPnl: string | null;
  realizedTone: PnlTone;
}

type Formatter = (value: DecimalValue, locale: string) => string;

function text(value: DecimalValue | null | undefined, locale: string, format: Formatter): string | null {
  return value === null || value === undefined ? null : format(value, locale);
}

function range(
  low: DecimalValue | null | undefined,
  high: DecimalValue | null | undefined,
  locale: string,
): string | null {
  if (low === null || low === undefined || high === null || high === undefined) return null;

  return `${formatPrice(low, locale)}${RANGE_SEPARATOR}${formatPrice(high, locale)}`;
}

export function toKeyStatRows(detail: SymbolDetail, locale: string): KeyStatRow[] {
  const quote = detail.quote;
  const stats = detail.stats;

  return [
    { labelKey: "stats.prevClose", value: text(quote?.prevClose, locale, formatPrice) },
    { labelKey: "stats.open", value: text(quote?.open, locale, formatPrice) },
    { labelKey: "stats.dayRange", value: range(quote?.low, quote?.high, locale) },
    { labelKey: "stats.volume", value: text(quote?.volume, locale, formatCompactNumber) },
    { labelKey: "stats.marketCap", value: text(stats.marketCap, locale, formatCompactNumber) },
    { labelKey: "stats.peRatio", value: text(stats.peRatio, locale, formatRatio) },
    { labelKey: "stats.week52Range", value: range(stats.week52Low, stats.week52High, locale) },
    { labelKey: "stats.beta", value: text(stats.beta, locale, formatRatio) },
    { labelKey: "stats.dividendYield", value: text(stats.dividendYield, locale, formatYield) },
  ];
}

/** The wire carries an unsigned gross amount, so the cash direction comes from the side. */
function signedAmount(trade: Trade): DecimalValue {
  return trade.side === "BUY" ? trade.amount.negated() : trade.amount;
}

export function toTradeRow(trade: Trade, locale: string): TradeRowView {
  const amount = signedAmount(trade);

  return {
    id: trade.id,
    executedAt: formatTimestamp(trade.executedAt, locale),
    side: trade.side,
    sideKey: `trades.side.${trade.side}`,
    quantity: formatQuantity(trade.quantity, locale),
    price: formatPrice(trade.price, locale),
    amount: formatChange(amount, locale),
    amountTone: pnlTone(amount),
    realizedPnl: text(trade.realizedPnl, locale, formatChange),
    realizedTone: trade.realizedPnl === null ? "neutral" : pnlTone(trade.realizedPnl),
  };
}
