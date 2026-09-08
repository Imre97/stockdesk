import { describe, expect, it } from "vitest";

import { API_ERROR_CODES, apiErrorSchema, isApiErrorEnvelope } from "./api-error.js";

const ENVELOPE = { error: { code: "EMAIL_TAKEN", message: "Email already registered" } };

describe("apiErrorSchema", () => {
  it("accepts an envelope without details", () => {
    const result = apiErrorSchema.parse(ENVELOPE);

    expect(result.error.code).toBe("EMAIL_TAKEN");
    expect(result.error.message).toBe("Email already registered");
  });

  it("accepts an envelope with details of any shape", () => {
    const result = apiErrorSchema.parse({
      error: { code: "VALIDATION_ERROR", message: "Invalid body", details: { fieldErrors: { email: ["Invalid"] } } },
    });

    expect(result.error.details).toEqual({ fieldErrors: { email: ["Invalid"] } });
  });

  it("rejects a bare message object", () => {
    expect(apiErrorSchema.safeParse({ message: "x" }).success).toBe(false);
  });

  it.each([
    ["a missing code", { error: { message: "x" } }],
    ["a missing message", { error: { code: "UNAUTHORIZED" } }],
    ["a non-string code", { error: { code: 401, message: "x" } }],
    ["a non-string message", { error: { code: "UNAUTHORIZED", message: 401 } }],
    ["a missing error key", {}],
    ["a null error", { error: null }],
    ["a string body", "boom"],
    ["null", null],
  ])("rejects an envelope with %s", (_label, input) => {
    expect(apiErrorSchema.safeParse(input).success).toBe(false);
  });

  it("strips unknown keys from the error object", () => {
    const result = apiErrorSchema.parse({ error: { ...ENVELOPE.error, stack: "secret stack" } });

    expect(result.error).not.toHaveProperty("stack");
  });
});

describe("isApiErrorEnvelope", () => {
  it("returns true for a valid envelope", () => {
    expect(isApiErrorEnvelope(ENVELOPE)).toBe(true);
  });

  it("narrows the value so the code is readable", () => {
    const value: unknown = ENVELOPE;

    if (!isApiErrorEnvelope(value)) {
      throw new Error("expected an api error envelope");
    }

    expect(value.error.code).toBe("EMAIL_TAKEN");
  });

  it.each([
    ["a bare message object", { message: "x" }],
    ["an empty object", {}],
    ["null", null],
    ["undefined", undefined],
    ["a string", "boom"],
    ["a number", 500],
  ])("returns false for %s", (_label, input) => {
    expect(isApiErrorEnvelope(input)).toBe(false);
  });
});

describe("API_ERROR_CODES", () => {
  it("lists the codes emitted by the app shell", () => {
    expect(API_ERROR_CODES).toContain("NOT_FOUND");
    expect(API_ERROR_CODES).toContain("INTERNAL_ERROR");
  });
});
