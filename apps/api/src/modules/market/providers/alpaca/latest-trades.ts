import type { Decimal } from "@stockdesk/shared";

import { parseJsonWithDecimals } from "../decimal-json.js";
import type { Trade } from "../types.js";
import type { AlpacaClient } from "./client.js";
import { alpacaTimestampToDate } from "./timestamps.js";

const TRADE_DECIMAL_KEYS: ReadonlySet<string> = new Set(["p", "s"]);

interface RawLatestTrade {
  t: string;
  p: Decimal;
  s: Decimal;
}

interface LatestTradesPayload {
  trades?: Record<string, RawLatestTrade | undefined> | null;
}

export async function fetchAlpacaLatestTrades(
  client: AlpacaClient,
  symbols: string[],
): Promise<Trade[]> {
  if (symbols.length === 0) return [];

  const text = await client.getData("/v2/stocks/trades/latest", {
    symbols: symbols.join(","),
    feed: client.feed,
  });
  const payload = parseJsonWithDecimals(text, TRADE_DECIMAL_KEYS) as LatestTradesPayload;
  const trades = payload.trades;

  if (trades === undefined || trades === null) return [];

  return Object.entries(trades).flatMap(([symbol, raw]) =>
    raw === undefined
      ? []
      : [{ symbol, price: raw.p, size: raw.s, at: alpacaTimestampToDate(raw.t) }],
  );
}
