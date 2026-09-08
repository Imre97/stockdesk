import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { truncateAll } from "./db.js";
import { authHeader, mainAccount, registerUser } from "./helpers.js";
import { createTestMarket, seedSymbols } from "./market-helpers.js";

const market = createTestMarket();
const app = market.app;

describe("GET /api/v1/accounts/:id/trades", () => {
  beforeEach(async () => {
    await truncateAll();
    await seedSymbols(market);
  });

  it("rejects an unauthenticated request", async () => {
    const response = await request(app).get("/api/v1/accounts/any-account/trades");

    expect(response.status).toBe(401);
  });

  it("returns an empty page for the caller's own account", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    const response = await request(app)
      .get(`/api/v1/accounts/${account.id}/trades`)
      .set(authHeader(registered.accessToken));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ trades: [], nextCursor: null });
  });

  it("accepts a symbol filter", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    const response = await request(app)
      .get(`/api/v1/accounts/${account.id}/trades?symbol=TSLA&limit=10`)
      .set(authHeader(registered.accessToken));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ trades: [], nextCursor: null });
  });

  it("returns 404 for an account of another user", async () => {
    const owner = await registerUser(app);
    const stranger = await registerUser(app);
    const account = await mainAccount(app, owner.accessToken);

    const response = await request(app)
      .get(`/api/v1/accounts/${account.id}/trades`)
      .set(authHeader(stranger.accessToken));

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: "ACCOUNT_NOT_FOUND" } });
  });

  it("rejects a limit above the maximum", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    const response = await request(app)
      .get(`/api/v1/accounts/${account.id}/trades?limit=201`)
      .set(authHeader(registered.accessToken));

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });
});
