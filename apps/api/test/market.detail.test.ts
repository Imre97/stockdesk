import { symbolDetailDtoSchema, toApiString, type SymbolDetailDto } from "@stockdesk/shared";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { truncateAll } from "./db.js";
import { authHeader, expectNoMonetaryNumbers, firstOf, registerUser } from "./helpers.js";
import { createTestMarket, MARKET_NOW, seedSymbols } from "./market-helpers.js";

const PRICE_PLACES = 4;
const VOLUME_PLACES = 0;
const SATURDAY = new Date("2026-09-12T18:00:00.000Z");
const SATURDAY_BUCKET = "2026-09-12T04:00:00.000Z";
const FRIDAY_BUCKET = "2026-09-11T04:00:00.000Z";

async function latestDailyCandle(isFinal: boolean) {
  return await prisma.candle.findFirst({
    where: { timeframe: "1D", isFinal },
    orderBy: { time: "desc" },
  });
}

const market = createTestMarket();
const app = market.app;

function detail(response: request.Response): SymbolDetailDto {
  return (response.body as { symbol: SymbolDetailDto }).symbol;
}

async function fetchSymbol(token: string, symbol: string): Promise<request.Response> {
  return await request(app).get(`/api/v1/market/symbols/${symbol}`).set(authHeader(token));
}

describe("GET /api/v1/market/symbols/:symbol", () => {
  beforeEach(async () => {
    await truncateAll();
    await seedSymbols(market);
  });

  it("rejects an unauthenticated request", async () => {
    const response = await request(app).get("/api/v1/market/symbols/TSLA");

    expect(response.status).toBe(401);
  });

  it("returns the detail shape with every numeric field as a string", async () => {
    const registered = await registerUser(app);

    const response = await fetchSymbol(registered.accessToken, "TSLA");

    expect(response.status).toBe(200);
    expect(() => symbolDetailDtoSchema.parse(detail(response))).not.toThrow();
    expectNoMonetaryNumbers(response.body);

    const body = detail(response);
    expect(body.symbol).toBe("TSLA");
    expect(body.name).toBe("Tesla, Inc.");
    expect(body.shortable).toBe(true);
    expect(body.fractionable).toBe(true);
    expect(typeof body.stats.marketCap).toBe("string");
    expect(typeof body.industry).toBe("string");
  });

  it("derives the previous close from the newest daily candle of the provider", async () => {
    const registered = await registerUser(app);

    const bars = await market.provider.getBars({
      symbol: "TSLA",
      timeframe: "1D",
      end: MARKET_NOW,
      limit: 2,
    });
    const previous = firstOf(bars.slice(-1), "daily bar");

    const response = await fetchSymbol(registered.accessToken, "TSLA");
    const quote = detail(response).quote;

    expect(quote).not.toBeNull();
    expect(quote?.prevClose).toBe(toApiString(previous.close, PRICE_PLACES));
  });

  it("serves the daily session from the forming candle and the previous close from the last final one", async () => {
    const live = createTestMarket({ now: SATURDAY });
    const registered = await registerUser(live.app);

    await live.provider.subscribeTrades(["TSLA"]);
    live.provider.emitTick();
    await live.runtime.aggregator.flush();

    const response = await request(live.app)
      .get("/api/v1/market/symbols/TSLA")
      .set(authHeader(registered.accessToken));
    const quote = detail(response).quote;
    const forming = await latestDailyCandle(false);
    const previous = await latestDailyCandle(true);

    expect(forming?.time.toISOString()).toBe(SATURDAY_BUCKET);
    expect(previous?.time.toISOString()).toBe(FRIDAY_BUCKET);
    expect(quote?.open).toBe(toApiString(forming?.open.toString() ?? "0", PRICE_PLACES));
    expect(quote?.high).toBe(toApiString(forming?.high.toString() ?? "0", PRICE_PLACES));
    expect(quote?.low).toBe(toApiString(forming?.low.toString() ?? "0", PRICE_PLACES));
    expect(quote?.volume).toBe(toApiString(forming?.volume.toString() ?? "0", VOLUME_PLACES));
    expect(quote?.prevClose).toBe(toApiString(previous?.close.toString() ?? "0", PRICE_PLACES));
  });

  it("accepts a lower-case symbol", async () => {
    const registered = await registerUser(app);

    const response = await fetchSymbol(registered.accessToken, "tsla");

    expect(response.status).toBe(200);
    expect(detail(response).symbol).toBe("TSLA");
  });

  it("returns 404 for an unknown symbol", async () => {
    const registered = await registerUser(app);

    const response = await fetchSymbol(registered.accessToken, "XXXX");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: "SYMBOL_NOT_FOUND" } });
  });

  it("returns 422 for a symbol with unsupported characters", async () => {
    const registered = await registerUser(app);

    const response = await fetchSymbol(registered.accessToken, "bad$");

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });
});
