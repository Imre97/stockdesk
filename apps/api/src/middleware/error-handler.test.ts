import { API_ERROR_CODES } from "@stockdesk/shared";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError } from "../lib/errors.js";
import { errorHandler } from "./error-handler.js";

function buildApp(): express.Express {
  const app = express();

  app.get("/app-error", () => {
    throw new AppError(409, "EMAIL_TAKEN", "Email already registered.");
  });

  app.get("/app-error-with-details", () => {
    throw new AppError(422, "VALIDATION_ERROR", "Request validation failed.", { field: "email" });
  });

  app.get("/zod-error", () => {
    z.object({ email: z.email() }).parse({ email: "not-an-email" });
  });

  app.get("/unknown-error", () => {
    throw new Error("boom");
  });

  app.use(errorHandler);
  return app;
}

describe("errorHandler", () => {
  it("maps an AppError to its status and error envelope", async () => {
    const response = await request(buildApp()).get("/app-error");

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: { code: "EMAIL_TAKEN", message: "Email already registered." },
    });
  });

  it("includes details when the AppError carries them", async () => {
    const response = await request(buildApp()).get("/app-error-with-details");

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details).toEqual({ field: "email" });
  });

  it("rejects an error code outside the shared union at compile time", () => {
    // @ts-expect-error a code outside AuthErrorCode | ApiErrorCode must not compile
    const invalid = new AppError(400, "NOT_A_CODE", "Bad request.");

    expect(invalid.code).toBe("NOT_A_CODE");
  });

  it("maps a ZodError to 422 VALIDATION_ERROR", async () => {
    const response = await request(buildApp()).get("/zod-error");

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(response.body.error.details)).toBe(true);
  });

  it("maps an unknown error to 500 INTERNAL_ERROR without leaking the message", async () => {
    const response = await request(buildApp()).get("/unknown-error");

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_ERROR");
    expect(API_ERROR_CODES).toContain(response.body.error.code);
    expect(response.body.error.message).not.toContain("boom");
  });
});
