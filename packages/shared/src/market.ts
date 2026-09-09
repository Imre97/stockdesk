import * as z from "zod";

import { symbolSchema } from "./accounts.js";
import { decimalString, decimalStringValue } from "./decimal.js";

export const TIMEFRAMES = ["1m", "5m", "15m", "1h", "1D", "1W", "1M"] as const;

export const SYMBOL_SEARCH_QUERY_MIN = 1;
export const SYMBOL_SEARCH_QUERY_MAX = 20;
export const SYMBOL_SEARCH_LIMIT_DEFAULT = 10;
export const SYMBOL_SEARCH_LIMIT_MAX = 25;
export const BARS_PAGE_DEFAULT = 300;
export const BARS_PAGE_MAX = 1000;
export const TRADES_PAGE_DEFAULT = 50;
export const TRADES_PAGE_MAX = 200;

export const MARKET_ERROR_CODES = [
  "SYMBOL_NOT_FOUND",
  "INVALID_TIMEFRAME",
  "PROVIDER_UNAVAILABLE",
  "SUBSCRIPTION_LIMIT",
] as const;

export type MarketErrorCode = (typeof MARKET_ERROR_CODES)[number];

export const timeframeSchema = z.enum(TIMEFRAMES);

export const symbolSearchQuerySchema = z.object({
  q: z.string().trim().min(SYMBOL_SEARCH_QUERY_MIN).max(SYMBOL_SEARCH_QUERY_MAX),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(SYMBOL_SEARCH_LIMIT_MAX)
    .default(SYMBOL_SEARCH_LIMIT_DEFAULT),
});

export const symbolSearchResultSchema = z.object({
  symbol: symbolSchema,
  name: z.string(),
  exchange: z.string(),
});

export const symbolSearchResponseSchema = z.object({ results: z.array(symbolSearchResultSchema) });

export const quoteDtoSchema = z.object({
  last: decimalStringValue,
  prevClose: decimalStringValue.nullable(),
  open: decimalStringValue.nullable(),
  high: decimalStringValue.nullable(),
  low: decimalStringValue.nullable(),
  volume: decimalStringValue.nullable(),
  change: decimalStringValue.nullable(),
  changePct: decimalStringValue.nullable(),
  at: z.iso.datetime(),
});

export const quoteSchema = quoteDtoSchema.extend({
  last: decimalString,
  prevClose: decimalString.nullable(),
  open: decimalString.nullable(),
  high: decimalString.nullable(),
  low: decimalString.nullable(),
  volume: decimalString.nullable(),
  change: decimalString.nullable(),
  changePct: decimalString.nullable(),
});

export const symbolStatsDtoSchema = z.object({
  marketCap: decimalStringValue.nullable(),
  sharesOutstanding: decimalStringValue.nullable(),
  peRatio: decimalStringValue.nullable(),
  week52High: decimalStringValue.nullable(),
  week52Low: decimalStringValue.nullable(),
  beta: decimalStringValue.nullable(),
  dividendYield: decimalStringValue.nullable(),
});

export const symbolStatsSchema = symbolStatsDtoSchema.extend({
  marketCap: decimalString.nullable(),
  sharesOutstanding: decimalString.nullable(),
  peRatio: decimalString.nullable(),
  week52High: decimalString.nullable(),
  week52Low: decimalString.nullable(),
  beta: decimalString.nullable(),
  dividendYield: decimalString.nullable(),
});

export const symbolDetailDtoSchema = z.object({
  symbol: symbolSchema,
  name: z.string(),
  exchange: z.string(),
  currency: z.string(),
  shortable: z.boolean(),
  fractionable: z.boolean(),
  industry: z.string().nullable(),
  logoUrl: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  quote: quoteDtoSchema.nullable(),
  stats: symbolStatsDtoSchema,
});

export const symbolDetailSchema = symbolDetailDtoSchema.extend({
  quote: quoteSchema.nullable(),
  stats: symbolStatsSchema,
});

export const symbolDetailResponseSchema = z.object({ symbol: symbolDetailSchema });

export const barDtoSchema = z.object({
  time: z.iso.datetime(),
  open: decimalStringValue,
  high: decimalStringValue,
  low: decimalStringValue,
  close: decimalStringValue,
  volume: decimalStringValue,
});

