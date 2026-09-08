import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const baseEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  PORT: "3000",
  DATABASE_URL: "postgresql://stockdesk:stockdesk@localhost:5432/stockdesk",
  DIRECT_URL: "postgresql://stockdesk:stockdesk@localhost:5432/stockdesk",
  DATABASE_URL_TEST: "postgresql://stockdesk:stockdesk@localhost:5432/stockdesk_test",
  JWT_ACCESS_SECRET: "test-secret",
  CORS_ORIGIN: "http://localhost:5173",
};

describe("loadConfig", () => {
  it("parses a valid environment", () => {
    const config = loadConfig(baseEnv);

    expect(config.nodeEnv).toBe("test");
    expect(config.port).toBe(3000);
    expect(config.databaseUrl).toBe(baseEnv.DATABASE_URL);
    expect(config.jwtAccessSecret).toBe("test-secret");
    expect(config.corsOrigin).toBe("http://localhost:5173");
  });

  it("throws when JWT_ACCESS_SECRET is missing", () => {
    const { JWT_ACCESS_SECRET: _removed, ...withoutSecret } = baseEnv;

    expect(() => loadConfig(withoutSecret)).toThrowError(/JWT_ACCESS_SECRET/);
  });

  it("throws when PORT is not a number", () => {
    expect(() => loadConfig({ ...baseEnv, PORT: "not-a-port" })).toThrowError(/PORT/);
  });

  it("defaults JWT_ACCESS_TTL to 15m", () => {
    expect(loadConfig(baseEnv).jwtAccessTtl).toBe("15m");
  });

  it("defaults REFRESH_TOKEN_TTL_DAYS to the number 7", () => {
    const config = loadConfig(baseEnv);

    expect(config.refreshTokenTtlDays).toBe(7);
    expect(typeof config.refreshTokenTtlDays).toBe("number");
  });

  it("defaults WEB_DIST_DIR to the web build output", () => {
    expect(loadConfig(baseEnv).webDistDir).toBe("../web/dist");
  });

  it("defaults the auth rate limit to 10 requests per 15 minutes", () => {
    const config = loadConfig(baseEnv);

    expect(config.authRateLimitMax).toBe(10);
    expect(config.authRateLimitWindowMinutes).toBe(15);
  });

  it("parses a provided auth rate limit", () => {
    const config = loadConfig({
      ...baseEnv,
      AUTH_RATE_LIMIT_MAX: "25",
      AUTH_RATE_LIMIT_WINDOW_MINUTES: "5",
    });

    expect(config.authRateLimitMax).toBe(25);
    expect(config.authRateLimitWindowMinutes).toBe(5);
  });

  it("rejects a non-positive auth rate limit", () => {
    expect(() => loadConfig({ ...baseEnv, AUTH_RATE_LIMIT_MAX: "0" })).toThrowError(/AUTH_RATE_LIMIT_MAX/);
    expect(() => loadConfig({ ...baseEnv, AUTH_RATE_LIMIT_MAX: "-1" })).toThrowError(/AUTH_RATE_LIMIT_MAX/);
    expect(() => loadConfig({ ...baseEnv, AUTH_RATE_LIMIT_WINDOW_MINUTES: "0" })).toThrowError(
      /AUTH_RATE_LIMIT_WINDOW_MINUTES/,
    );
    expect(() => loadConfig({ ...baseEnv, AUTH_RATE_LIMIT_WINDOW_MINUTES: "-15" })).toThrowError(
      /AUTH_RATE_LIMIT_WINDOW_MINUTES/,
    );
  });

  it("defaults TRUST_PROXY_HOPS to 0", () => {
    const config = loadConfig(baseEnv);

    expect(config.trustProxyHops).toBe(0);
    expect(typeof config.trustProxyHops).toBe("number");
  });

  it("parses a provided TRUST_PROXY_HOPS", () => {
    expect(loadConfig({ ...baseEnv, TRUST_PROXY_HOPS: "1" }).trustProxyHops).toBe(1);
    expect(loadConfig({ ...baseEnv, TRUST_PROXY_HOPS: "2" }).trustProxyHops).toBe(2);
  });

  it("rejects a negative or non-integer TRUST_PROXY_HOPS", () => {
    expect(() => loadConfig({ ...baseEnv, TRUST_PROXY_HOPS: "-1" })).toThrowError(/TRUST_PROXY_HOPS/);
    expect(() => loadConfig({ ...baseEnv, TRUST_PROXY_HOPS: "1.5" })).toThrowError(/TRUST_PROXY_HOPS/);
    expect(() => loadConfig({ ...baseEnv, TRUST_PROXY_HOPS: "one" })).toThrowError(/TRUST_PROXY_HOPS/);
  });

  it("defaults REFRESH_TOKEN_PRUNE_INTERVAL_MINUTES to 60", () => {
    expect(loadConfig(baseEnv).refreshTokenPruneIntervalMinutes).toBe(60);
  });

  it("parses and validates REFRESH_TOKEN_PRUNE_INTERVAL_MINUTES", () => {
    expect(loadConfig({ ...baseEnv, REFRESH_TOKEN_PRUNE_INTERVAL_MINUTES: "5" }).refreshTokenPruneIntervalMinutes).toBe(
      5,
    );
    expect(() => loadConfig({ ...baseEnv, REFRESH_TOKEN_PRUNE_INTERVAL_MINUTES: "0" })).toThrowError(
      /REFRESH_TOKEN_PRUNE_INTERVAL_MINUTES/,
    );
    expect(() => loadConfig({ ...baseEnv, REFRESH_TOKEN_PRUNE_INTERVAL_MINUTES: "1.5" })).toThrowError(
      /REFRESH_TOKEN_PRUNE_INTERVAL_MINUTES/,
    );
  });

  it("rejects a non-integer auth rate limit", () => {
    expect(() => loadConfig({ ...baseEnv, AUTH_RATE_LIMIT_MAX: "1.5" })).toThrowError(/AUTH_RATE_LIMIT_MAX/);
    expect(() => loadConfig({ ...baseEnv, AUTH_RATE_LIMIT_MAX: "ten" })).toThrowError(/AUTH_RATE_LIMIT_MAX/);
    expect(() => loadConfig({ ...baseEnv, AUTH_RATE_LIMIT_WINDOW_MINUTES: "2.5" })).toThrowError(
      /AUTH_RATE_LIMIT_WINDOW_MINUTES/,
    );
  });
});
