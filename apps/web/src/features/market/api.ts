import {
  barsResponseSchema,
  marketStatusSchema,
  symbolDetailResponseSchema,
  symbolSearchResponseSchema,
  tradesResponseSchema,
  type BarsResponse,
  type MarketStatus,
  type SymbolDetail,
  type SymbolSearchResponse,
  type Timeframe,
  type TradesResponse,
} from "@stockdesk/shared";

import { http } from "../../lib/http";

const MARKET_PATH = "/api/v1/market";
const ACCOUNTS_PATH = "/api/v1/accounts";

export interface BarsPageQuery {
  limit?: number;
  end?: string;
}

export interface TradesPageQuery {
  symbol?: string;
  limit?: number;
  cursor?: string;
}

function withQuery(path: string, params: [string, string | undefined][]): string {
  const search = new URLSearchParams();

  for (const [key, value] of params) {
    if (value !== undefined) search.set(key, value);
  }

  const query = search.toString();

  return query === "" ? path : `${path}?${query}`;
}

function upper(symbol: string): string {
  return symbol.toUpperCase();
}

function count(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

export function searchSymbols(q: string, limit?: number): Promise<SymbolSearchResponse> {
  return http<SymbolSearchResponse>(
    withQuery(`${MARKET_PATH}/symbols/search`, [
      ["q", q],
      ["limit", count(limit)],
    ]),
    { method: "GET", parse: (json) => symbolSearchResponseSchema.parse(json) },
  );
}

export async function getSymbol(symbol: string): Promise<SymbolDetail> {
  const response = await http(`${MARKET_PATH}/symbols/${upper(symbol)}`, {
    method: "GET",
    parse: (json) => symbolDetailResponseSchema.parse(json),
  });

  return response.symbol;
}

export function getBars(symbol: string, timeframe: Timeframe, page: BarsPageQuery): Promise<BarsResponse> {
  return http<BarsResponse>(
    withQuery(`${MARKET_PATH}/symbols/${upper(symbol)}/bars`, [
      ["timeframe", timeframe],
      ["limit", count(page.limit)],
      ["end", page.end],
    ]),
    { method: "GET", parse: (json) => barsResponseSchema.parse(json) },
  );
}

export function getMarketStatus(): Promise<MarketStatus> {
  return http<MarketStatus>(`${MARKET_PATH}/status`, {
    method: "GET",
    parse: (json) => marketStatusSchema.parse(json),
  });
}

export function getTrades(accountId: string, page: TradesPageQuery): Promise<TradesResponse> {
  return http<TradesResponse>(
    withQuery(`${ACCOUNTS_PATH}/${accountId}/trades`, [
      ["symbol", page.symbol === undefined ? undefined : upper(page.symbol)],
      ["limit", count(page.limit)],
      ["cursor", page.cursor],
    ]),
    { method: "GET", parse: (json) => tradesResponseSchema.parse(json) },
  );
}