export const barSchema = barDtoSchema.extend({
  open: decimalString,
  high: decimalString,
  low: decimalString,
  close: decimalString,
  volume: decimalString,
});

export const barsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(BARS_PAGE_MAX).default(BARS_PAGE_DEFAULT),
  end: z.iso.datetime().optional(),
});

export const barsResponseDtoSchema = z.object({
  symbol: symbolSchema,
  timeframe: timeframeSchema,
  bars: z.array(barDtoSchema),
  hasMore: z.boolean(),
});

export const barsResponseSchema = barsResponseDtoSchema.extend({ bars: z.array(barSchema) });

export const marketStatusValueSchema = z.enum(["open", "closed", "pre", "after"]);

export const marketStatusSchema = z.object({
  status: marketStatusValueSchema,
  nextOpenAt: z.iso.datetime().nullable(),
  nextCloseAt: z.iso.datetime().nullable(),
});

export const tradeSideSchema = z.enum(["BUY", "SELL"]);

export const tradeDtoSchema = z.object({
  id: z.string().min(1),
  orderId: z.string().min(1),
  accountId: z.string().min(1),
  symbol: symbolSchema,
  side: tradeSideSchema,
  quantity: decimalStringValue,
  price: decimalStringValue,
  amount: decimalStringValue,
  commission: decimalStringValue,
  realizedPnl: decimalStringValue.nullable(),
  executedAt: z.iso.datetime(),
});

export const tradeSchema = tradeDtoSchema.extend({
  quantity: decimalString,
  price: decimalString,
  amount: decimalString,
  commission: decimalString,
  realizedPnl: decimalString.nullable(),
});

export const tradesQuerySchema = z.object({
  symbol: symbolSchema.optional(),
  limit: z.coerce.number().int().min(1).max(TRADES_PAGE_MAX).default(TRADES_PAGE_DEFAULT),
  cursor: z.string().min(1).optional(),
});

export const tradesResponseDtoSchema = z.object({
  trades: z.array(tradeDtoSchema),
  nextCursor: z.string().nullable(),
});

export const tradesResponseSchema = tradesResponseDtoSchema.extend({ trades: z.array(tradeSchema) });

export type Timeframe = z.infer<typeof timeframeSchema>;
export type SymbolSearchQueryRequest = z.input<typeof symbolSearchQuerySchema>;
export type SymbolSearchQuery = z.output<typeof symbolSearchQuerySchema>;
export type SymbolSearchResult = z.infer<typeof symbolSearchResultSchema>;
export type SymbolSearchResponse = z.infer<typeof symbolSearchResponseSchema>;
export type QuoteDto = z.input<typeof quoteSchema>;
export type Quote = z.output<typeof quoteSchema>;
export type SymbolStatsDto = z.input<typeof symbolStatsSchema>;
export type SymbolStats = z.output<typeof symbolStatsSchema>;
export type SymbolDetailDto = z.input<typeof symbolDetailSchema>;
export type SymbolDetail = z.output<typeof symbolDetailSchema>;
export type SymbolDetailResponseDto = z.input<typeof symbolDetailResponseSchema>;
export type SymbolDetailResponse = z.output<typeof symbolDetailResponseSchema>;
export type BarDto = z.input<typeof barSchema>;
export type Bar = z.output<typeof barSchema>;
export type BarsQueryRequest = z.input<typeof barsQuerySchema>;
export type BarsQuery = z.output<typeof barsQuerySchema>;
export type BarsResponseDto = z.input<typeof barsResponseSchema>;
export type BarsResponse = z.output<typeof barsResponseSchema>;
export type MarketStatusValue = z.infer<typeof marketStatusValueSchema>;
export type MarketStatus = z.infer<typeof marketStatusSchema>;
export type TradeSide = z.infer<typeof tradeSideSchema>;
export type TradeDto = z.input<typeof tradeSchema>;
export type Trade = z.output<typeof tradeSchema>;
export type TradesQueryRequest = z.input<typeof tradesQuerySchema>;
export type TradesQuery = z.output<typeof tradesQuerySchema>;
export type TradesResponseDto = z.input<typeof tradesResponseSchema>;
export type TradesResponse = z.output<typeof tradesResponseSchema>;
