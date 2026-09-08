import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createFinnhubClient, type FetchLike, type HttpResponse } from "./client.js";
import { fetchFinnhubProfile } from "./profile.js";

const KEY = "test-finnhub-key";

function readFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

function ok(body: string): HttpResponse {
  return { ok: true, status: 200, text: () => Promise.resolve(body) };
}

function createFakeFetch(bodies: string[]): { fetchImpl: FetchLike; urls: string[] } {
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

function createClient(fetchImpl: FetchLike) {
  return createFinnhubClient({ key: KEY, fetchImpl });
}

describe("fetchFinnhubProfile", () => {
  it("requests the profile and the metrics for the symbol", async () => {
    const harness = createFakeFetch([readFixture("profile2.json"), readFixture("metric.json")]);

    await fetchFinnhubProfile(createClient(harness.fetchImpl), "TSLA");

    const profileUrl = new URL(harness.urls[0] ?? "");
    const metricUrl = new URL(harness.urls[1] ?? "");

    expect(profileUrl.pathname).toBe("/api/v1/stock/profile2");
    expect(profileUrl.searchParams.get("symbol")).toBe("TSLA");
    expect(metricUrl.pathname).toBe("/api/v1/stock/metric");
    expect(metricUrl.searchParams.get("symbol")).toBe("TSLA");
    expect(metricUrl.searchParams.get("metric")).toBe("all");
  });

  it("converts the market cap from millions to full US dollars", async () => {
    const harness = createFakeFetch([readFixture("profile2.json"), readFixture("metric.json")]);

    const profile = await fetchFinnhubProfile(createClient(harness.fetchImpl), "TSLA");

    expect(profile?.marketCap?.toString()).toBe("800123456000");
    expect(profile?.sharesOutstanding?.toString()).toBe("3180500000");
  });

  it("maps the descriptive profile fields", async () => {
    const harness = createFakeFetch([readFixture("profile2.json"), readFixture("metric.json")]);

    const profile = await fetchFinnhubProfile(createClient(harness.fetchImpl), "TSLA");

    expect(profile?.symbol).toBe("TSLA");
    expect(profile?.name).toBe("Tesla Inc");
    expect(profile?.exchange).toBe("NASDAQ NMS - GLOBAL MARKET");
    expect(profile?.industry).toBe("Automobiles");
    expect(profile?.logoUrl).toBe("https://static.example.test/logo/tsla.png");
    expect(profile?.websiteUrl).toBe("https://www.tesla.com/");
    expect(profile?.ipoDate?.toISOString()).toBe("2010-06-29T00:00:00.000Z");
  });

  it("maps the metrics and keeps a null metric null", async () => {
    const harness = createFakeFetch([readFixture("profile2.json"), readFixture("metric.json")]);

    const profile = await fetchFinnhubProfile(createClient(harness.fetchImpl), "TSLA");

    expect(profile?.peRatio?.toString()).toBe("65.2");
    expect(profile?.week52High?.toString()).toBe("299.29");
    expect(profile?.week52Low?.toString()).toBe("138.8");
    expect(profile?.beta?.toString()).toBe("2.05");
    expect(profile?.dividendYield).toBeNull();
  });

  it("falls back to the basic price to earnings metric", async () => {
    const metric = '{"metric":{"peBasicExclExtraTTM":66.10},"metricType":"all","symbol":"TSLA"}';
    const harness = createFakeFetch([readFixture("profile2.json"), metric]);

    const profile = await fetchFinnhubProfile(createClient(harness.fetchImpl), "TSLA");

    expect(profile?.peRatio?.toString()).toBe("66.1");
  });

  it("returns null metrics when the metric object is missing", async () => {
    const harness = createFakeFetch([readFixture("profile2.json"), "{}"]);

    const profile = await fetchFinnhubProfile(createClient(harness.fetchImpl), "TSLA");

    expect(profile?.peRatio).toBeNull();
    expect(profile?.week52High).toBeNull();
    expect(profile?.beta).toBeNull();
  });

  it("keeps an unparsable ipo date null", async () => {
    const harness = createFakeFetch(['{"name":"Example Inc","ipo":"not a date"}', "{}"]);

    const profile = await fetchFinnhubProfile(createClient(harness.fetchImpl), "EXPL");

    expect(profile?.ipoDate).toBeNull();
  });

  it("returns null for an unknown symbol", async () => {
    const harness = createFakeFetch([readFixture("profile2-empty.json")]);

    const profile = await fetchFinnhubProfile(createClient(harness.fetchImpl), "NOPE");

    expect(profile).toBeNull();
    expect(harness.urls).toHaveLength(1);
  });
});
