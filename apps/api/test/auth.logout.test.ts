import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { truncateAll } from "./db.js";
import { DEFAULT_PASSWORD, extractRefreshCookie, findRefreshCookieHeader, registerUser } from "./helpers.js";

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
    expect(refresh.body).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("leaves the other sessions of the same user untouched", async () => {
    const registered = await registerUser(app);
    const cookieA = registered.cookie;

    const secondLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: registered.user.email, password: DEFAULT_PASSWORD });
    expect(secondLogin.status).toBe(200);
    const cookieB = extractRefreshCookie(secondLogin);
    expect(cookieB).not.toBe(cookieA);

    const loggedOut = await request(app).post("/api/v1/auth/logout").set("Cookie", cookieA);
    expect(loggedOut.status).toBe(204);

    const refreshB = await request(app).post("/api/v1/auth/refresh").set("Cookie", cookieB);
    expect(refreshB.status).toBe(200);
    const rotatedB = extractRefreshCookie(refreshB);

    const retryA = await request(app).post("/api/v1/auth/refresh").set("Cookie", cookieA);
    expect(retryA.status).toBe(401);
    expect(retryA.body).toMatchObject({ error: { code: "UNAUTHORIZED" } });

    const refreshRotatedB = await request(app).post("/api/v1/auth/refresh").set("Cookie", rotatedB);
    expect(refreshRotatedB.status).toBe(200);
  });

  it("keeps a rotated token as a reuse tombstone", async () => {
    const registered = await registerUser(app);

    const rotated = await request(app).post("/api/v1/auth/refresh").set("Cookie", registered.cookie);
    expect(rotated.status).toBe(200);
    const successor = extractRefreshCookie(rotated);

    const loggedOut = await request(app).post("/api/v1/auth/logout").set("Cookie", registered.cookie);
    expect(loggedOut.status).toBe(204);

    const replay = await request(app).post("/api/v1/auth/refresh").set("Cookie", registered.cookie);
    expect(replay.status).toBe(401);
    expect(replay.body).toMatchObject({ error: { code: "REFRESH_REUSED" } });

    const successorAfterReuse = await request(app).post("/api/v1/auth/refresh").set("Cookie", successor);
    expect(successorAfterReuse.status).toBe(401);

    const live = await prisma.refreshToken.count({
      where: { userId: registered.user.id, revokedAt: null },
    });
    expect(live).toBe(0);
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
