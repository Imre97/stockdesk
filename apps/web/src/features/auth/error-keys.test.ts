import { describe, expect, it } from "vitest";

import { HttpError, getErrorCode } from "../../lib/http";
import {
  GENERIC_ERROR_KEY,
  LOGIN_FIELD_ERROR_KEYS,
  REGISTER_FIELD_ERROR_KEYS,
  toFieldErrorKeys,
  toServerErrorKey,
} from "./error-keys";

describe("toServerErrorKey", () => {
  it.each([
    ["EMAIL_TAKEN", "auth:errors.EMAIL_TAKEN"],
    ["INVALID_CREDENTIALS", "auth:errors.INVALID_CREDENTIALS"],
    ["RATE_LIMITED", "auth:errors.RATE_LIMITED"],
    ["VALIDATION_ERROR", "auth:errors.VALIDATION_ERROR"],
    ["UNAUTHORIZED", "auth:errors.UNAUTHORIZED"],
    ["REFRESH_REUSED", "auth:errors.UNAUTHORIZED"],
  ])("maps the server code %s to %s", (code, expected) => {
    expect(toServerErrorKey(getErrorCode(new HttpError(400, code, "rejected")))).toBe(expected);
  });

  it("falls back to the generic key for an unknown server code", () => {
    expect(toServerErrorKey(getErrorCode(new HttpError(500, "INTERNAL_ERROR", "boom")))).toBe(GENERIC_ERROR_KEY);
  });

  it("falls back to the generic key for an error without a code", () => {
    expect(toServerErrorKey(getErrorCode(new Error("network down")))).toBe(GENERIC_ERROR_KEY);
  });
});

describe("toFieldErrorKeys", () => {
  it("maps an invalid login email to the email key", () => {
    const errors = toFieldErrorKeys([{ path: ["email"], code: "invalid_format" }], LOGIN_FIELD_ERROR_KEYS);

    expect(errors).toEqual({ email: "auth:errors.emailInvalid" });
  });

  it("maps an empty login password to the required key", () => {
    const errors = toFieldErrorKeys([{ path: ["password"], code: "too_small" }], LOGIN_FIELD_ERROR_KEYS);

    expect(errors).toEqual({ password: "auth:errors.passwordRequired" });
  });

  it("separates a short and a long registration password", () => {
    expect(toFieldErrorKeys([{ path: ["password"], code: "too_small" }], REGISTER_FIELD_ERROR_KEYS)).toEqual({
      password: "auth:errors.passwordTooShort",
    });
    expect(toFieldErrorKeys([{ path: ["password"], code: "too_big" }], REGISTER_FIELD_ERROR_KEYS)).toEqual({
      password: "auth:errors.passwordTooLong",
    });
  });

  it("separates a missing and a long registration display name", () => {
    expect(toFieldErrorKeys([{ path: ["displayName"], code: "too_small" }], REGISTER_FIELD_ERROR_KEYS)).toEqual({
      displayName: "auth:errors.displayNameRequired",
    });
    expect(toFieldErrorKeys([{ path: ["displayName"], code: "too_big" }], REGISTER_FIELD_ERROR_KEYS)).toEqual({
      displayName: "auth:errors.displayNameTooLong",
    });
  });

  it("keeps the first issue per field and reports every field", () => {
    const errors = toFieldErrorKeys(
      [
        { path: ["email"], code: "invalid_format" },
        { path: ["email"], code: "too_big" },
        { path: ["displayName"], code: "too_small" },
      ],
      REGISTER_FIELD_ERROR_KEYS,
    );

    expect(errors).toEqual({
      email: "auth:errors.emailInvalid",
      displayName: "auth:errors.displayNameRequired",
    });
  });

  it("uses the generic key for an unmapped field and ignores non-string paths", () => {
    expect(toFieldErrorKeys([{ path: ["role"], code: "invalid_type" }], LOGIN_FIELD_ERROR_KEYS)).toEqual({
      role: GENERIC_ERROR_KEY,
    });
    expect(toFieldErrorKeys([{ path: [0], code: "invalid_type" }], LOGIN_FIELD_ERROR_KEYS)).toEqual({});
  });
});
