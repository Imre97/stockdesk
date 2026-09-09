import { Decimal, type BarsResponseDto } from "@stockdesk/shared";
import type { Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { ALPACA_HISTORY_DEPTH } from "../src/modules/market/providers/alpaca/provider.js";
import type { Bar, BarsQuery } from "../src/modules/market/providers/types.js";
import { bucketStartMs, previousBucketStartMs } from "../src/modules/market/timeframes.js";
import { truncateAll } from "./db.js";
import { authHeader, registerUser } from "./helpers.js";
import { createFakeProvider } from "./market-fakes.js";
import {
  createTestMarket,
  seedSymbols,
  type CreateTestMarketOptions,
  type TestMarket,
} from "./market-helpers.js";

const PAGE = 60;
const NOW = new Date("2026-09-09T18:00:00.000Z");
const FORTY_DAYS_AGO = new Date("2026-07-31T18:00:00.000Z");
const FLAT_PRICE = new Decimal(100);
const FLAT_VOLUME = new Decimal(1);

const markets: TestMarket[] = [];

function deepBars(query: BarsQuery): Bar[] {
  const bars: Bar[] = [];
  let cursor = bucketStartMs(query.end.getTime(), query.timeframe);

  while (bars.length < query.limit) {
    cursor = previousBucketStartMs(cursor, query.timeframe);
    if (query.start !== undefined && cursor < query.start.getTime()) break;
    bars.push({
      symbol: query.symbol,
      timeframe: query.timeframe,
      time: new Date(cursor),
      open: FLAT_PRICE,
      high: FLAT_PRICE,
      low: FLAT_PRICE,
      close: FLAT_PRICE,
      volume: FLAT_VOLUME,
    });
  }

  return bars.reverse();
}

const deepProviders: CreateTestMarketOptions["providers"] = (simulated) => [
  createFakeProvider({
    name: "alpaca",
    capabilities: ["bars"],
    historyDepth: ALPACA_HISTORY_DEPTH,
    getBars: async (query: BarsQuery): Promise<Bar[]> => deepBars(query),
  }),
  simulated,
];

interface RecoveringDeepProvider {
  providers: CreateTestMarketOptions["providers"];
  recover: () => void;
}

function recoveringDeepProviders(): RecoveringDeepProvider {
  let available = false;

  return {
    providers: (simulated) => [
      createFakeProvider({
        name: "alpaca",
        capabilities: ["bars"],
        historyDepth: ALPACA_HISTORY_DEPTH,
        getBars: async (query: BarsQuery): Promise<Bar[]> => {
          if (!available) throw new Error("alpaca is unavailable");
          return deepBars(query);
        },
      }),
      simulated,
    ],
    recover: () => {
      available = true;
    },
  };
}

async function openMarket(
  providers?: CreateTestMarketOptions["providers"],
): Promise<{ market: TestMarket; token: string }> {
  const market = createTestMarket(providers === undefined ? { now: NOW } : { now: NOW, providers });
  markets.push(market);
  await seedSymbols(market);
  const registered = await registerUser(market.app);

  return { market, token: registered.accessToken };
}

async function fetchOldPage(app: Express, token: string): Promise<request.Response> {
  const end = encodeURIComponent(FORTY_DAYS_AGO.toISOString());

  return await request(app)
    .get(`/api/v1/market/symbols/TSLA/bars?timeframe=1m&limit=${PAGE}&end=${end}`)
    .set(authHeader(token));
}

function page(response: request.Response): BarsResponseDto {
  return response.body as BarsResponseDto;
}

beforeEach(async () => {
  await truncateAll();
});

afterEach(async () => {
  for (const market of markets.splice(0)) await market.runtime.stop();
});

describe("request window floored by the routed bars provider history depth", () => {
  it("fetches a minute page forty days old when the bars provider declares years of history", async () => {
    const { market, token } = await openMarket(deepProviders);

    const response = await fetchOldPage(market.app, token);

    expect(response.status).toBe(200);
    expect(page(response).bars).toHaveLength(PAGE);
  });

  it("returns nothing for the same window when only the simulated provider serves bars", async () => {
    const { market, token } = await openMarket();

    const response = await fetchOldPage(market.app, token);

    expect(response.status).toBe(200);
    expect(page(response).bars).toEqual([]);
    expect(page(response).hasMore).toBe(false);
  });

  it("marks no coverage for a window the serving provider could not reach", async () => {
    const deep = recoveringDeepProviders();
    const { market, token } = await openMarket(deep.providers);

    const response = await fetchOldPage(market.app, token);

    expect(response.status).toBe(200);
    expect(page(response).bars).toEqual([]);
    expect(await prisma.candleCoverage.count()).toBe(0);
  });

  it("fetches the deep window once the deep bars provider recovers", async () => {
    const deep = recoveringDeepProviders();
    const { market, token } = await openMarket(deep.providers);

    expect(page(await fetchOldPage(market.app, token)).bars).toEqual([]);

    deep.recover();
    const response = await fetchOldPage(market.app, token);

    expect(response.status).toBe(200);
    expect(page(response).bars).toHaveLength(PAGE);
  });
});
