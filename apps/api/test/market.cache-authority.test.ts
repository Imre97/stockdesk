import { toApiString, type BarDto, type BarsResponseDto } from "@stockdesk/shared";
import type { Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import type { Bar, Trade } from "../src/modules/market/providers/types.js";
import { truncateAll } from "./db.js";
import { authHeader, registerUser } from "./helpers.js";
import {
  createTestMarket,
  createTestMarketServer,
  seedSymbols,
  type TestMarket,
  type TestMarketServer,
} from "./market-helpers.js";

const PRICE_PLACES = 4;
const STORED_PLACES = 8;
const DAILY_QUERY = "timeframe=1D&limit=5";
const MINUTE_QUERY = "timeframe=1m&limit=5";
const STALE_VALUE = "1";

const DAY_TWO = new Date("2026-09-09T18:00:00.000Z");
const MINUTE_NOW = new Date("2026-09-09T18:00:30.000Z");
const CLOSED_DAILY_BUCKET = new Date("2026-09-08T04:00:00.000Z");
const FORMING_DAILY_BUCKET = new Date("2026-09-09T04:00:00.000Z");
const FORMING_MINUTE_BUCKET = "2026-09-09T18:00:00.000Z";

const markets: TestMarket[] = [];
const servers: TestMarketServer[] = [];

async function fetchBars(app: Express, token: string, query: string): Promise<request.Response> {
  return await request(app).get(`/api/v1/market/symbols/TSLA/bars?${query}`).set(authHeader(token));
}

async function openMarket(at: Date): Promise<{ market: TestMarket; token: string }> {
  const market = createTestMarket({ now: at });
  markets.push(market);
  await seedSymbols(market);
  const registered = await registerUser(market.app);

  return { market, token: registered.accessToken };
}

async function symbolId(): Promise<string> {
  const row = await prisma.symbol.findUnique({ where: { symbol: "TSLA" } });
  if (row === null) throw new Error("Expected the TSLA symbol row.");

  return row.id;
}

async function seedDailyCandle(time: Date, isFinal: boolean): Promise<void> {
  await prisma.candle.create({
    data: {
      symbolId: await symbolId(),
      timeframe: "1D",
      time,
      open: STALE_VALUE,
      high: STALE_VALUE,
      low: STALE_VALUE,
      close: STALE_VALUE,
      volume: STALE_VALUE,
      isFinal,
    },
  });
}

function barAt(response: request.Response, time: string): BarDto {
  const found = (response.body as BarsResponseDto).bars.find((bar) => bar.time === time);
  if (found === undefined) throw new Error(`Expected a bar at ${time}.`);

  return found;
}

async function providerDailyBar(market: TestMarket, at: Date, time: Date): Promise<Bar> {
  const bars = await market.provider.getBars({
    symbol: "TSLA",
    timeframe: "1D",
    end: at,
    limit: 5,
  });
  const found = bars.find((bar) => bar.time.getTime() === time.getTime());
  if (found === undefined) throw new Error(`Expected a provider bar at ${time.toISOString()}.`);

  return found;
}

function firstTrade(trades: Trade[]): Trade {
  const [trade] = trades;
  if (trade === undefined) throw new Error("The simulated provider produced no trade.");

  return trade;
}

async function dailyRowAt(time: Date): Promise<{ close: string; isFinal: boolean; count: number }> {
  const rows = await prisma.candle.findMany({
    where: { symbolId: await symbolId(), timeframe: "1D", time },
  });
  const row = rows[0];
  if (row === undefined) throw new Error(`Expected a candle row at ${time.toISOString()}.`);

  return {
    close: toApiString(row.close.toString(), STORED_PLACES),
    isFinal: row.isFinal,
    count: rows.length,
  };
}

beforeEach(async () => {
  await truncateAll();
});

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
  for (const market of markets.splice(0)) await market.runtime.stop();
});

describe("provider authority over live aggregator rows", () => {
  it("replaces a non-final aggregator row at a closed bucket with the provider bar", async () => {
    const { market, token } = await openMarket(DAY_TWO);
    await seedDailyCandle(CLOSED_DAILY_BUCKET, false);
    const expected = await providerDailyBar(market, DAY_TWO, CLOSED_DAILY_BUCKET);

    const response = await fetchBars(market.app, token, DAILY_QUERY);

    expect(response.status).toBe(200);
    expect(barAt(response, CLOSED_DAILY_BUCKET.toISOString()).close).toBe(
      toApiString(expected.close, PRICE_PLACES),
    );

    const stored = await dailyRowAt(CLOSED_DAILY_BUCKET);

    expect(stored.count).toBe(1);
    expect(stored.isFinal).toBe(true);
    expect(stored.close).toBe(toApiString(expected.close, STORED_PLACES));
  });

  it("replaces a final row that holds a partial session aggregate", async () => {
    const { market, token } = await openMarket(DAY_TWO);
    await seedDailyCandle(CLOSED_DAILY_BUCKET, true);
    const expected = await providerDailyBar(market, DAY_TWO, CLOSED_DAILY_BUCKET);

    const response = await fetchBars(market.app, token, DAILY_QUERY);

    expect(response.status).toBe(200);
    expect(barAt(response, CLOSED_DAILY_BUCKET.toISOString()).close).toBe(
      toApiString(expected.close, PRICE_PLACES),
    );

    const stored = await dailyRowAt(CLOSED_DAILY_BUCKET);

    expect(stored.count).toBe(1);
    expect(stored.isFinal).toBe(true);
    expect(stored.close).toBe(toApiString(expected.close, STORED_PLACES));
  });

  it("keeps the forming bar of the current bucket across a provider fetch", async () => {
    const { market, token } = await openMarket(DAY_TWO);
    await market.runtime.priceService.ensureStreaming(["TSLA"]);
    const trade = firstTrade(market.provider.emitTick());
    await market.runtime.aggregator.flush();

    const response = await fetchBars(market.app, token, DAILY_QUERY);

    expect(response.status).toBe(200);
    expect(barAt(response, FORMING_DAILY_BUCKET.toISOString()).close).toBe(
      toApiString(trade.price, PRICE_PLACES),
    );

    const stored = await dailyRowAt(FORMING_DAILY_BUCKET);

    expect(stored.isFinal).toBe(false);
    expect(stored.close).toBe(toApiString(trade.price, STORED_PLACES));
  });

  it("returns the forming minute bar as the last bar of the REST page", async () => {
    const server = await createTestMarketServer({ now: MINUTE_NOW });
    servers.push(server);
    await seedSymbols(server);
    const registered = await registerUser(server.app);

    await server.provider.subscribeTrades(["TSLA"]);
    const trade = firstTrade(server.provider.emitTick());
    await server.flush();

    const response = await fetchBars(server.app, registered.accessToken, MINUTE_QUERY);

    expect(response.status).toBe(200);

    const last = (response.body as BarsResponseDto).bars.at(-1);

    expect(last?.time).toBe(FORMING_MINUTE_BUCKET);
    expect(last?.close).toBe(toApiString(trade.price, PRICE_PLACES));
  });
});
