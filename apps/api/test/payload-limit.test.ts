import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const app = createApp({ rateLimit: { enabled: false } });

const KILOBYTE = 1024;

describe("request body size limit", () => {
  it("rejects a body over the limit with PAYLOAD_TOO_LARGE", async () => {
    const oversized = JSON.stringify({
      email: "trader@example.com",
      password: "x".repeat(20 * KILOBYTE),
    });

    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send(oversized);

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({
      error: { code: "PAYLOAD_TOO_LARGE", message: expect.any(String) as unknown as string },
    });
  });

  it("still accepts a body under the limit", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ email: "trader@example.com", password: "x".repeat(KILOBYTE) }));

    expect(response.status).not.toBe(413);
  });
});
