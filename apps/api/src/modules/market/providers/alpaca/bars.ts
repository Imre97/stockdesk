import type { Decimal, Timeframe } from "@stockdesk/shared";

import { parseJsonWithDecimals } from "../decimal-json.js";
import type { Bar, BarsQuery } from "../types.js";
import type { AlpacaClient } from "./client.js";

const BAR_DECIMAL_KEYS: ReadonlySet<string> = new Set(["o", "h", "l", "c", "v"]);
const START_WINDOW_FACTOR = 3;

export const ALPACA_TIMEFRAMES: Record<Timeframe, string> = {
  "1m": "1Min",
  "5m": "5Min",
  "15m": "15Min",
  "1h": "1Hour",
  "1D": "1Day",
  "1W": "1Week",
  "1M": "1Month",
};

export const TIMEFRAME_DURATION_MS: Record<Timeframe, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "1D": 86_400_000,
  "1W": 604_800_000,
  "1M": 2_592_000_000,
};

interface RawBar {
  t: string;
  o: Decimal;
  h: Decimal;
  l: Decimal;
  c: Decimal;
  v: Decimal;
}

interface BarsPage {
  bars?: Record<string, RawBar[] | undefined> | null;
  next_page_token?: string | null;
}

interface Page {
  bars: Bar[];
  nextPageToken: string | null;
}

function derivedStart(query: BarsQuery): Date {
  const windowMs = query.limit * TIMEFRAME_DURATION_MS[query.timeframe] * START_WINDOW_FACTOR;

  return new Date(query.end.getTime() - windowMs);
}

function toBar(query: BarsQuery, raw: RawBar): Bar {
  return {
    symbol: query.symbol,
    timeframe: query.timeframe,
    time: new Date(raw.t),
    open: raw.o,
    high: raw.h,
    low: raw.l,
    close: raw.c,
    volume: raw.v,
  };
}

async function requestPage(
  client: AlpacaClient,
  query: BarsQuery,
  start: Date,
  pageToken: string | null,
): Promise<Page> {
  const search: Record<string, string> = {
    symbols: query.symbol,
    timeframe: ALPACA_TIMEFRAMES[query.timeframe],
    start: start.toISOString(),
    end: query.end.toISOString(),
    limit: String(query.limit),
    feed: client.feed,
    adjustment: "split",
    sort: "asc",
  };

  if (pageToken !== null) search.page_token = pageToken;

  const text = await client.getData("/v2/stocks/bars", search);
  const payload = parseJsonWithDecimals(text, BAR_DECIMAL_KEYS) as BarsPage;
  const raw = payload.bars?.[query.symbol];
  const bars = Array.isArray(raw) ? raw.map((entry) => toBar(query, entry)) : [];
  const nextPageToken = payload.next_page_token;

  return { bars, nextPageToken: typeof nextPageToken === "string" ? nextPageToken : null };
}

export async function fetchAlpacaBars(client: AlpacaClient, query: BarsQuery): Promise<Bar[]> {
  const hasExplicitStart = query.start !== undefined;
  const start = query.start ?? derivedStart(query);
  const collected: Bar[] = [];
  let pageToken: string | null = null;

  do {
    const page = await requestPage(client, query, start, pageToken);
    collected.push(...page.bars);
    pageToken = page.nextPageToken;

    if (hasExplicitStart && collected.length >= query.limit) break;
  } while (pageToken !== null);

  return hasExplicitStart ? collected.slice(0, query.limit) : collected.slice(-query.limit);
}
