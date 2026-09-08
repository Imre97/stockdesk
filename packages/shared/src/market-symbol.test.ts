import { describe, expect, it } from "vitest";

import { Decimal } from "./decimal.js";
import {
  quoteDtoSchema,
  quoteSchema,
  symbolDetailDtoSchema,
  symbolDetailResponseSchema,
  symbolDetailSchema,
  symbolStatsDtoSchema,
  symbolStatsSchema,
} from "./market.js";

const QUOTE = {
  last: "251.3400",
  prevClose: "248.9000",
  open: "249.5000",
  high: "252.0000",
  low: "248.1000",
  volume: "51234000",
  change: "2.4400",
  changePct: "0.98",
  at: "2026-09-08T14:30:01.123Z",
};

const STATS = {
  marketCap: "800000000000.00",
  sharesOutstanding: "3180000000",
  peRatio: "65.20",
  week52High: "299.2900",
  week52Low: "138.8000",
  beta: "2.05",
  dividendYield: null,
};

const SYMBOL_DETAIL = {
  symbol: "TSLA",
  name: "Tesla, Inc.",
  exchange: "NASDAQ",
  currency: "USD",
  shortable: true,
  fractionable: true,
  industry: "Automobiles",
  logoUrl: "https://logos.example.com/tsla.png",
  websiteUrl: "https://tesla.com",
  quote: QUOTE,
  stats: STATS,
};

describe("quoteDtoSchema", () => {
  it("keeps every numeric field as a string", () => {
    const result = quoteDtoSchema.parse(QUOTE);

    expect(result.last).toBe("251.3400");
    expect(typeof result.volume).toBe("string");
  });

  it("accepts null for every field except last", () => {
    const result = quoteDtoSchema.parse({
      last: "251.3400",
      prevClose: null,
      open: null,
      high: null,
      low: null,
      volume: null,
      change: null,
      changePct: null,
      at: QUOTE.at,
    });

    expect(result.prevClose).toBeNull();
  });

  it.each([
    ["a missing last price", { ...QUOTE, last: undefined }],
    ["a null last price", { ...QUOTE, last: null }],
    ["a malformed decimal string", { ...QUOTE, last: "1e5" }],
    ["a numeric last price", { ...QUOTE, last: 251.34 }],
    ["a numeric volume", { ...QUOTE, volume: 51234000 }],
    ["a date without a time component", { ...QUOTE, at: "2026-09-08" }],
  ])("rejects %s", (_label, input) => {
    expect(quoteDtoSchema.safeParse(input).success).toBe(false);
  });
});

describe("quoteSchema", () => {
  it("transforms every price string into a Decimal", () => {
    const result = quoteSchema.parse(QUOTE);

    expect(result.last).toBeInstanceOf(Decimal);
    expect(result.last.equals(new Decimal("251.34"))).toBe(true);
    expect(result.prevClose).toBeInstanceOf(Decimal);
    expect(result.changePct?.equals(new Decimal("0.98"))).toBe(true);
    expect(result.at).toBe(QUOTE.at);
  });

  it("keeps a null field null", () => {
    const result = quoteSchema.parse({ ...QUOTE, change: null, changePct: null });

    expect(result.change).toBeNull();
    expect(result.changePct).toBeNull();
  });

  it("rejects a price sent as a JSON number", () => {
    expect(quoteSchema.safeParse({ ...QUOTE, open: 249.5 }).success).toBe(false);
  });
});

describe("symbolStatsSchema", () => {
  it("keeps the statistics as strings on the wire", () => {
    const result = symbolStatsDtoSchema.parse(STATS);

    expect(result.marketCap).toBe("800000000000.00");
    expect(result.dividendYield).toBeNull();
  });

  it("transforms the statistics into Decimal values", () => {
    const result = symbolStatsSchema.parse(STATS);

    expect(result.marketCap).toBeInstanceOf(Decimal);
    expect(result.sharesOutstanding?.equals(new Decimal("3180000000"))).toBe(true);
    expect(result.dividendYield).toBeNull();
  });

  it("accepts statistics that are entirely unknown", () => {
    const result = symbolStatsSchema.parse({
      marketCap: null,
      sharesOutstanding: null,
      peRatio: null,
      week52High: null,
      week52Low: null,
      beta: null,
      dividendYield: null,
    });

    expect(result.beta).toBeNull();
  });

  it("rejects a market cap sent as a JSON number", () => {
    expect(symbolStatsSchema.safeParse({ ...STATS, marketCap: 800000000000 }).success).toBe(false);
  });
});

describe("symbolDetailSchema", () => {
  it("transforms the nested quote and statistics", () => {
    const result = symbolDetailSchema.parse(SYMBOL_DETAIL);

    expect(result.symbol).toBe("TSLA");
    expect(result.shortable).toBe(true);
    expect(result.fractionable).toBe(true);
    expect(result.quote?.last).toBeInstanceOf(Decimal);
    expect(result.stats.peRatio?.equals(new Decimal("65.2"))).toBe(true);
  });

  it("parses a detail without a quote", () => {
    const result = symbolDetailSchema.parse({ ...SYMBOL_DETAIL, quote: null });

    expect(result.quote).toBeNull();
  });

  it("parses a detail without profile fields", () => {
    const result = symbolDetailSchema.parse({
      ...SYMBOL_DETAIL,
      industry: null,
      logoUrl: null,
      websiteUrl: null,
    });

    expect(result.industry).toBeNull();
    expect(result.logoUrl).toBeNull();
    expect(result.websiteUrl).toBeNull();
  });

  it("keeps the numeric fields as strings in the dto schema", () => {
    const result = symbolDetailDtoSchema.parse(SYMBOL_DETAIL);

    expect(result.quote?.last).toBe("251.3400");
    expect(result.stats.week52High).toBe("299.2900");
  });

  it("accepts a detail response envelope", () => {
    const result = symbolDetailResponseSchema.parse({ symbol: SYMBOL_DETAIL });

    expect(result.symbol.name).toBe("Tesla, Inc.");
  });

  it.each([
    ["a lowercase symbol", { ...SYMBOL_DETAIL, symbol: "tsla" }],
    ["a missing shortable flag", { ...SYMBOL_DETAIL, shortable: undefined }],
    ["a missing statistics object", { ...SYMBOL_DETAIL, stats: undefined }],
    ["a quote price sent as a JSON number", { ...SYMBOL_DETAIL, quote: { ...QUOTE, last: 251.34 } }],
  ])("rejects %s", (_label, input) => {
    expect(symbolDetailSchema.safeParse(input).success).toBe(false);
  });
});
