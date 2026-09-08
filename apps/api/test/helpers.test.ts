import { describe, expect, it } from "vitest";
import { expectNoMonetaryNumbers } from "./helpers.js";

describe("expectNoMonetaryNumbers", () => {
  it("throws for a nested quote price sent as a JSON number", () => {
    expect(() => expectNoMonetaryNumbers({ quote: { last: 1 } })).toThrowError(/quote\.last/);
  });

  it.each([
    ["open", { open: 1 }],
    ["high", { high: 1 }],
    ["low", { low: 1 }],
    ["close", { close: 1 }],
    ["volume", { volume: 1 }],
    ["last", { last: 1 }],
    ["prevClose", { prevClose: 1 }],
    ["change", { change: 1 }],
    ["changePct", { changePct: 1 }],
    ["size", { size: 1 }],
    ["marketCap", { marketCap: 1 }],
    ["sharesOutstanding", { sharesOutstanding: 1 }],
    ["peRatio", { peRatio: 1 }],
    ["week52High", { week52High: 1 }],
    ["week52Low", { week52Low: 1 }],
    ["beta", { beta: 1 }],
    ["dividendYield", { dividendYield: 1 }],
  ])("throws for the market field %s sent as a JSON number", (_label, body) => {
    expect(() => expectNoMonetaryNumbers(body)).toThrowError(/decimal strings/);
  });

  it("throws for a price inside an array of bars", () => {
    expect(() => expectNoMonetaryNumbers({ bars: [{ close: "1.00" }, { close: 2 }] })).toThrowError(
      /bars\[1\]\.close/,
    );
  });

  it("passes for a non-monetary string field", () => {
    expect(() => expectNoMonetaryNumbers({ exchange: "NASDAQ" })).not.toThrow();
  });

  it("passes for a market response with every numeric field as a string", () => {
    const body = {
      symbol: "TSLA",
      timeframe: "1m",
      hasMore: false,
      bars: [{ time: "2026-09-08T14:30:00.000Z", open: "251.10", close: "251.34", volume: "1200" }],
      quote: { last: "251.34", prevClose: null, change: "2.44", changePct: "0.98" },
      stats: { marketCap: "800000000000.00", beta: "2.05", dividendYield: null },
      status: { status: "open", nextOpenAt: null, nextCloseAt: "2026-09-08T20:00:00.000Z" },
    };

    expect(() => expectNoMonetaryNumbers(body)).not.toThrow();
  });

  it("passes for the boolean flags of a bars response", () => {
    expect(() => expectNoMonetaryNumbers({ hasMore: true, isFinal: false, shortable: true })).not.toThrow();
  });
});
