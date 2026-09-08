import { describe, expect, it } from "vitest";
import { loadConfig } from "../../lib/config.js";
import {
  createRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
  verifyAccessToken,
} from "./tokens.js";

const config = loadConfig(process.env);

describe("access tokens", () => {
  it("signs and verifies a round trip", () => {
    const token = signAccessToken(config, "user-1");

    expect(verifyAccessToken(config, token)).toBe("user-1");
  });

  it("rejects a token signed with another secret", () => {
    const token = signAccessToken(config, "user-1", { secret: "another-test-secret" });

    expect(() => verifyAccessToken(config, token)).toThrowError();
  });

  it("rejects an expired token", () => {
    const token = signAccessToken(config, "user-1", { ttl: "0s" });

    expect(() => verifyAccessToken(config, token)).toThrowError();
  });

  it("rejects a token that is not a JWT", () => {
    expect(() => verifyAccessToken(config, "not-a-jwt")).toThrowError();
  });
});

describe("refresh tokens", () => {
  it("encodes 32 random bytes as base64url", () => {
    const token = createRefreshToken();

    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createRefreshToken()).not.toBe(token);
  });

  it("hashes deterministically to 64 hex characters", () => {
    const token = createRefreshToken();
    const hash = hashRefreshToken(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(token)).toBe(hash);
    expect(hashRefreshToken(createRefreshToken())).not.toBe(hash);
  });

  it("computes an expiry in the future", () => {
    const now = new Date("2026-09-08T10:00:00.000Z");

    expect(refreshTokenExpiry(config, now).getTime()).toBeGreaterThan(now.getTime());
  });
});
