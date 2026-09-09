import { describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../../../lib/config.js";
import { loadConfig } from "../../../lib/config.js";
import { createProvidersFromConfig } from "./factory.js";
import { SIMULATED_HISTORY_DEPTH } from "./simulated/buckets.js";
import type { Capability, MarketDataProvider } from "./types.js";

const BASE_ENVIRONMENT = {
  DATABASE_URL: "postgresql://stockdesk:stockdesk@localhost:5432/stockdesk_test",
  JWT_ACCESS_SECRET: "test-secret",
};

const ALPACA_CREDENTIALS = {
  ALPACA_API_KEY: "test-alpaca-key",
  ALPACA_API_SECRET: "test-alpaca-secret",
};

const FINNHUB_CREDENTIALS = { FINNHUB_API_KEY: "test-finnhub-key" };

function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({ ...BASE_ENVIRONMENT, ...overrides });
}

function stubProvider(name: MarketDataProvider["name"], capabilities: Capability[]): MarketDataProvider {
  return {
    name,
    capabilities: new Set(capabilities),
    historyDepth: SIMULATED_HISTORY_DEPTH,
    async start() {
      return undefined;
    },
    async stop() {
      return undefined;
    },
    async subscribeTrades() {
      return undefined;
    },
    async unsubscribeTrades() {
      return undefined;
    },
    onTrade() {
      return () => undefined;
    },
    async getBars() {
      return [];
    },
    async listAssets() {
      return [];
    },
    async getProfile() {
      return null;
    },
    async getQuote() {
      return null;
    },
  };
}

function deps(log: (message: string) => void) {
  return {
    log,
    now: () => new Date("2026-09-08T18:34:00.000Z"),
    createAlpaca: () => stubProvider("alpaca", ["stream", "bars", "search"]),
    createFinnhub: () => stubProvider("finnhub", ["profile"]),
    createSimulated: () => stubProvider("simulated", ["stream", "bars", "search", "profile", "quote"]),
  };
}

describe("createProvidersFromConfig", () => {
  it("keeps only the simulated provider when no key is configured", () => {
    const log = vi.fn();

    const providers = createProvidersFromConfig(testConfig(), deps(log));

    expect(providers.map((provider) => provider.name)).toEqual(["simulated"]);
    expect(log).toHaveBeenCalledWith("Market data provider alpaca skipped: not configured");
    expect(log).toHaveBeenCalledWith("Market data provider finnhub skipped: not configured");
    expect(log).toHaveBeenCalledWith("Market data providers active: simulated");
  });

  it("skips alpaca when only one half of its credentials is present", () => {
    const log = vi.fn();

    const providers = createProvidersFromConfig(
      testConfig({ ALPACA_API_KEY: "test-alpaca-key" }),
      deps(log),
    );

    expect(providers.map((provider) => provider.name)).toEqual(["simulated"]);
    expect(log).toHaveBeenCalledWith("Market data provider alpaca skipped: not configured");
  });

  it("builds every configured provider in the order of the list", () => {
    const log = vi.fn();

    const providers = createProvidersFromConfig(
      testConfig({ ...ALPACA_CREDENTIALS, ...FINNHUB_CREDENTIALS }),
      deps(log),
    );

    expect(providers.map((provider) => provider.name)).toEqual(["alpaca", "finnhub", "simulated"]);
    expect(log).toHaveBeenCalledWith("Market data providers active: alpaca, finnhub, simulated");
  });

  it("honours a reordered provider list", () => {
    const providers = createProvidersFromConfig(
      testConfig({
        ...ALPACA_CREDENTIALS,
        ...FINNHUB_CREDENTIALS,
        MARKET_DATA_PROVIDERS: "finnhub,alpaca,simulated",
      }),
      deps(vi.fn()),
    );

    expect(providers.map((provider) => provider.name)).toEqual(["finnhub", "alpaca", "simulated"]);
  });

  it("appends the simulated provider when the list leaves it out", () => {
    const providers = createProvidersFromConfig(
      testConfig({ ...ALPACA_CREDENTIALS, MARKET_DATA_PROVIDERS: "alpaca" }),
      deps(vi.fn()),
    );

    expect(providers.map((provider) => provider.name)).toEqual(["alpaca", "simulated"]);
  });

  it("keeps the simulated provider last when the list puts it first", () => {
    const providers = createProvidersFromConfig(
      testConfig({ ...ALPACA_CREDENTIALS, MARKET_DATA_PROVIDERS: "simulated,alpaca" }),
      deps(vi.fn()),
    );

    expect(providers.map((provider) => provider.name)).toEqual(["alpaca", "simulated"]);
  });
});
