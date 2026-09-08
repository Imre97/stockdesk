import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { truncateAll } from "./db.js";
import { extractRefreshCookie, findRefreshCookieHeader, registerUser } from "./helpers.js";

const app = createApp({ rateLimit: { enabled: false } });

describe("POST /api/v1/auth/refresh", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("rotates the refresh token and issues a working access token", async () => {
    const registered = await registerUser(app);

    const response = await request(app).post("/api/v1/auth/refresh").set("Cookie", registered.cookie);

    expect(response.status).toBe(200);

    const body = response.body as { accessToken: unknown };
    expect(typeof body.accessToken).toBe("string");

    const rotated = extractRefreshCookie(response);
    expect(rotated).not.toBe(registered.cookie);
    expect(findRefreshCookieHeader(response)).toContain("Path=/api/v1/auth");

    const me = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${body.accessToken as string}`);
    expect(me.status).toBe(200);
    expect((me.body as { user: { id: string } }).user.id).toBe(registered.user.id);
  });

  it("detects reuse of a rotated token and revokes every session of the user", async () => {
    const registered = await registerUser(app);

    const first = await request(app).post("/api/v1/auth/refresh").set("Cookie", registered.cookie);
    expect(first.status).toBe(200);
    const rotated = extractRefreshCookie(first);

    const reuse = await request(app).post("/api/v1/auth/refresh").set("Cookie", registered.cookie);
    expect(reuse.status).toBe(401);
    expect(reuse.body).toMatchObject({ error: { code: "REFRESH_REUSED" } });

    const active = await prisma.refreshToken.count({
      where: { userId: registered.user.id, revokedAt: null },
    });
    expect(active).toBe(0);

    const afterRevocation = await request(app).post("/api/v1/auth/refresh").set("Cookie", rotated);
    expect(afterRevocation.status).toBe(401);
    expect(afterRevocation.body).toMatchObject({ error: { code: "REFRESH_REUSED" } });
  });

  it("never rotates the same token twice when two refreshes race", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await truncateAll();
      const registered = await registerUser(app);

      const responses = await Promise.all([
        request(app).post("/api/v1/auth/refresh").set("Cookie", registered.cookie),
        request(app).post("/api/v1/auth/refresh").set("Cookie", registered.cookie),
      ]);

      const statuses = responses.map((response) => response.status).sort((left, right) => left - right);
      expect(statuses).toEqual([200, 401]);

      const rejected = responses.find((response) => response.status === 401);
      expect(rejected?.body).toMatchObject({ error: { code: "REFRESH_REUSED" } });

      const live = await prisma.refreshToken.count({
        where: { userId: registered.user.id, revokedAt: null },
      });
      expect(live).toBe(0);
    }
  });

  it("prunes expired refresh tokens when it rotates", async () => {
    const registered = await registerUser(app);

    const expired = await prisma.refreshToken.create({
      data: {
        userId: registered.user.id,
        tokenHash: "expired-token-hash",
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const live = await prisma.refreshToken.create({
      data: {
        userId: registered.user.id,
        tokenHash: "live-token-hash",
        expiresAt: new Date(Date.now() + 600_000),
      },
    });

    const response = await request(app).post("/api/v1/auth/refresh").set("Cookie", registered.cookie);
    expect(response.status).toBe(200);

    expect(await prisma.refreshToken.findUnique({ where: { id: expired.id } })).toBeNull();
    expect(await prisma.refreshToken.findUnique({ where: { id: live.id } })).not.toBeNull();
  });

  it("rejects a request without a cookie", async () => {
    const response = await request(app).post("/api/v1/auth/refresh");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("rejects an unknown token", async () => {
    await registerUser(app);

    const response = await request(app).post("/api/v1/auth/refresh").set("Cookie", "refreshToken=unknown-value");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("rejects an expired token", async () => {
    const registered = await registerUser(app);

    await prisma.refreshToken.updateMany({
      where: { userId: registered.user.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const response = await request(app).post("/api/v1/auth/refresh").set("Cookie", registered.cookie);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });
});
