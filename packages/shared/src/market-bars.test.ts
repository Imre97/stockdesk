import { describe, expect, it } from "vitest";

import { Decimal } from "./decimal.js";
import {
  BARS_PAGE_DEFAULT,
  BARS_PAGE_MAX,
  barDtoSchema,
  barSchema,
  barsQuerySchema,
  barsResponseDtoSchema,
  barsResponseSchema,
} from "./market.js";

const BAR = {
  time: "2026-09-08T14:30:00.000Z",
  open: "251.10",
  high: "251.40",
  low: "251.05",
  close: "251.34",
  volume: "1200",
};

describe("barSchema", () => {
  it("keeps the prices as strings in the dto schema", () => {
    const result = barDtoSchema.parse(BAR);

    expect(result.close).toBe("251.34");
    expect(result.time).toBe(BAR.time);
  });

  it("transforms the prices into Decimal values", () => {
    const result = barSchema.parse(BAR);

    expect(result.open).toBeInstanceOf(Decimal);
    expect(result.volume.equals(new Decimal("1200"))).toBe(true);
  });

  it.each([
    ["a close sent as a JSON number", { ...BAR, close: 251.34 }],
    ["a missing volume", { ...BAR, volume: undefined }],
    ["a time without a time component", { ...BAR, time: "2026-09-08" }],
  ])("rejects %s", (_label, input) => {
    expect(barSchema.safeParse(input).success).toBe(false);
  });
});

describe("barsQuerySchema", () => {
  it("defaults the limit to three hundred", () => {
    expect(barsQuerySchema.parse({})).toEqual({ limit: BARS_PAGE_DEFAULT });
    expect(BARS_PAGE_DEFAULT).toBe(300);
  });

  it("accepts the maximum limit and an end cursor", () => {
    const result = barsQuerySchema.parse({ limit: "1000", end: "2026-09-08T14:30:00.000Z" });

    expect(result.limit).toBe(BARS_PAGE_MAX);
    expect(result.end).toBe("2026-09-08T14:30:00.000Z");
  });

  it.each([
    ["a limit of zero", { limit: "0" }],
    ["a limit of one thousand and one", { limit: "1001" }],
    ["a fractional limit", { limit: "12.5" }],
    ["a malformed end", { end: "2026-09-08" }],
  ])("rejects %s", (_label, input) => {
    expect(barsQuerySchema.safeParse(input).success).toBe(false);
  });

  it("leaves the timeframe to the router, which maps it to INVALID_TIMEFRAME", () => {
    expect(barsQuerySchema.parse({ timeframe: "2m" })).not.toHaveProperty("timeframe");
  });
});

describe("barsResponseSchema", () => {
  it("transforms the bars and keeps the page flag", () => {
    const result = barsResponseSchema.parse({ symbol: "TSLA", timeframe: "1m", bars: [BAR], hasMore: true });

    expect(result.bars[0]?.close).toBeInstanceOf(Decimal);
    expect(result.hasMore).toBe(true);
  });

  it("keeps the bars as strings in the dto schema", () => {
    const result = barsResponseDtoSchema.parse({ symbol: "TSLA", timeframe: "1m", bars: [BAR], hasMore: false });

    expect(result.bars[0]?.close).toBe("251.34");
  });

  it("accepts an empty page", () => {
    const result = barsResponseSchema.parse({ symbol: "TSLA", timeframe: "1D", bars: [], hasMore: false });

    expect(result.bars).toEqual([]);
  });

  it.each([
    ["an unknown timeframe", { symbol: "TSLA", timeframe: "2m", bars: [], hasMore: false }],
    ["a lowercase symbol", { symbol: "tsla", timeframe: "1m", bars: [], hasMore: false }],
    ["a missing page flag", { symbol: "TSLA", timeframe: "1m", bars: [] }],
  ])("rejects %s", (_label, input) => {
    expect(barsResponseSchema.safeParse(input).success).toBe(false);
  });
});
