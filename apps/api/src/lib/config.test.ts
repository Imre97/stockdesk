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

  it("defaults TRUST_PROXY_HOPS to 0 outside production", () => {
    expect(loadConfig(baseEnv).trustProxyHops).toBe(0);
    expect(loadConfig({ ...baseEnv, NODE_ENV: "development" }).trustProxyHops).toBe(0);
    expect(typeof loadConfig(baseEnv).trustProxyHops).toBe("number");
  });

  it("defaults TRUST_PROXY_HOPS to 1 in production", () => {
    expect(baseEnv.TRUST_PROXY_HOPS).toBeUndefined();
    expect(loadConfig({ ...baseEnv, NODE_ENV: "production" }).trustProxyHops).toBe(1);
  });

  it("lets an explicit TRUST_PROXY_HOPS override the environment default", () => {
    expect(loadConfig({ ...baseEnv, NODE_ENV: "production", TRUST_PROXY_HOPS: "0" }).trustProxyHops).toBe(0);
    expect(loadConfig({ ...baseEnv, NODE_ENV: "production", TRUST_PROXY_HOPS: "3" }).trustProxyHops).toBe(3);
    expect(loadConfig({ ...baseEnv, TRUST_PROXY_HOPS: "3" }).trustProxyHops).toBe(3);
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

  it("defaults the snapshot job settings", () => {
    const config = loadConfig(baseEnv);

    expect(config.snapshotIntervalSeconds).toBe(60);
    expect(config.snapshotFineRetentionDays).toBe(7);
    expect(config.snapshotCoarseRetentionDays).toBe(400);
    expect(config.snapshotThinningIntervalHours).toBe(24);
  });

  it("parses provided snapshot job settings", () => {
    const config = loadConfig({
      ...baseEnv,
      SNAPSHOT_INTERVAL_SECONDS: "15",
      SNAPSHOT_FINE_RETENTION_DAYS: "3",
      SNAPSHOT_COARSE_RETENTION_DAYS: "90",
      SNAPSHOT_THINNING_INTERVAL_HOURS: "6",
    });

    expect(config.snapshotIntervalSeconds).toBe(15);
    expect(config.snapshotFineRetentionDays).toBe(3);
    expect(config.snapshotCoarseRetentionDays).toBe(90);
    expect(config.snapshotThinningIntervalHours).toBe(6);
  });

  it("rejects non-positive or non-integer snapshot job settings", () => {
    expect(() => loadConfig({ ...baseEnv, SNAPSHOT_INTERVAL_SECONDS: "0" })).toThrowError(
      /SNAPSHOT_INTERVAL_SECONDS/,
    );
    expect(() => loadConfig({ ...baseEnv, SNAPSHOT_INTERVAL_SECONDS: "1.5" })).toThrowError(
      /SNAPSHOT_INTERVAL_SECONDS/,
    );
    expect(() => loadConfig({ ...baseEnv, SNAPSHOT_FINE_RETENTION_DAYS: "-1" })).toThrowError(
      /SNAPSHOT_FINE_RETENTION_DAYS/,
    );
    expect(() => loadConfig({ ...baseEnv, SNAPSHOT_COARSE_RETENTION_DAYS: "0" })).toThrowError(
      /SNAPSHOT_COARSE_RETENTION_DAYS/,
    );
    expect(() => loadConfig({ ...baseEnv, SNAPSHOT_THINNING_INTERVAL_HOURS: "many" })).toThrowError(
      /SNAPSHOT_THINNING_INTERVAL_HOURS/,
    );
  });

  it("defaults the market data providers to the full chain", () => {
    expect(loadConfig(baseEnv).marketDataProviders).toEqual(["alpaca", "finnhub", "simulated"]);
  });

  it("parses a provider list with spaces around the names", () => {
    const config = loadConfig({ ...baseEnv, MARKET_DATA_PROVIDERS: " simulated , alpaca " });

    expect(config.marketDataProviders).toEqual(["simulated", "alpaca"]);
  });

  it("parses a single provider", () => {
    expect(loadConfig({ ...baseEnv, MARKET_DATA_PROVIDERS: "simulated" }).marketDataProviders).toEqual(["simulated"]);
  });

  it("rejects an unknown provider name", () => {
    expect(() => loadConfig({ ...baseEnv, MARKET_DATA_PROVIDERS: "alpaca,polygon" })).toThrowError(
      /MARKET_DATA_PROVIDERS/,
    );
  });

  it("rejects an empty provider list", () => {
    expect(() => loadConfig({ ...baseEnv, MARKET_DATA_PROVIDERS: "" })).toThrowError(/MARKET_DATA_PROVIDERS/);
    expect(() => loadConfig({ ...baseEnv, MARKET_DATA_PROVIDERS: " , " })).toThrowError(/MARKET_DATA_PROVIDERS/);
  });

  it("treats an empty provider credential as absent", () => {
    const config = loadConfig({
      ...baseEnv,
      ALPACA_API_KEY: "",
      ALPACA_API_SECRET: "",
      FINNHUB_API_KEY: "",
    });

    expect(config.alpacaApiKey).toBeUndefined();
    expect(config.alpacaApiSecret).toBeUndefined();
    expect(config.finnhubApiKey).toBeUndefined();
  });

  it("leaves a missing provider credential undefined", () => {
    const config = loadConfig(baseEnv);

    expect(config.alpacaApiKey).toBeUndefined();
    expect(config.alpacaApiSecret).toBeUndefined();
    expect(config.finnhubApiKey).toBeUndefined();
  });

  it("parses provided provider credentials", () => {
    const config = loadConfig({
      ...baseEnv,
      ALPACA_API_KEY: "test-alpaca-key",
      ALPACA_API_SECRET: "test-alpaca-secret",
      FINNHUB_API_KEY: "test-finnhub-key",
    });

    expect(config.alpacaApiKey).toBe("test-alpaca-key");
    expect(config.alpacaApiSecret).toBe("test-alpaca-secret");
    expect(config.finnhubApiKey).toBe("test-finnhub-key");
  });

  it("defaults ALPACA_DATA_FEED to iex", () => {
    expect(loadConfig(baseEnv).alpacaDataFeed).toBe("iex");
  });

  it("parses the sip data feed and rejects an unknown one", () => {
    expect(loadConfig({ ...baseEnv, ALPACA_DATA_FEED: "sip" }).alpacaDataFeed).toBe("sip");
    expect(() => loadConfig({ ...baseEnv, ALPACA_DATA_FEED: "otc" })).toThrowError(/ALPACA_DATA_FEED/);
  });

  it("defaults the market data job settings", () => {
    const config = loadConfig(baseEnv);

    expect(config.symbolRefreshHours).toBe(24);
    expect(config.quoteThrottlePerSecond).toBe(4);
    expect(config.candleThinningIntervalHours).toBe(24);
  });

  it("parses provided market data job settings", () => {
    const config = loadConfig({
      ...baseEnv,
      SYMBOL_REFRESH_HOURS: "6",
      QUOTE_THROTTLE_PER_SECOND: "10",
      CANDLE_THINNING_INTERVAL_HOURS: "12",
    });

    expect(config.symbolRefreshHours).toBe(6);
    expect(config.quoteThrottlePerSecond).toBe(10);
    expect(config.candleThinningIntervalHours).toBe(12);
  });

  it("rejects non-positive or non-integer market data job settings", () => {
    expect(() => loadConfig({ ...baseEnv, SYMBOL_REFRESH_HOURS: "0" })).toThrowError(/SYMBOL_REFRESH_HOURS/);
    expect(() => loadConfig({ ...baseEnv, SYMBOL_REFRESH_HOURS: "1.5" })).toThrowError(/SYMBOL_REFRESH_HOURS/);
    expect(() => loadConfig({ ...baseEnv, QUOTE_THROTTLE_PER_SECOND: "-1" })).toThrowError(
      /QUOTE_THROTTLE_PER_SECOND/,
    );
    expect(() => loadConfig({ ...baseEnv, QUOTE_THROTTLE_PER_SECOND: "many" })).toThrowError(
      /QUOTE_THROTTLE_PER_SECOND/,
    );
    expect(() => loadConfig({ ...baseEnv, CANDLE_THINNING_INTERVAL_HOURS: "0" })).toThrowError(
      /CANDLE_THINNING_INTERVAL_HOURS/,
    );
  });

  it("defaults the order engine settings", () => {
    const config = loadConfig(baseEnv);

    expect(config.commissionPerOrder.toString()).toBe("0");
    expect(config.marketOrderBuffer.toString()).toBe("0.02");
    expect(config.shortMarginRate.toString()).toBe("0.5");
    expect(config.maintenanceMarginRate.toString()).toBe("0.3");
    expect(config.orderExpiryCheckSeconds).toBe(60);
  });

  it("parses provided order engine settings", () => {
    const config = loadConfig({
      ...baseEnv,
      COMMISSION_PER_ORDER: "1.25",
      MARKET_ORDER_BUFFER: "0.05",
      SHORT_MARGIN_RATE: "0.75",
      MAINTENANCE_MARGIN_RATE: "0.25",
      ORDER_EXPIRY_CHECK_SECONDS: "15",
    });

    expect(config.commissionPerOrder.toString()).toBe("1.25");
    expect(config.marketOrderBuffer.toString()).toBe("0.05");
    expect(config.shortMarginRate.toString()).toBe("0.75");
    expect(config.maintenanceMarginRate.toString()).toBe("0.25");
    expect(config.orderExpiryCheckSeconds).toBe(15);
  });

  it("rejects a negative order engine rate", () => {
    expect(() => loadConfig({ ...baseEnv, COMMISSION_PER_ORDER: "-0.01" })).toThrowError(
      /COMMISSION_PER_ORDER/,
    );
    expect(() => loadConfig({ ...baseEnv, MARKET_ORDER_BUFFER: "-0.02" })).toThrowError(
      /MARKET_ORDER_BUFFER/,
    );
    expect(() => loadConfig({ ...baseEnv, SHORT_MARGIN_RATE: "-0.5" })).toThrowError(/SHORT_MARGIN_RATE/);
    expect(() => loadConfig({ ...baseEnv, MAINTENANCE_MARGIN_RATE: "-0.3" })).toThrowError(
      /MAINTENANCE_MARGIN_RATE/,
    );
  });

  it("rejects a non-decimal order engine rate", () => {
    expect(() => loadConfig({ ...baseEnv, SHORT_MARGIN_RATE: "half" })).toThrowError(/SHORT_MARGIN_RATE/);
    expect(() => loadConfig({ ...baseEnv, ORDER_EXPIRY_CHECK_SECONDS: "0" })).toThrowError(
      /ORDER_EXPIRY_CHECK_SECONDS/,
    );
    expect(() => loadConfig({ ...baseEnv, ORDER_EXPIRY_CHECK_SECONDS: "1.5" })).toThrowError(
      /ORDER_EXPIRY_CHECK_SECONDS/,
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
