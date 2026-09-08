import { Decimal } from "@stockdesk/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const httpModule = vi.hoisted(() => ({ http: vi.fn() }));

vi.mock("../../lib/http", () => httpModule);

import * as api from "./api";

interface ParseOptions {
  parse: (json: unknown) => unknown;
}

const calls: string[] = [];

function respondWith(payload: unknown): void {
  httpModule.http.mockImplementation((path: string, options: ParseOptions) => {
    calls.push(path);

    return Promise.resolve(options.parse(payload));
  });
}

const SEARCH_PAYLOAD = { results: [{ symbol: "TSLA", name: "Tesla, Inc.", exchange: "NASDAQ" }] };

const SYMBOL_PAYLOAD = {
  symbol: {
    symbol: "TSLA",
    name: "Tesla, Inc.",
    exchange: "NASDAQ",
    currency: "USD",
    shortable: true,
    fractionable: true,
    industry: "Automobiles",
    logoUrl: null,
    websiteUrl: null,
    quote: {
      last: "251.3400",
      prevClose: "248.9000",
      open: "249.5000",
      high: "252.0000",
      low: "248.1000",
      volume: "51234000",
      change: "2.4400",
      changePct: "0.98",
      at: "2026-09-08T14:30:01.123Z",
    },
    stats: {
      marketCap: "800000000000.00",
      sharesOutstanding: "3180000000",
      peRatio: "65.20",
      week52High: "299.2900",
      week52Low: "138.8000",
      beta: "2.05",
      dividendYield: null,
    },
  },
};

const BARS_PAYLOAD = {
  symbol: "TSLA",
  timeframe: "1m",
  bars: [
    {
      time: "2026-09-08T14:30:00.000Z",
      open: "251.10",
      high: "251.40",
      low: "251.05",
      close: "251.34",
      volume: "1200",
    },
  ],
  hasMore: true,
};

const STATUS_PAYLOAD = {
  status: "open",
  nextOpenAt: null,
  nextCloseAt: "2026-09-08T20:00:00.000Z",
};

const TRADES_PAYLOAD = { trades: [], nextCursor: null };

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
});

describe("searchSymbols", () => {
  it("queries the search endpoint and parses the results", async () => {
    respondWith(SEARCH_PAYLOAD);

    const response = await api.searchSymbols("tsl");

    expect(calls[0]).toBe("/api/v1/market/symbols/search?q=tsl");
    expect(response.results[0]?.symbol).toBe("TSLA");
  });

  it("passes an explicit limit", async () => {
    respondWith(SEARCH_PAYLOAD);

    await api.searchSymbols("tsl", 5);

    expect(calls[0]).toBe("/api/v1/market/symbols/search?q=tsl&limit=5");
  });
});

describe("getSymbol", () => {
  it("upper-cases the symbol and parses the detail into Decimal values", async () => {
    respondWith(SYMBOL_PAYLOAD);

    const detail = await api.getSymbol("tsla");

    expect(calls[0]).toBe("/api/v1/market/symbols/TSLA");
    expect(detail.quote?.last).toBeInstanceOf(Decimal);
    expect(detail.stats.marketCap?.equals(new Decimal("800000000000"))).toBe(true);
  });
});

describe("getBars", () => {
  it("requests the first page of a timeframe", async () => {
    respondWith(BARS_PAYLOAD);

    const page = await api.getBars("tsla", "1m", {});

    expect(calls[0]).toBe("/api/v1/market/symbols/TSLA/bars?timeframe=1m");
    expect(page.bars[0]?.close).toBeInstanceOf(Decimal);
    expect(page.hasMore).toBe(true);
  });

  it("requests an older page with a limit and an end timestamp", async () => {
    respondWith(BARS_PAYLOAD);

    await api.getBars("TSLA", "1D", { limit: 100, end: "2026-09-08T14:30:00.000Z" });

    expect(calls[0]).toBe(
      "/api/v1/market/symbols/TSLA/bars?timeframe=1D&limit=100&end=2026-09-08T14%3A30%3A00.000Z",
    );
  });
});

describe("getMarketStatus", () => {
  it("reads the market status", async () => {
    respondWith(STATUS_PAYLOAD);

    const status = await api.getMarketStatus();

    expect(calls[0]).toBe("/api/v1/market/status");
    expect(status.status).toBe("open");
  });
});

describe("getTrades", () => {
  it("reads the trade history of an account filtered to a symbol", async () => {
    respondWith(TRADES_PAYLOAD);

    const page = await api.getTrades("acc-1", { symbol: "tsla", limit: 25, cursor: "cur-1" });

    expect(calls[0]).toBe("/api/v1/accounts/acc-1/trades?symbol=TSLA&limit=25&cursor=cur-1");
    expect(page.trades).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it("reads the whole trade history without a filter", async () => {
    respondWith(TRADES_PAYLOAD);

    await api.getTrades("acc-1", {});

    expect(calls[0]).toBe("/api/v1/accounts/acc-1/trades");
  });
});
