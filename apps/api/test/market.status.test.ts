import type { MarketStatus } from "@stockdesk/shared";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { truncateAll } from "./db.js";
import { authHeader, registerUser } from "./helpers.js";
import { createFakeProvider } from "./market-fakes.js";
import { createTestMarket, seedSymbols } from "./market-helpers.js";

const SATURDAY = new Date("2026-09-12T18:00:00.000Z");

const simulatedMarket = createTestMarket();
const realMarket = createTestMarket({
  now: SATURDAY,
  providers: (simulated) => [
    createFakeProvider({ name: "alpaca", capabilities: ["stream", "bars"] }),
    simulated,
  ],
});

function status(response: request.Response): MarketStatus {
  return response.body as MarketStatus;
}

describe("GET /api/v1/market/status", () => {
  beforeEach(async () => {
    await truncateAll();
    await seedSymbols(simulatedMarket);
  });

  it("rejects an unauthenticated request", async () => {
    const response = await request(simulatedMarket.app).get("/api/v1/market/status");

    expect(response.status).toBe(401);
  });

  it("is always open while the simulated provider owns the stream", async () => {
    const registered = await registerUser(simulatedMarket.app);

    const response = await request(simulatedMarket.app)
      .get("/api/v1/market/status")
      .set(authHeader(registered.accessToken));

    expect(response.status).toBe(200);
    expect(status(response)).toEqual({ status: "open", nextOpenAt: null, nextCloseAt: null });
  });

  it("follows the NYSE calendar while a real provider owns the stream", async () => {
    const registered = await registerUser(realMarket.app);

    const response = await request(realMarket.app)
      .get("/api/v1/market/status")
      .set(authHeader(registered.accessToken));

    expect(response.status).toBe(200);
    expect(status(response)).toEqual({
      status: "closed",
      nextOpenAt: "2026-09-14T13:30:00.000Z",
      nextCloseAt: "2026-09-14T20:00:00.000Z",
    });
  });
});
