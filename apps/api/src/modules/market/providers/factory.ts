import type { AppConfig } from "../../../lib/config.js";
import type { SimulatedProviderOptions } from "./simulated/provider.js";
import { createSimulatedProvider } from "./simulated/provider.js";
import type { MarketDataProvider } from "./types.js";

export interface ProviderFactoryDeps {
  log: (message: string) => void;
  now?: () => Date;
  createAlpaca: (config: AppConfig) => MarketDataProvider;
  createFinnhub: (config: AppConfig) => MarketDataProvider;
  createSimulated?: (options: SimulatedProviderOptions) => MarketDataProvider;
}

export function createProvidersFromConfig(config: AppConfig, deps: ProviderFactoryDeps): MarketDataProvider[] {
  const providers: MarketDataProvider[] = [];

  for (const name of config.marketDataProviders) {
    if (name === "simulated") continue;
    if (name === "alpaca") {
      if (config.alpacaApiKey !== undefined && config.alpacaApiSecret !== undefined) {
        providers.push(deps.createAlpaca(config));
      } else {
        deps.log(skipped("alpaca"));
      }
      continue;
    }
    if (config.finnhubApiKey !== undefined) providers.push(deps.createFinnhub(config));
    else deps.log(skipped("finnhub"));
  }

  const createSimulated = deps.createSimulated ?? createSimulatedProvider;
  providers.push(createSimulated(deps.now === undefined ? {} : { now: deps.now }));
  deps.log(`Market data providers active: ${providers.map((provider) => provider.name).join(", ")}`);

  return providers;
}

function skipped(name: string): string {
  return `Market data provider ${name} skipped: not configured`;
}
