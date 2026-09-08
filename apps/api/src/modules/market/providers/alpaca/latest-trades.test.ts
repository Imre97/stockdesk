import { readFileSync } from "node:fs";

import { Decimal } from "@stockdesk/shared";
import { describe, expect, it } from "vitest";

import { createAlpacaClient, type FetchLike, type HttpResponse } from "./client.js";
import { fetchAlpacaLatestTrades } from "./latest-trades.js";

const KEY = "test-alpaca-key";
const SECRET = "test-alpaca-secret";

function readFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

function ok(body: string): HttpResponse {
  return { ok: true, status: 200, text: () => Promise.resolve(body) };
}

function createFakeFetch(body: string): { fetchImpl: FetchLike; urls: string[] } {
  const urls: string[] = [];

  const fetchImpl: FetchLike = async (url) => {
    urls.push(url);
    return ok(body);
  };

  return { fetchImpl, urls };
}

function createClient(fetchImpl: FetchLike) {
  return createAlpacaClient({ key: KEY, secret: SECRET, feed: "iex", fetchImpl });
}

describe("fetchAlpacaLatestTrades", () => {
  it("requests every symbol in one call", async () => {
    const harness = createFakeFetch(readFixture("latest-trades.json"));

    await fetchAlpacaLatestTrades(createClient(harness.fetchImpl), ["AAPL", "MSFT"]);

    const url = new URL(harness.urls[0] ?? "");

    expect(url.pathname).toBe("/v2/stocks/trades/latest");
    expect(url.searchParams.get("symbols")).toBe("AAPL,MSFT");
    expect(url.searchParams.get("feed")).toBe("iex");
  });

  it("maps price and size to Decimal and truncates the timestamp to milliseconds", async () => {
    const harness = createFakeFetch(readFixture("latest-trades.json"));

    const trades = await fetchAlpacaLatestTrades(createClient(harness.fetchImpl), ["AAPL", "MSFT"]);

    expect(trades).toHaveLength(2);
    expect(trades[0]?.price).toBeInstanceOf(Decimal);
    expect(
      trades.map((trade) => ({
        symbol: trade.symbol,
        price: trade.price.toString(),
        size: trade.size.toString(),
        at: trade.at.toISOString(),
      })),
    ).toEqual([
      { symbol: "AAPL", price: "182.1", size: "100", at: "2026-09-08T14:30:01.123Z" },
      { symbol: "MSFT", price: "418.25", size: "250", at: "2026-09-08T14:30:02.500Z" },
    ]);
  });

  it("does not call the API for an empty symbol list", async () => {
    const harness = createFakeFetch(readFixture("latest-trades.json"));

    const trades = await fetchAlpacaLatestTrades(createClient(harness.fetchImpl), []);

    expect(trades).toEqual([]);
    expect(harness.urls).toEqual([]);
  });
});
