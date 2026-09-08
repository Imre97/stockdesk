import { barsResponseDtoSchema, type BarDto, type BarsResponseDto } from "@stockdesk/shared";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { truncateAll } from "./db.js";
import { authHeader, expectNoMonetaryNumbers, firstOf, registerUser } from "./helpers.js";
import { createTestMarket, seedSymbols } from "./market-helpers.js";

const DEFAULT_PAGE = 300;
const CONCURRENT_LIMIT = 50;

const market = createTestMarket();
const app = market.app;

function page(response: request.Response): BarsResponseDto {
  return response.body as BarsResponseDto;
}

function validate(response: request.Response): BarsResponseDto {
  expectNoMonetaryNumbers(response.body);
  expect(barsResponseDtoSchema.safeParse(response.body).success).toBe(true);

  return page(response);
}

async function fetchBars(token: string, query: string): Promise<request.Response> {
  return await request(app).get(`/api/v1/market/symbols/TSLA/bars?${query}`).set(authHeader(token));
}

function times(bars: BarDto[]): number[] {
  return bars.map((bar) => Date.parse(bar.time));
}

describe("GET /api/v1/market/symbols/:symbol/bars", () => {
  beforeEach(async () => {
    await truncateAll();
    await seedSymbols(market);
    vi.restoreAllMocks();
  });

  it("returns ascending bars and defaults the page size to 300", async () => {
    const registered = await registerUser(app);

    const response = await fetchBars(registered.accessToken, "timeframe=1m");

    expect(response.status).toBe(200);

    const body = validate(response);
    expect(body.symbol).toBe("TSLA");
    expect(body.timeframe).toBe("1m");
    expect(body.bars).toHaveLength(DEFAULT_PAGE);

    const stamps = times(body.bars);
    expect([...stamps].sort((left, right) => left - right)).toEqual(stamps);
  });

  it("serves the second identical request from the candle cache", async () => {
    const registered = await registerUser(app);
    const spy = vi.spyOn(market.provider, "getBars");

    const first = await fetchBars(registered.accessToken, "timeframe=1m&limit=120");
    expect(first.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);

    const second = await fetchBars(registered.accessToken, "timeframe=1m&limit=120");
    expect(second.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(page(second).bars).toEqual(page(first).bars);
  });

  it("returns the previous page for an end cursor", async () => {
    const registered = await registerUser(app);

    const first = await fetchBars(registered.accessToken, "timeframe=1m&limit=120");
    const oldest = firstOf(page(first).bars, "bar");

    const previous = await fetchBars(
      registered.accessToken,
      `timeframe=1m&limit=120&end=${encodeURIComponent(oldest.time)}`,
    );

    expect(previous.status).toBe(200);

    const body = validate(previous);
    const last = firstOf(body.bars.slice(-1), "bar");
    expect(Date.parse(last.time)).toBeLessThan(Date.parse(oldest.time));
    expect(body.hasMore).toBe(true);
  });

  it("reports no more history before the generated range", async () => {
    const registered = await registerUser(app);

    const response = await fetchBars(
      registered.accessToken,
      "timeframe=1m&limit=10&end=2024-02-01T00%3A00%3A00.000Z",
    );

    expect(response.status).toBe(200);
    expect(page(response).bars).toEqual([]);
    expect(page(response).hasMore).toBe(false);
  });

  it("rejects an unsupported timeframe", async () => {
    const registered = await registerUser(app);

    const response = await fetchBars(registered.accessToken, "timeframe=2m");

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: "INVALID_TIMEFRAME" } });
  });

  it("rejects a limit above the maximum", async () => {
    const registered = await registerUser(app);

    const response = await fetchBars(registered.accessToken, "timeframe=1m&limit=1001");

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("keeps one coverage row and no duplicate candles under concurrent misses", async () => {
    const registered = await registerUser(app);
    const query = `timeframe=5m&limit=${CONCURRENT_LIMIT}`;

    const [first, second] = await Promise.all([
      fetchBars(registered.accessToken, query),
      fetchBars(registered.accessToken, query),
    ]);

    expect([first.status, second.status]).toEqual([200, 200]);

    const symbol = await prisma.symbol.findUnique({ where: { symbol: "TSLA" } });
    if (symbol === null) throw new Error("Expected the TSLA symbol row.");

    const candles = await prisma.candle.count({ where: { symbolId: symbol.id, timeframe: "5m" } });
    const coverage = await prisma.candleCoverage.count({
      where: { symbolId: symbol.id, timeframe: "5m" },
    });

    expect(candles).toBe(CONCURRENT_LIMIT);
    expect(coverage).toBe(1);
  });
});
