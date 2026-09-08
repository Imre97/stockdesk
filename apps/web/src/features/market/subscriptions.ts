import type { Timeframe } from "@stockdesk/shared";

import { wsSession } from "../../lib/ws-session";

export function subscribeQuote(symbol: string): () => void {
  return wsSession.subscribe(
    `quotes:${symbol}`,
    { type: "subscribe", channel: "quotes", symbols: [symbol] },
    { type: "unsubscribe", channel: "quotes", symbols: [symbol] },
  );
}

export function subscribeBars(symbol: string, timeframe: Timeframe): () => void {
  return wsSession.subscribe(
    `bars:${symbol}:${timeframe}`,
    { type: "subscribe", channel: "bars", symbol, timeframe },
    { type: "unsubscribe", channel: "bars", symbol, timeframe },
  );
}
