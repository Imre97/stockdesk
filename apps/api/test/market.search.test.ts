import type { SymbolSearchResult } from "@stockdesk/shared";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { truncateAll } from "./db.js";
import { authHeader, registerUser } from "./helpers.js";
import { createTestMarket, seedSymbols } from "./market-helpers.js";

const market = createTestMarket();
const app = market.app;

function results(response: request.Response): SymbolSearchResult[] {
  return (response.body as { results: SymbolSearchResult[] }).results;
}

async function search(token: string, query: string): Promise<request.Response> {
  return await request(app).get(`/api/v1/market/symbols/search?${query}`).set(authHeader(token));
}

describe("GET /api/v1/market/symbols/search", () => {
  beforeEach(async () => {
    await truncateAll();
    await seedSymbols(market);
  });

  it("rejects an unauthenticated request", async () => {
    const response = await request(app).get("/api/v1/market/symbols/search?q=tsl");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("returns TSLA first for a symbol prefix", async () => {
    const registered = await registerUser(app);

    const response = await search(registered.accessToken, "q=tsl");

    expect(response.status).toBe(200);
    expect(results(response)[0]).toEqual({
      symbol: "TSLA",
      name: "Tesla, Inc.",
      exchange: "NASDAQ",
    });
  });

  it("matches a company name when no symbol starts with the query", async () => {
    const registered = await registerUser(app);

    const response = await search(registered.accessToken, "q=tesla");

    expect(response.status).toBe(200);
    expect(results(response).map((row) => row.symbol)).toEqual(["TSLA"]);
  });

  it("orders symbol prefix matches before name matches", async () => {
    const registered = await registerUser(app);

    const response = await search(registered.accessToken, "q=co&limit=25");
    const symbols = results(response).map((row) => row.symbol);

    expect(symbols[0]).toBe("COST");
    expect(symbols.length).toBeGreaterThan(1);
    expect(symbols.slice(1).every((symbol) => !symbol.startsWith("CO"))).toBe(true);
  });

  it("respects the requested limit", async () => {
    const registered = await registerUser(app);

    const response = await search(registered.accessToken, "q=a&limit=3");

    expect(response.status).toBe(200);
    expect(results(response)).toHaveLength(3);
  });

  it("rejects an empty query", async () => {
    const registered = await registerUser(app);

    const response = await search(registered.accessToken, "q=");

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("rejects a limit above the maximum without clamping", async () => {
    const registered = await registerUser(app);

    const response = await search(registered.accessToken, "q=tsl&limit=26");

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });
});
