import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { truncateAll } from "./db.js";
import {
  DEFAULT_PASSWORD,
  expectNoMonetaryNumbers,
  findRefreshCookieHeader,
  registerUser,
  uniqueEmail,
} from "./helpers.js";

const app = createApp({ rateLimit: { enabled: false } });

function refreshCookieOrUndefined(response: request.Response): string | undefined {
  const header = response.headers["set-cookie"] as string[] | string | undefined;
  if (header === undefined) return undefined;
  const values = Array.isArray(header) ? header : [header];
  return values.find((value) => value.startsWith("refreshToken="));
}

describe("POST /api/v1/auth/login", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("returns the user, an access token and a refresh cookie for valid credentials", async () => {
    const registered = await registerUser(app);

    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: registered.user.email, password: DEFAULT_PASSWORD });

    expect(response.status).toBe(200);

    const body = response.body as { user: Record<string, unknown>; accessToken: unknown };
    expect(body.user.id).toBe(registered.user.id);
    expect(body.user.email).toBe(registered.user.email);
    expect(body.user).not.toHaveProperty("passwordHash");
    expect(typeof body.accessToken).toBe("string");

    const cookie = findRefreshCookieHeader(response);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/api/v1/auth");

    expectNoMonetaryNumbers(body);
  });

  it("normalizes the email casing", async () => {
    const registered = await registerUser(app);

    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: registered.user.email.toUpperCase(), password: DEFAULT_PASSWORD });

    expect(response.status).toBe(200);
  });

  it("returns the same 401 body for a wrong password and for an unknown email", async () => {
    const registered = await registerUser(app);

    const wrongPassword = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: registered.user.email, password: "wrong-pass-99" });

    const unknownEmail = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: uniqueEmail("nobody"), password: DEFAULT_PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toMatchObject({ error: { code: "INVALID_CREDENTIALS" } });
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(refreshCookieOrUndefined(wrongPassword)).toBeUndefined();
    expect(refreshCookieOrUndefined(unknownEmail)).toBeUndefined();
  });

  it("rejects a missing password with a validation error", async () => {
    const response = await request(app).post("/api/v1/auth/login").send({ email: uniqueEmail() });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });
});
