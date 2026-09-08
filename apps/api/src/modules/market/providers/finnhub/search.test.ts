import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createFinnhubClient, type FetchLike, type HttpResponse } from "./client.js";
import { fetchFinnhubSymbols } from "./search.js";

const KEY = "test-finnhub-key";

function readFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

function createFakeFetch(body: string): { fetchImpl: FetchLike; urls: string[] } {
  const urls: string[] = [];

  const fetchImpl: FetchLike = async (url) => {
    urls.push(url);

    const response: HttpResponse = { ok: true, status: 200, text: () => Promise.resolve(body) };

    return response;
  };

  return { fetchImpl, urls };
}

describe("fetchFinnhubSymbols", () => {
  it("requests the US exchange listing", async () => {
    const harness = createFakeFetch(readFixture("symbols.json"));
    const client = createFinnhubClient({ key: KEY, fetchImpl: harness.fetchImpl });

    await fetchFinnhubSymbols(client);

    const url = new URL(harness.urls[0] ?? "");

    expect(url.pathname).toBe("/api/v1/stock/symbol");
    expect(url.searchParams.get("exchange")).toBe("US");
  });

  it("keeps only common stock and maps the record", async () => {
    const harness = createFakeFetch(readFixture("symbols.json"));
    const client = createFinnhubClient({ key: KEY, fetchImpl: harness.fetchImpl });

    const assets = await fetchFinnhubSymbols(client);

    expect(assets).toEqual([
      { symbol: "AAPL", name: "APPLE INC", exchange: "XNAS", shortable: true, fractionable: true },
      { symbol: "TSLA", name: "TESLA INC", exchange: "XNAS", shortable: true, fractionable: true },
    ]);
  });
});
