import { describe, expect, it } from "vitest";

import { createAlpacaClient, type FetchLike, type HttpResponse } from "./client.js";

const KEY = "test-alpaca-key";
const SECRET = "test-alpaca-secret";

interface FetchCall {
  url: string;
  headers: Record<string, string> | undefined;
}

interface FakeFetch {
  fetchImpl: FetchLike;
  calls: FetchCall[];
}

function createFakeFetch(responses: HttpResponse[]): FakeFetch {
  const calls: FetchCall[] = [];
  let index = 0;

  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, headers: init?.headers });

    const response = responses[index];
    index += 1;

    if (response === undefined) throw new Error(`Unexpected request to ${url}`);

    return response;
  };

  return { fetchImpl, calls };
}

function ok(body: string): HttpResponse {
  return { ok: true, status: 200, text: () => Promise.resolve(body) };
}

function failure(status: number, body: string): HttpResponse {
  return { ok: false, status, text: () => Promise.resolve(body) };
}

describe("createAlpacaClient", () => {
  it("sends the credential headers and returns the raw response text", async () => {
    const fake = createFakeFetch([ok('{"bars":{}}')]);
    const client = createAlpacaClient({ key: KEY, secret: SECRET, feed: "iex", fetchImpl: fake.fetchImpl });

    const text = await client.getData("/v2/stocks/bars", { symbols: "AAPL" });

    expect(text).toBe('{"bars":{}}');
    expect(fake.calls[0]?.headers).toEqual({
      "APCA-API-KEY-ID": KEY,
      "APCA-API-SECRET-KEY": SECRET,
    });
  });

  it("builds the data url from the default data base and the query", async () => {
    const fake = createFakeFetch([ok("{}")]);
    const client = createAlpacaClient({ key: KEY, secret: SECRET, feed: "iex", fetchImpl: fake.fetchImpl });

    await client.getData("/v2/stocks/bars", { symbols: "AAPL", timeframe: "1Min" });

    expect(fake.calls[0]?.url).toBe(
      "https://data.alpaca.markets/v2/stocks/bars?symbols=AAPL&timeframe=1Min",
    );
  });

  it("builds the trading url from the default trading base", async () => {
    const fake = createFakeFetch([ok("[]")]);
    const client = createAlpacaClient({ key: KEY, secret: SECRET, feed: "iex", fetchImpl: fake.fetchImpl });

    await client.getTrading("/v2/assets", { status: "active" });

    expect(fake.calls[0]?.url).toBe("https://paper-api.alpaca.markets/v2/assets?status=active");
  });

  it("honors overridden base urls", async () => {
    const fake = createFakeFetch([ok("{}"), ok("[]")]);
    const client = createAlpacaClient({
      key: KEY,
      secret: SECRET,
      feed: "sip",
      fetchImpl: fake.fetchImpl,
      dataBaseUrl: "https://data.example.test",
      tradingBaseUrl: "https://trading.example.test",
    });

    await client.getData("/v2/stocks/bars", {});
    await client.getTrading("/v2/assets", {});

    expect(fake.calls[0]?.url).toBe("https://data.example.test/v2/stocks/bars");
    expect(fake.calls[1]?.url).toBe("https://trading.example.test/v2/assets");
    expect(client.feed).toBe("sip");
  });

  it("throws with the status and the path on a failed request", async () => {
    const fake = createFakeFetch([failure(403, "forbidden")]);
    const client = createAlpacaClient({ key: KEY, secret: SECRET, feed: "iex", fetchImpl: fake.fetchImpl });

    await expect(client.getData("/v2/stocks/bars", { symbols: "AAPL" })).rejects.toThrow(
      /403.*\/v2\/stocks\/bars/,
    );
  });

  it("never leaks the credentials in the error message", async () => {
    const fake = createFakeFetch([failure(401, "unauthorized")]);
    const client = createAlpacaClient({ key: KEY, secret: SECRET, feed: "iex", fetchImpl: fake.fetchImpl });

    const error = await client.getData("/v2/stocks/bars", {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(KEY);
    expect((error as Error).message).not.toContain(SECRET);
  });
});
