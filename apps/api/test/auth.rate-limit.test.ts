import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/lib/config.js";
import { truncateAll } from "./db.js";
import { DEFAULT_PASSWORD, uniqueEmail } from "./helpers.js";

const app = createApp({ rateLimit: { enabled: true, max: 3 } });

function credentials(): { email: string; password: string } {
  return { email: uniqueEmail("limited"), password: DEFAULT_PASSWORD };
}

describe("auth rate limiting", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("rejects requests over the limit with RATE_LIMITED", async () => {
    const payload = credentials();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await request(app).post("/api/v1/auth/login").send(payload);
      expect(response.status).not.toBe(429);
    }

    const blocked = await request(app).post("/api/v1/auth/login").send(payload);

    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ error: { code: "RATE_LIMITED" } });
  });

  it("takes the limit from the configuration when no rate limit option is given", async () => {
    const config = loadConfig({
      ...process.env,
      AUTH_RATE_LIMIT_MAX: "2",
      AUTH_RATE_LIMIT_WINDOW_MINUTES: "15",
    });

    expect(config.authRateLimitMax).toBe(2);

    const configuredApp = createApp({ config });
    const payload = credentials();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await request(configuredApp).post("/api/v1/auth/login").send(payload);
      expect(response.status).not.toBe(429);
    }

    const blocked = await request(configuredApp).post("/api/v1/auth/login").send(payload);

    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ error: { code: "RATE_LIMITED" } });
  });

  it("keeps a separate bucket per forwarded client address", async () => {
    const limited = createApp({ rateLimit: { enabled: true, max: 1 } });
    const payload = credentials();
    const post = (forwardedFor: string) =>
      request(limited).post("/api/v1/auth/login").set("X-Forwarded-For", forwardedFor).send(payload);

    const firstFromA = await post("203.0.113.1");
    const secondFromA = await post("203.0.113.1");
    const firstFromB = await post("203.0.113.2");

    expect(firstFromA.status).not.toBe(429);
    expect(secondFromA.status).toBe(429);
    expect(firstFromB.status).not.toBe(429);
  });

  it("lets an explicit rate limit option override the configuration", async () => {
    const config = loadConfig({ ...process.env, AUTH_RATE_LIMIT_MAX: "1" });
    const payload = credentials();

    const disabled = createApp({ config, rateLimit: { enabled: false } });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await request(disabled).post("/api/v1/auth/login").send(payload);
      expect(response.status).not.toBe(429);
    }

    const raised = createApp({ config, rateLimit: { enabled: true, max: 2 } });
    const first = await request(raised).post("/api/v1/auth/login").send(payload);
    const second = await request(raised).post("/api/v1/auth/login").send(payload);
    const third = await request(raised).post("/api/v1/auth/login").send(payload);

    expect(first.status).not.toBe(429);
    expect(second.status).not.toBe(429);
    expect(third.status).toBe(429);
  });
});
