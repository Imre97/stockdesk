import {
  toApiString,
  type BarMessage,
  type Decimal,
  type QuoteMessage,
  type WsErrorMessage,
} from "@stockdesk/shared";
import type { BarUpdate } from "../modules/market/bar-aggregator.js";
import type { Trade } from "../modules/market/providers/types.js";

const PRICE_PLACES = 4;
const WHOLE_PLACES = 0;

export function quoteMessage(trade: Trade, prevClose: Decimal | null): QuoteMessage {
  return {
    type: "quote",
    symbol: trade.symbol,
    price: toApiString(trade.price, PRICE_PLACES),
    size: toApiString(trade.size, WHOLE_PLACES),
    at: trade.at.toISOString(),
    prevClose: prevClose === null ? null : toApiString(prevClose, PRICE_PLACES),
  };
}

export function barMessage(update: BarUpdate): BarMessage {
  return {
    type: "bar",
    symbol: update.symbol,
    timeframe: update.timeframe,
    bar: {
      time: update.bar.time.toISOString(),
      open: toApiString(update.bar.open, PRICE_PLACES),
      high: toApiString(update.bar.high, PRICE_PLACES),
      low: toApiString(update.bar.low, PRICE_PLACES),
      close: toApiString(update.bar.close, PRICE_PLACES),
      volume: toApiString(update.bar.volume, WHOLE_PLACES),
    },
    isFinal: update.isFinal,
  };
}

export function symbolNotFoundMessage(symbol: string): WsErrorMessage {
  return { type: "error", code: "SYMBOL_NOT_FOUND", symbol };
}

export function subscriptionLimitMessage(): WsErrorMessage {
  return { type: "error", code: "SUBSCRIPTION_LIMIT" };
}
