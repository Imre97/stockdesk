import { describe, expect, it } from "vitest";

import type { ErrorCode } from "./api-error.js";
import {
  MARKET_ERROR_CODES,
  SYMBOL_SEARCH_LIMIT_DEFAULT,
  SYMBOL_SEARCH_LIMIT_MAX,
  SYMBOL_SEARCH_QUERY_MAX,
  TIMEFRAMES,
  marketStatusSchema,
  marketStatusValueSchema,
  symbolSearchQuerySchema,
  symbolSearchResponseSchema,
  symbolSearchResultSchema,
  timeframeSchema,
} from "./market.js";

describe("timeframeSchema", () => {
  it("lists exactly the timeframes from the module spec", () => {
    expect(TIMEFRAMES).toEqual(["1m", "5m", "15m", "1h", "1D", "1W", "1M"]);
  });

  it.each(TIMEFRAMES.map((timeframe) => [timeframe]))("accepts %s", (timeframe) => {
    expect(timeframeSchema.parse(timeframe)).toBe(timeframe);
  });

  it.each([["2m"], ["1M "], ["1d"], [""], ["1Min"]])("rejects %s", (timeframe) => {
    expect(timeframeSchema.safeParse(timeframe).success).toBe(false);
  });
});

describe("MARKET_ERROR_CODES", () => {
  it("lists exactly the codes from the module spec", () => {
    expect(MARKET_ERROR_CODES).toEqual([
      "SYMBOL_NOT_FOUND",
      "INVALID_TIMEFRAME",
      "PROVIDER_UNAVAILABLE",
      "SUBSCRIPTION_LIMIT",
    ]);
  });

  it("joins the shared ErrorCode union", () => {
    const codes: ErrorCode[] = [...MARKET_ERROR_CODES];

    for (const code of MARKET_ERROR_CODES) {
      expect(codes).toContain(code);
    }
  });
});

describe("symbolSearchQuerySchema", () => {
  it("defaults the limit to ten", () => {
    expect(symbolSearchQuerySchema.parse({ q: "tsl" })).toEqual({ q: "tsl", limit: SYMBOL_SEARCH_LIMIT_DEFAULT });
    expect(SYMBOL_SEARCH_LIMIT_DEFAULT).toBe(10);
  });

  it("trims the query", () => {
    expect(symbolSearchQuerySchema.parse({ q: "  tsl  " }).q).toBe("tsl");
  });

  it("coerces the limit to an integer", () => {
    const result = symbolSearchQuerySchema.parse({ q: "tsl", limit: "25" });

    expect(result.limit).toBe(SYMBOL_SEARCH_LIMIT_MAX);
    expect(typeof result.limit).toBe("number");
  });

  it("accepts a query of twenty characters", () => {
    expect(symbolSearchQuerySchema.safeParse({ q: "a".repeat(SYMBOL_SEARCH_QUERY_MAX) }).success).toBe(true);
  });

  it.each([
    ["an empty query", { q: "" }],
    ["a query of only spaces", { q: "   " }],
    ["a query of twenty-one characters", { q: "a".repeat(21) }],
    ["a missing query", {}],
    ["a limit of zero", { q: "tsl", limit: "0" }],
    ["a limit of twenty-six", { q: "tsl", limit: "26" }],
    ["a fractional limit", { q: "tsl", limit: "1.5" }],
    ["a non-numeric limit", { q: "tsl", limit: "ten" }],
  ])("rejects %s", (_label, input) => {
    expect(symbolSearchQuerySchema.safeParse(input).success).toBe(false);
  });
});

describe("symbolSearchResultSchema", () => {
  it("accepts a result row", () => {
    expect(symbolSearchResultSchema.parse({ symbol: "TSLA", name: "Tesla, Inc.", exchange: "NASDAQ" })).toEqual({
      symbol: "TSLA",
      name: "Tesla, Inc.",
      exchange: "NASDAQ",
    });
  });

  it("rejects a lowercase symbol", () => {
    expect(symbolSearchResultSchema.safeParse({ symbol: "tsla", name: "Tesla", exchange: "NASDAQ" }).success).toBe(
      false,
    );
  });

  it("accepts an empty result list", () => {
    expect(symbolSearchResponseSchema.parse({ results: [] }).results).toEqual([]);
  });

  it("accepts a populated result list", () => {
    const result = symbolSearchResponseSchema.parse({
      results: [{ symbol: "TSLA", name: "Tesla, Inc.", exchange: "NASDAQ" }],
    });

    expect(result.results).toHaveLength(1);
  });
});

describe("marketStatusSchema", () => {
  it.each([["open"], ["closed"], ["pre"], ["after"]])("accepts the status %s", (status) => {
    expect(marketStatusValueSchema.parse(status)).toBe(status);
  });

  it.each([["OPEN"], ["holiday"], [""]])("rejects the status %s", (status) => {
    expect(marketStatusValueSchema.safeParse(status).success).toBe(false);
  });

  it("accepts a status with both boundaries", () => {
    const result = marketStatusSchema.parse({
      status: "open",
      nextOpenAt: "2026-09-09T13:30:00.000Z",
      nextCloseAt: "2026-09-08T20:00:00.000Z",
    });

    expect(result.status).toBe("open");
    expect(result.nextCloseAt).toBe("2026-09-08T20:00:00.000Z");
  });

  it("accepts a status without boundaries", () => {
    const result = marketStatusSchema.parse({ status: "open", nextOpenAt: null, nextCloseAt: null });

    expect(result.nextOpenAt).toBeNull();
    expect(result.nextCloseAt).toBeNull();
  });

  it("rejects a status with a malformed boundary", () => {
    const result = marketStatusSchema.safeParse({ status: "open", nextOpenAt: "2026-09-09", nextCloseAt: null });

    expect(result.success).toBe(false);
  });
});
