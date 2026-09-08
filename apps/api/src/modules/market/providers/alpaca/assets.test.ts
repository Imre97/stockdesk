import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { fetchAlpacaAssets } from "./assets.js";
import { createAlpacaClient, type FetchLike, type HttpResponse } from "./client.js";

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

describe("fetchAlpacaAssets", () => {
  it("requests the active US equities from the trading base", async () => {
    const harness = createFakeFetch(readFixture("assets.json"));
    const client = createAlpacaClient({
      key: KEY,
      secret: SECRET,
      feed: "iex",
      fetchImpl: harness.fetchImpl,
    });

    await fetchAlpacaAssets(client);

    const url = new URL(harness.urls[0] ?? "");

    expect(url.origin).toBe("https://paper-api.alpaca.markets");
    expect(url.pathname).toBe("/v2/assets");
    expect(url.searchParams.get("status")).toBe("active");
    expect(url.searchParams.get("asset_class")).toBe("us_equity");
  });

  it("keeps only tradable assets and maps the trading flags", async () => {
    const harness = createFakeFetch(readFixture("assets.json"));
    const client = createAlpacaClient({
      key: KEY,
      secret: SECRET,
      feed: "iex",
      fetchImpl: harness.fetchImpl,
    });

    const assets = await fetchAlpacaAssets(client);

    expect(assets).toEqual([
      {
        symbol: "AAPL",
        name: "Apple Inc. Common Stock",
        exchange: "NASDAQ",
        shortable: true,
        fractionable: true,
      },
      {
        symbol: "MSFT",
        name: "Microsoft Corporation Common Stock",
        exchange: "NASDAQ",
        shortable: true,
        fractionable: true,
      },
      {
        symbol: "BRK.A",
        name: "Berkshire Hathaway Inc. Class A",
        exchange: "NYSE",
        shortable: false,
        fractionable: false,
      },
      {
        symbol: "TSLA",
        name: "Tesla, Inc. Common Stock",
        exchange: "NASDAQ",
        shortable: true,
        fractionable: true,
      },
    ]);
  });
});
