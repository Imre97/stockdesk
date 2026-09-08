import { readFileSync } from "node:fs";

import type { Timeframe } from "@stockdesk/shared";
import { describe, expect, it } from "vitest";

import type { BarsQuery } from "../types.js";
import { createAlpacaClient, type FetchLike, type HttpResponse } from "./client.js";
import { fetchAlpacaBars } from "./bars.js";

const KEY = "test-alpaca-key";
const SECRET = "test-alpaca-secret";

function readFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

function ok(body: string): HttpResponse {
  return { ok: true, status: 200, text: () => Promise.resolve(body) };
}

interface Harness {
  fetchImpl: FetchLike;
  urls: string[];
}

function createFakeFetch(bodies: string[]): Harness {
  const urls: string[] = [];
  let index = 0;

  const fetchImpl: FetchLike = async (url) => {
    urls.push(url);

    const body = bodies[index];
    index += 1;

    if (body === undefined) throw new Error(`Unexpected request to ${url}`);

    return ok(body);
  };

  return { fetchImpl, urls };
}

function client(fetchImpl: FetchLike) {
  return createAlpacaClient({ key: KEY, secret: SECRET, feed: "iex", fetchImpl });
}

function queryOf(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

const BASE_QUERY: BarsQuery = {
  symbol: "AAPL",
  timeframe: "1m",
  end: new Date("2026-09-08T14:00:00.000Z"),
  limit: 10,
  start: new Date("2026-09-08T13:00:00.000Z"),
};

describe("fetchAlpacaBars", () => {
  it("joins both pages and maps every field", async () => {
    const harness = createFakeFetch([readFixture("bars-page-1.json"), readFixture("bars-page-2.json")]);

    const bars = await fetchAlpacaBars(client(harness.fetchImpl), BASE_QUERY);

    expect(bars).toHaveLength(3);
    expect(
      bars.map((bar) => ({
        symbol: bar.symbol,
        timeframe: bar.timeframe,
        time: bar.time.toISOString(),
        open: bar.open.toString(),
        high: bar.high.toString(),
        low: bar.low.toString(),
        close: bar.close.toString(),
        volume: bar.volume.toString(),
      })),
    ).toEqual([
      {
        symbol: "AAPL",
        timeframe: "1m",
        time: "2026-09-08T13:30:00.000Z",
        open: "182.1",
        high: "182.55",
        low: "181.95",
        close: "182.3",
        volume: "125000",
      },
      {
        symbol: "AAPL",
        timeframe: "1m",
        time: "2026-09-08T13:31:00.000Z",
        open: "182.3",
        high: "182.75",
        low: "182.2",
        close: "182.6",
        volume: "98000",
      },
      {
        symbol: "AAPL",
        timeframe: "1m",
        time: "2026-09-08T13:32:00.000Z",
        open: "182.6",
        high: "182.9",
        low: "182.45",
        close: "182.85",
        volume: "110500",
      },
    ]);
  });

  it("follows the next page token", async () => {
    const harness = createFakeFetch([readFixture("bars-page-1.json"), readFixture("bars-page-2.json")]);

    await fetchAlpacaBars(client(harness.fetchImpl), BASE_QUERY);

    expect(harness.urls).toHaveLength(2);
    expect(queryOf(harness.urls[0] ?? "").get("page_token")).toBeNull();
    expect(queryOf(harness.urls[1] ?? "").get("page_token")).toBe("bars-page-2");
  });

  it("sends the fixed query parameters", async () => {
    const harness = createFakeFetch([readFixture("bars-page-2.json")]);

    await fetchAlpacaBars(client(harness.fetchImpl), BASE_QUERY);

    const query = queryOf(harness.urls[0] ?? "");

    expect(query.get("symbols")).toBe("AAPL");
    expect(query.get("timeframe")).toBe("1Min");
    expect(query.get("feed")).toBe("iex");
    expect(query.get("adjustment")).toBe("split");
    expect(query.get("sort")).toBe("asc");
    expect(query.get("limit")).toBe("10");
    expect(query.get("start")).toBe("2026-09-08T13:00:00.000Z");
    expect(query.get("end")).toBe("2026-09-08T14:00:00.000Z");
  });

  it("maps every supported timeframe to its Alpaca name", async () => {
    const expected: [Timeframe, string][] = [
      ["1m", "1Min"],
      ["5m", "5Min"],
      ["15m", "15Min"],
      ["1h", "1Hour"],
      ["1D", "1Day"],
      ["1W", "1Week"],
      ["1M", "1Month"],
    ];

    for (const [timeframe, alpacaName] of expected) {
      const harness = createFakeFetch([readFixture("bars-page-2.json")]);

      await fetchAlpacaBars(client(harness.fetchImpl), { ...BASE_QUERY, timeframe });

      expect(queryOf(harness.urls[0] ?? "").get("timeframe")).toBe(alpacaName);
    }
  });

  it("stops paginating once the limit is reached for an explicit start", async () => {
    const harness = createFakeFetch([readFixture("bars-page-1.json")]);

    const bars = await fetchAlpacaBars(client(harness.fetchImpl), { ...BASE_QUERY, limit: 2 });

    expect(harness.urls).toHaveLength(1);
    expect(bars.map((bar) => bar.time.toISOString())).toEqual([
      "2026-09-08T13:30:00.000Z",
      "2026-09-08T13:31:00.000Z",
    ]);
  });

  it("derives a generous start window and keeps the last bars when start is absent", async () => {
    const harness = createFakeFetch([readFixture("bars-page-1.json"), readFixture("bars-page-2.json")]);

    const bars = await fetchAlpacaBars(client(harness.fetchImpl), {
      symbol: "AAPL",
      timeframe: "1m",
      end: new Date("2026-09-08T14:00:00.000Z"),
      limit: 2,
    });

    expect(queryOf(harness.urls[0] ?? "").get("start")).toBe("2026-09-08T13:54:00.000Z");
    expect(bars.map((bar) => bar.time.toISOString())).toEqual([
      "2026-09-08T13:31:00.000Z",
      "2026-09-08T13:32:00.000Z",
    ]);
  });

  it("derives the window from the timeframe duration", async () => {
    const harness = createFakeFetch([readFixture("bars-page-2.json")]);

    await fetchAlpacaBars(client(harness.fetchImpl), {
      symbol: "AAPL",
      timeframe: "1D",
      end: new Date("2026-09-08T00:00:00.000Z"),
      limit: 2,
    });

    expect(queryOf(harness.urls[0] ?? "").get("start")).toBe("2026-09-02T00:00:00.000Z");
  });

  it("returns an empty list when the response holds no bars for the symbol", async () => {
    const harness = createFakeFetch(['{"bars":{},"next_page_token":null}']);

    const bars = await fetchAlpacaBars(client(harness.fetchImpl), BASE_QUERY);

    expect(bars).toEqual([]);
  });
});
