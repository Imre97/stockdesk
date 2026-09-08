import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { truncateAll } from "./db.js";
import { authHeader, mainAccount, registerUser } from "./helpers.js";

const app = createApp({ rateLimit: { enabled: false } });

describe("GET /api/v1/accounts/:id/positions", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("rejects an unauthenticated request", async () => {
    const response = await request(app).get("/api/v1/accounts/any/positions");

    expect(response.status).toBe(401);
  });

  it("returns an empty list while the orders module does not exist", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    const response = await request(app)
      .get(`/api/v1/accounts/${account.id}/positions`)
      .set(authHeader(registered.accessToken));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ positions: [] });
  });

  it("returns 404 for an unknown account", async () => {
    const registered = await registerUser(app);

    const response = await request(app)
      .get("/api/v1/accounts/cl-unknown-account/positions")
      .set(authHeader(registered.accessToken));

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: "ACCOUNT_NOT_FOUND" } });
  });

  it("returns 404 for an account of another user", async () => {
    const owner = await registerUser(app);
    const intruder = await registerUser(app);
    const account = await mainAccount(app, owner.accessToken);

    const response = await request(app)
      .get(`/api/v1/accounts/${account.id}/positions`)
      .set(authHeader(intruder.accessToken));

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: "ACCOUNT_NOT_FOUND" } });
  });
});
