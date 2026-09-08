import { describe, expect, it } from "vitest";
import { loadConfig } from "../../lib/config.js";
import { createMarketRuntime } from "./runtime.js";
import type { Capability, MarketDataProvider } from "./providers/types.js";

const NOW = new Date("2026-09-08T18:00:00.000Z");
const PRICE_FEED_STOPPED = "price-feed-stopped";
const AGGREGATOR_STOPPED = "aggregator-stopped";

function stubProvider(): MarketDataProvider {
  const unavailable = async (): Promise<never> => {
    throw new Error("The stub provider serves no data.");
  };

  return {
    name: "simulated",
    capabilities: new Set<Capability>(["bars"]),
    start: async (): Promise<void> => undefined,
    stop: async (): Promise<void> => undefined,
    subscribeTrades: async (): Promise<void> => undefined,
    unsubscribeTrades: async (): Promise<void> => undefined,
    onTrade: () => (): void => undefined,
    getBars: unavailable,
    listAssets: unavailable,
    getProfile: unavailable,
    getQuote: unavailable,
  };
}

describe("market runtime shutdown", () => {
  it("stops the price feed before the aggregator flushes", async () => {
    const order: string[] = [];

    const runtime = createMarketRuntime({
      config: loadConfig(process.env),
      providers: [stubProvider()],
      now: () => NOW,
      log: () => undefined,
      priceTimers: {
        setInterval: () => "status",
        clearInterval: () => {
          order.push(PRICE_FEED_STOPPED);
        },
      },
      aggregatorTimers: {
        setTimeout: () => "sweep",
        clearTimeout: () => {
          order.push(AGGREGATOR_STOPPED);
        },
      },
    });

    await runtime.start();
    await runtime.stop();

    expect(order).toEqual([PRICE_FEED_STOPPED, AGGREGATOR_STOPPED]);
  });
});
