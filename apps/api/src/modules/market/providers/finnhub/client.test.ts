import { describe, expect, it } from "vitest";

import { createFinnhubClient, type FetchLike, type HttpResponse } from "./client.js";

const KEY = "test-finnhub-key";

interface FetchCall {
  url: string;
  headers: Record<string, string> | undefined;
}

function createFakeFetch(responses: HttpResponse[]): { fetchImpl: FetchLike; calls: FetchCall[] } {
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

function failure(status: number): HttpResponse {
  return { ok: false, status, text: () => Promise.resolve("error") };
}

describe("createFinnhubClient", () => {
  it("sends the token header and returns the raw response text", async () => {
    const fake = createFakeFetch([ok("{}")]);
    const client = createFinnhubClient({ key: KEY, fetchImpl: fake.fetchImpl });

    const text = await client.get("/stock/profile2", { symbol: "TSLA" });

    expect(text).toBe("{}");
    expect(fake.calls[0]?.headers).toEqual({ "X-Finnhub-Token": KEY });
  });

  it("builds the url from the default base and the query", async () => {
    const fake = createFakeFetch([ok("{}")]);
    const client = createFinnhubClient({ key: KEY, fetchImpl: fake.fetchImpl });

    await client.get("/stock/metric", { symbol: "TSLA", metric: "all" });

    expect(fake.calls[0]?.url).toBe("https://finnhub.io/api/v1/stock/metric?symbol=TSLA&metric=all");
  });

  it("honors an overridden base url", async () => {
    const fake = createFakeFetch([ok("{}")]);
    const client = createFinnhubClient({
      key: KEY,
      fetchImpl: fake.fetchImpl,
      baseUrl: "https://finnhub.example.test/api/v1",
    });

    await client.get("/stock/symbol", { exchange: "US" });

    expect(fake.calls[0]?.url).toBe("https://finnhub.example.test/api/v1/stock/symbol?exchange=US");
  });

  it("throws with the status and the path on a failed request", async () => {
    const fake = createFakeFetch([failure(429)]);
    const client = createFinnhubClient({ key: KEY, fetchImpl: fake.fetchImpl });

    await expect(client.get("/stock/profile2", { symbol: "TSLA" })).rejects.toThrow(
      /429.*\/api\/v1\/stock\/profile2/,
    );
  });

  it("never leaks the token in the error message", async () => {
    const fake = createFakeFetch([failure(401)]);
    const client = createFinnhubClient({ key: KEY, fetchImpl: fake.fetchImpl });

    const error = await client.get("/stock/profile2", { symbol: "TSLA" }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(KEY);
  });
});
