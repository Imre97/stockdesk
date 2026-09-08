import type { BarsResponseDto } from "@stockdesk/shared";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { Bar, BarsQuery } from "../src/modules/market/providers/types.js";
import { truncateAll } from "./db.js";
import { authHeader, registerUser } from "./helpers.js";
import { createFakeProvider } from "./market-fakes.js";
import { createTestMarket, seedSymbols } from "./market-helpers.js";

const PAGE = 60;

const throwingMarket = createTestMarket({
  providers: (simulated) => [
    createFakeProvider({ name: "alpaca", capabilities: ["bars"] }),
    simulated,
  ],
});

let servedTsla = 0;

const claimingMarket = createTestMarket({
  providers: (simulated) => [
    createFakeProvider({
      name: "alpaca",
      capabilities: ["bars"],
      getBars: async (query: BarsQuery): Promise<Bar[]> => {
        if (query.symbol === "TSLA" && servedTsla === 0) {
          servedTsla += 1;
          return await simulated.getBars(query);
        }
        throw new Error("alpaca bars unavailable");
      },
    }),
    simulated,
  ],
});

function page(response: request.Response): BarsResponseDto {
  return response.body as BarsResponseDto;
}

async function fetchBars(
  app: typeof throwingMarket.app,
  token: string,
  symbol: string,
  query: string,
): Promise<request.Response> {
  return await request(app)
    .get(`/api/v1/market/symbols/${symbol}/bars?${query}`)
    .set(authHeader(token));
}

describe("composite provider fallback over the bars endpoint", () => {
  beforeEach(async () => {
    await truncateAll();
    await seedSymbols(throwingMarket);
    servedTsla = 0;
  });

  it("falls back to the next provider and logs the failure", async () => {
    const registered = await registerUser(throwingMarket.app);

    const response = await fetchBars(
      throwingMarket.app,
      registered.accessToken,
      "TSLA",
      `timeframe=1m&limit=${PAGE}`,
    );

    expect(response.status).toBe(200);
    expect(page(response).bars).toHaveLength(PAGE);
    expect(throwingMarket.logs.some((line) => line.includes("alpaca") && line.includes("bars"))).toBe(
      true,
    );
  });

  it("never mixes simulated data into a symbol a real provider already served", async () => {
    const registered = await registerUser(claimingMarket.app);

    const first = await fetchBars(
      claimingMarket.app,
      registered.accessToken,
      "TSLA",
      `timeframe=1m&limit=${PAGE}`,
    );
    expect(first.status).toBe(200);

    const oldest = page(first).bars[0];
    expect(oldest).toBeDefined();

    const second = await fetchBars(
      claimingMarket.app,
      registered.accessToken,
      "TSLA",
      `timeframe=1m&limit=${PAGE}&end=${encodeURIComponent(oldest?.time ?? "")}`,
    );

    expect(second.status).toBe(503);
    expect(second.body).toMatchObject({ error: { code: "PROVIDER_UNAVAILABLE" } });

    const other = await fetchBars(
      claimingMarket.app,
      registered.accessToken,
      "AAPL",
      `timeframe=1m&limit=${PAGE}`,
    );

    expect(other.status).toBe(200);
    expect(page(other).bars).toHaveLength(PAGE);
  });
});
