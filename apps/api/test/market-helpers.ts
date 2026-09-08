import type { Express } from "express";
import { createApp } from "../src/app.js";
import { loadConfig, type AppConfig } from "../src/lib/config.js";
import { createMarketRuntime, type MarketRuntime } from "../src/modules/market/runtime.js";
import {
  createSimulatedProvider,
  type SimulatedProvider,
} from "../src/modules/market/providers/simulated/provider.js";
import type { MarketDataProvider } from "../src/modules/market/providers/types.js";
import { upsertSymbols } from "../src/modules/market/symbols-repository.js";

export const MARKET_NOW = new Date("2026-09-08T18:00:00.000Z");
export const MARKET_SEED = 424242;

export interface TestMarket {
  config: AppConfig;
  provider: SimulatedProvider;
  runtime: MarketRuntime;
  app: Express;
  logs: string[];
}

export interface CreateTestMarketOptions {
  now?: Date;
  seed?: number;
  providers?: (simulated: SimulatedProvider) => MarketDataProvider[];
}

export function createTestMarket(options: CreateTestMarketOptions = {}): TestMarket {
  const config = loadConfig(process.env);
  const instant = options.now ?? MARKET_NOW;
  const now = (): Date => instant;
  const provider = createSimulatedProvider({ seed: options.seed ?? MARKET_SEED, now });
  const providers = options.providers === undefined ? [provider] : options.providers(provider);
  const logs: string[] = [];

  const runtime = createMarketRuntime({
    config,
    providers,
    now,
    log: (message) => logs.push(message),
  });

  const app = createApp({ config, rateLimit: { enabled: false }, market: runtime });

  return { config, provider, runtime, app, logs };
}

export async function seedSymbols(market: TestMarket): Promise<void> {
  await upsertSymbols(await market.provider.listAssets(), "simulated");
}
