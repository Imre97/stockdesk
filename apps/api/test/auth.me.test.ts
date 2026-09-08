import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/lib/config.js";
import { truncateAll } from "./db.js";
import { registerUser } from "./helpers.js";

const app = createApp({ rateLimit: { enabled: false } });

describe("GET /api/v1/auth/me", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("rejects a request without a token", async () => {
    const response = await request(app).get("/api/v1/auth/me");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("rejects a malformed token", async () => {
    const response = await request(app).get("/api/v1/auth/me").set("Authorization", "Bearer not-a-jwt");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("rejects a token signed with another secret", async () => {
    const registered = await registerUser(app);
    const forged = jwt.sign({ sub: registered.user.id }, "another-test-secret", {
      algorithm: "HS256",
      expiresIn: "15m",
    });

    const response = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${forged}`);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("signs and verifies tokens with the injected configuration", async () => {
    const otherApp = createApp({
      rateLimit: { enabled: false },
      config: { ...loadConfig(process.env), jwtAccessSecret: "other-test-secret" },
    });

    const registered = await registerUser(otherApp);

    const accepted = await request(otherApp)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${registered.accessToken}`);
    expect(accepted.status).toBe(200);

    const rejected = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${registered.accessToken}`);
    expect(rejected.status).toBe(401);
    expect(rejected.body).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("returns the current user without the password hash", async () => {
    const registered = await registerUser(app);

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${registered.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user: registered.user });
    expect((response.body as { user: Record<string, unknown> }).user).not.toHaveProperty("passwordHash");
  });
});
