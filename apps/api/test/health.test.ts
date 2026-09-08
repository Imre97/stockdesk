import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const app = createApp({ rateLimit: { enabled: false } });

describe("GET /api/v1/health", () => {
  it("reports the database as reachable", async () => {
    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", database: "ok", ready: true });
  });

  it("reports the database as unreachable when the check fails", async () => {
    const degraded = createApp({
      rateLimit: { enabled: false },
      checkDatabase: () => Promise.reject(new Error("connection refused")),
    });

    const response = await request(degraded).get("/api/v1/health");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: "degraded", database: "unreachable", ready: true });
  });

  it("keeps answering 200 with ready false while the boot tasks are still running", async () => {
    const booting = createApp({
      rateLimit: { enabled: false },
      readiness: { isReady: () => false, markReady: () => undefined },
    });

    const response = await request(booting).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", database: "ok", ready: false });
  });
});
