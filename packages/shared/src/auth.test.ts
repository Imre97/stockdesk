import { describe, expect, it } from "vitest";

import {
  AUTH_ERROR_CODES,
  authResponseSchema,
  displayNameSchema,
  emailSchema,
  loginSchema,
  meResponseSchema,
  passwordSchema,
  refreshResponseSchema,
  registerSchema,
  userSchema,
} from "./auth.js";

const VALID_PASSWORD = "correct-horse";
const VALID_USER = {
  id: "clx0000000000000000000000",
  email: "trader@example.com",
  displayName: "Trader",
  createdAt: "2026-09-08T10:00:00.000Z",
};

describe("emailSchema", () => {
  it("trims and lowercases the address", () => {
    expect(emailSchema.parse("  Trader@Example.COM ")).toBe("trader@example.com");
  });

  it.each([
    ["missing at sign", "traderexample.com"],
    ["missing domain", "trader@"],
    ["empty string", ""],
    ["only spaces", "   "],
  ])("rejects %s", (_label, input) => {
    expect(emailSchema.safeParse(input).success).toBe(false);
  });

  it("accepts an address of 254 characters", () => {
    expect(emailSchema.safeParse(`${"a".repeat(242)}@example.com`).success).toBe(true);
  });

  it("rejects an address longer than 254 characters", () => {
    expect(emailSchema.safeParse(`${"a".repeat(243)}@example.com`).success).toBe(false);
  });

  it("rejects a non-string value", () => {
    expect(emailSchema.safeParse(42).success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("rejects a password of 7 characters", () => {
    expect(passwordSchema.safeParse("a".repeat(7)).success).toBe(false);
  });

  it("accepts a password of 8 characters", () => {
    expect(passwordSchema.safeParse("a".repeat(8)).success).toBe(true);
  });

  it("accepts a password of 72 characters", () => {
    expect(passwordSchema.safeParse("a".repeat(72)).success).toBe(true);
  });

  it("rejects a password of 73 characters", () => {
    expect(passwordSchema.safeParse("a".repeat(73)).success).toBe(false);
  });

  it("keeps surrounding whitespace", () => {
    expect(passwordSchema.parse("  spaced password  ")).toBe("  spaced password  ");
  });
});

describe("displayNameSchema", () => {
  it("trims the value", () => {
    expect(displayNameSchema.parse("  Trader  ")).toBe("Trader");
  });

  it("rejects a value that is empty after trimming", () => {
    expect(displayNameSchema.safeParse("   ").success).toBe(false);
  });

  it("accepts a value of 50 characters", () => {
    expect(displayNameSchema.safeParse("a".repeat(50)).success).toBe(true);
  });

  it("rejects a value of 51 characters", () => {
    expect(displayNameSchema.safeParse("a".repeat(51)).success).toBe(false);
  });
});

describe("registerSchema", () => {
  it("normalizes the email and trims the display name", () => {
    const result = registerSchema.parse({
      email: "  Trader@Example.COM ",
      password: VALID_PASSWORD,
      displayName: "  Trader  ",
    });

    expect(result).toEqual({
      email: "trader@example.com",
      password: VALID_PASSWORD,
      displayName: "Trader",
    });
  });

  it.each([["email"], ["password"], ["displayName"]])("rejects a body without %s", (field) => {
    const body: Record<string, unknown> = {
      email: VALID_USER.email,
      password: VALID_PASSWORD,
      displayName: VALID_USER.displayName,
    };
    delete body[field];

    expect(registerSchema.safeParse(body).success).toBe(false);
  });

  it("rejects a short password", () => {
    const result = registerSchema.safeParse({
      email: VALID_USER.email,
      password: "a".repeat(7),
      displayName: VALID_USER.displayName,
    });

    expect(result.success).toBe(false);
  });

  it("strips unknown keys", () => {
    const result = registerSchema.parse({
      email: VALID_USER.email,
      password: VALID_PASSWORD,
      displayName: VALID_USER.displayName,
      role: "admin",
    });

    expect(result).not.toHaveProperty("role");
  });

  it("rejects a non-object body", () => {
    expect(registerSchema.safeParse("not-a-body").success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("normalizes the email", () => {
    const result = loginSchema.parse({ email: " TRADER@example.com ", password: VALID_PASSWORD });

    expect(result).toEqual({ email: "trader@example.com", password: VALID_PASSWORD });
  });

  it("rejects a body without a password", () => {
    expect(loginSchema.safeParse({ email: VALID_USER.email }).success).toBe(false);
  });

  it("accepts a password shorter than the registration minimum", () => {
    const result = loginSchema.parse({ email: VALID_USER.email, password: "a".repeat(7) });

    expect(result.password).toBe("a".repeat(7));
  });

  it("accepts a password longer than the registration maximum", () => {
    const result = loginSchema.parse({ email: VALID_USER.email, password: "a".repeat(73) });

    expect(result.password).toBe("a".repeat(73));
  });

  it("keeps surrounding whitespace in the password", () => {
    const result = loginSchema.parse({ email: VALID_USER.email, password: "  spaced  " });

    expect(result.password).toBe("  spaced  ");
  });

  it("rejects an empty password", () => {
    expect(loginSchema.safeParse({ email: VALID_USER.email, password: "" }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(loginSchema.safeParse({ email: "nope", password: VALID_PASSWORD }).success).toBe(false);
  });

  it("does not accept a display name into the output", () => {
    const result = loginSchema.parse({
      email: VALID_USER.email,
      password: VALID_PASSWORD,
      displayName: "Trader",
    });

    expect(result).not.toHaveProperty("displayName");
  });
});

describe("userSchema", () => {
  it("accepts the documented user shape", () => {
    expect(userSchema.parse(VALID_USER)).toEqual(VALID_USER);
  });

  it("strips passwordHash from the output", () => {
    const result = userSchema.parse({ ...VALID_USER, passwordHash: "$2b$12$fake" });

    expect(result).not.toHaveProperty("passwordHash");
    expect(result).toEqual(VALID_USER);
  });

  it("rejects an empty id", () => {
    expect(userSchema.safeParse({ ...VALID_USER, id: "" }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(userSchema.safeParse({ ...VALID_USER, email: "nope" }).success).toBe(false);
  });

  it.each([
    ["a date without time", "2026-09-08"],
    ["an epoch number", 1757325600000],
    ["an empty string", ""],
  ])("rejects createdAt as %s", (_label, createdAt) => {
    expect(userSchema.safeParse({ ...VALID_USER, createdAt }).success).toBe(false);
  });
});

describe("auth responses", () => {
  it("accepts an auth response", () => {
    const result = authResponseSchema.parse({ user: VALID_USER, accessToken: "header.payload.signature" });

    expect(result.user).toEqual(VALID_USER);
    expect(result.accessToken).toBe("header.payload.signature");
  });

  it("rejects an auth response with an empty access token", () => {
    expect(authResponseSchema.safeParse({ user: VALID_USER, accessToken: "" }).success).toBe(false);
  });

  it("rejects an auth response without a user", () => {
    expect(authResponseSchema.safeParse({ accessToken: "token" }).success).toBe(false);
  });

  it("accepts a refresh response", () => {
    expect(refreshResponseSchema.parse({ accessToken: "token" })).toEqual({ accessToken: "token" });
  });

  it("rejects a refresh response with an empty access token", () => {
    expect(refreshResponseSchema.safeParse({ accessToken: "" }).success).toBe(false);
  });

  it("accepts a me response", () => {
    expect(meResponseSchema.parse({ user: VALID_USER })).toEqual({ user: VALID_USER });
  });

  it("rejects a me response carrying passwordHash inside the user", () => {
    const result = meResponseSchema.parse({ user: { ...VALID_USER, passwordHash: "$2b$12$fake" } });

    expect(result.user).not.toHaveProperty("passwordHash");
  });
});

describe("AUTH_ERROR_CODES", () => {
  it("lists exactly the codes from the module spec", () => {
    expect(AUTH_ERROR_CODES).toEqual([
      "VALIDATION_ERROR",
      "EMAIL_TAKEN",
      "INVALID_CREDENTIALS",
      "UNAUTHORIZED",
      "REFRESH_REUSED",
      "RATE_LIMITED",
    ]);
  });
});
