import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { truncateAll } from "./db.js";
import { findRefreshCookieHeader, registerUser } from "./helpers.js";

const app = createApp({ rateLimit: { enabled: false } });

function clearsTheCookie(header: string): boolean {
  if (header.includes("Max-Age=0")) return true;
  const expires = /Expires=([^;]+)/.exec(header)?.[1];
  if (expires === undefined) return false;
  return new Date(expires).getTime() <= Date.now();
}

describe("POST /api/v1/auth/logout", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("clears the cookie and invalidates the refresh token", async () => {
    const registered = await registerUser(app);

    const response = await request(app).post("/api/v1/auth/logout").set("Cookie", registered.cookie);

    expect(response.status).toBe(204);

    const header = findRefreshCookieHeader(response);
    expect(header).toContain("Path=/api/v1/auth");
    expect(clearsTheCookie(header)).toBe(true);

    const refresh = await request(app).post("/api/v1/auth/refresh").set("Cookie", registered.cookie);
    expect(refresh.status).toBe(401);
  });

  it("succeeds without a cookie", async () => {
    const response = await request(app).post("/api/v1/auth/logout");

    expect(response.status).toBe(204);
  });

  it("is idempotent", async () => {
    const registered = await registerUser(app);

    const first = await request(app).post("/api/v1/auth/logout").set("Cookie", registered.cookie);
    const second = await request(app).post("/api/v1/auth/logout").set("Cookie", registered.cookie);

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
  });
});
