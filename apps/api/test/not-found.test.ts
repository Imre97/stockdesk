import { API_ERROR_CODES } from "@stockdesk/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const app = createApp({ rateLimit: { enabled: false } });

describe("unknown API routes", () => {
  it("returns the JSON error envelope for an unknown GET path", async () => {
    const response = await request(app).get("/api/v1/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: "NOT_FOUND", message: "Route not found." } });
    expect(API_ERROR_CODES).toContain((response.body as { error: { code: string } }).error.code);
  });

  it("returns the JSON error envelope for an unknown POST path", async () => {
    const response = await request(app).post("/api/v1/auth/does-not-exist").send({});

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: "NOT_FOUND" } });
  });
});
