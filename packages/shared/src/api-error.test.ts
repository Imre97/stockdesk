import { describe, expect, it } from "vitest";

import { ACCOUNT_ERROR_CODES } from "./accounts.js";
import type { ErrorCode } from "./api-error.js";
import { API_ERROR_CODES, apiErrorSchema, isApiErrorEnvelope } from "./api-error.js";
import { AUTH_ERROR_CODES } from "./auth.js";
import { MARKET_ERROR_CODES } from "./market.js";
import { ORDER_ERROR_CODES } from "./orders.js";

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
  it("lists exactly the transport-level codes", () => {
    expect(API_ERROR_CODES).toEqual([
      "NOT_FOUND",
      "INTERNAL_ERROR",
      "PAYLOAD_TOO_LARGE",
      "VALIDATION_ERROR",
      "UNAUTHORIZED",
    ]);
  });

  it.each([["VALIDATION_ERROR"], ["UNAUTHORIZED"]])("owns the shared code %s", (code) => {
    expect(API_ERROR_CODES).toContain(code);
  });
});

describe("ErrorCode", () => {
  const OWNED_CODES: [string, readonly string[]][] = [
    ["api", API_ERROR_CODES],
    ["auth", AUTH_ERROR_CODES],
    ["accounts", ACCOUNT_ERROR_CODES],
    ["market", MARKET_ERROR_CODES],
    ["orders", ORDER_ERROR_CODES],
  ];

  it("keeps the module code arrays disjoint so every code has one owner", () => {
    const owners = new Map<string, string>();

    for (const [owner, codes] of OWNED_CODES) {
      for (const code of codes) {
        expect(owners.get(code) ?? owner).toBe(owner);
        owners.set(code, owner);
      }
    }
  });

  it("accepts every module code", () => {
    const codes: ErrorCode[] = [
      ...API_ERROR_CODES,
      ...AUTH_ERROR_CODES,
      ...ACCOUNT_ERROR_CODES,
      ...MARKET_ERROR_CODES,
      ...ORDER_ERROR_CODES,
    ];

    expect(codes).toHaveLength(OWNED_CODES.reduce((total, [, owned]) => total + owned.length, 0));
  });
});
