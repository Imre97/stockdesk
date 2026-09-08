import type { BarsResponseDto } from "@stockdesk/shared";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { truncateAll } from "./db.js";
import { authHeader, registerUser } from "./helpers.js";
import { createTestMarket, seedSymbols, type TestMarket } from "./market-helpers.js";

const DAY_ONE = new Date("2026-09-08T18:00:00.000Z");
const DAY_TWO = new Date("2026-09-09T18:00:00.000Z");
const DAY_THREE = new Date("2026-09-10T18:00:00.000Z");

const MINUTE_ONE = new Date("2026-09-08T18:00:30.000Z");
const MINUTE_TWO = new Date("2026-09-08T18:02:00.000Z");
const MINUTE_THREE = new Date("2026-09-08T18:02:10.000Z");

const DAILY_QUERY = "timeframe=1D&limit=5";
const MINUTE_QUERY = "timeframe=1m&limit=5";

async function fetchBars(market: TestMarket, token: string, query: string): Promise<request.Response> {
  return await request(market.app)
    .get(`/api/v1/market/symbols/TSLA/bars?${query}`)
    .set(authHeader(token));
}

function times(response: request.Response): string[] {
  return (response.body as BarsResponseDto).bars.map((bar) => bar.time);
}

function newest(response: request.Response): string | undefined {
  return times(response).at(-1);
}

async function coverageTo(timeframe: string): Promise<string> {
  const row = await prisma.candleCoverage.findFirst({ where: { timeframe } });
  if (row === null) throw new Error(`Expected a ${timeframe} coverage row.`);

  return row.to.toISOString();
}

async function openMarket(at: Date): Promise<{ market: TestMarket; token: string }> {
  const market = createTestMarket({ now: at });
  await seedSymbols(market);
  const registered = await registerUser(market.app);

  return { market, token: registered.accessToken };
}

describe("candle cache across bucket boundaries", () => {
  beforeEach(async () => {
    await truncateAll();
    vi.restoreAllMocks();
  });

  it("advances the newest daily bar once each daily bucket has closed", async () => {
    const { market, token } = await openMarket(DAY_ONE);
    const spy = vi.spyOn(market.provider, "getBars");

    expect(newest(await fetchBars(market, token, DAILY_QUERY))).toBe("2026-09-07T04:00:00.000Z");
    expect(spy).toHaveBeenCalledTimes(1);

    expect(newest(await fetchBars(market, token, DAILY_QUERY))).toBe("2026-09-07T04:00:00.000Z");
    expect(spy).toHaveBeenCalledTimes(1);

    market.setNow(DAY_TWO);
    expect(newest(await fetchBars(market, token, DAILY_QUERY))).toBe("2026-09-08T04:00:00.000Z");
    expect(spy).toHaveBeenCalledTimes(2);

    market.setNow(DAY_THREE);
    expect(newest(await fetchBars(market, token, DAILY_QUERY))).toBe("2026-09-09T04:00:00.000Z");
    expect(spy).toHaveBeenCalledTimes(3);

    expect(await coverageTo("1D")).toBe("2026-09-10T04:00:00.000Z");
  });

  it("ends daily coverage at the start of the bucket that was still forming", async () => {
    const { market, token } = await openMarket(DAY_ONE);

    await fetchBars(market, token, DAILY_QUERY);

    expect(await coverageTo("1D")).toBe("2026-09-08T04:00:00.000Z");
  });

  it("refetches a minute series only after the forming minute has closed", async () => {
    const { market, token } = await openMarket(MINUTE_ONE);
    const spy = vi.spyOn(market.provider, "getBars");

    expect(newest(await fetchBars(market, token, MINUTE_QUERY))).toBe("2026-09-08T17:59:00.000Z");
    expect(spy).toHaveBeenCalledTimes(1);

    market.setNow(MINUTE_TWO);
    const second = await fetchBars(market, token, MINUTE_QUERY);

    expect(times(second)).toContain("2026-09-08T18:00:00.000Z");
    expect(newest(second)).toBe("2026-09-08T18:01:00.000Z");
    expect(spy).toHaveBeenCalledTimes(2);

    market.setNow(MINUTE_THREE);

    expect(newest(await fetchBars(market, token, MINUTE_QUERY))).toBe("2026-09-08T18:01:00.000Z");
    expect(spy).toHaveBeenCalledTimes(2);
    expect(await coverageTo("1m")).toBe("2026-09-08T18:02:00.000Z");
  });
});
