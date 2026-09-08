import { Decimal, type BarsResponseDto } from "@stockdesk/shared";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import type { Bar, BarsQuery } from "../src/modules/market/providers/types.js";
import { truncateAll } from "./db.js";
import { authHeader, registerUser } from "./helpers.js";
import { createFakeProvider } from "./market-fakes.js";
import { createTestMarket, seedSymbols, type TestMarket } from "./market-helpers.js";

const FEBRUARY_REQUEST_NOW = new Date("2026-03-02T15:00:00.000Z");
const FEBRUARY_BUCKET = "2026-02-01T05:00:00.000Z";

const FALL_BACK_NOW = new Date("2026-11-02T04:30:00.000Z");
const FALL_BACK_BUCKET = "2026-11-01T04:00:00.000Z";

function bars(response: request.Response): { time: string }[] {
  return (response.body as BarsResponseDto).bars;
}

async function fetchBars(market: TestMarket, token: string, query: string): Promise<request.Response> {
  return await request(market.app)
    .get(`/api/v1/market/symbols/TSLA/bars?${query}`)
    .set(authHeader(token));
}

async function candleAt(timeframe: string, time: string): Promise<{ isFinal: boolean } | null> {
  return await prisma.candle.findFirst({ where: { timeframe, time: new Date(time) } });
}

function dailyBar(query: BarsQuery, time: string): Bar {
  return {
    symbol: query.symbol,
    timeframe: query.timeframe,
    time: new Date(time),
    open: new Decimal("250"),
    high: new Decimal("255"),
    low: new Decimal("249"),
    close: new Decimal("254"),
    volume: new Decimal("1000"),
  };
}

describe("candle bucket completeness", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("stores the finished 28-day February bucket as a final 1M bar", async () => {
    const market = createTestMarket({ now: FEBRUARY_REQUEST_NOW });
    await seedSymbols(market);
    const registered = await registerUser(market.app);

    const response = await fetchBars(market, registered.accessToken, "timeframe=1M&limit=12");

    expect(response.status).toBe(200);
    expect(bars(response).map((bar) => bar.time)).toContain(FEBRUARY_BUCKET);

    const stored = await candleAt("1M", FEBRUARY_BUCKET);

    expect(stored?.isFinal).toBe(true);
  });

  it("keeps the still-forming 25-hour daily bucket out of the final cache", async () => {
    const market = createTestMarket({
      now: FALL_BACK_NOW,
      providers: (simulated) => [
        createFakeProvider({
          name: "alpaca",
          capabilities: ["bars"],
          getBars: async (query) => [dailyBar(query, FALL_BACK_BUCKET)],
        }),
        simulated,
      ],
    });
    await seedSymbols(market);
    const registered = await registerUser(market.app);

    const response = await fetchBars(market, registered.accessToken, "timeframe=1D&limit=5");

    expect(response.status).toBe(200);
    expect(await candleAt("1D", FALL_BACK_BUCKET)).toBeNull();
    expect(bars(response).map((bar) => bar.time)).not.toContain(FALL_BACK_BUCKET);
  });
});
