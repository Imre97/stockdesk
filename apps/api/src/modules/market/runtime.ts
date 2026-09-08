import type { AppConfig } from "../../lib/config.js";
import {
  createBarAggregator,
  type BarAggregator,
  type BarAggregatorTimers,
} from "./bar-aggregator.js";
import * as candlesRepository from "./candles-repository.js";
import { createCandleCache, type CandleCache } from "./candles.js";
import { createPriceService, type PriceService, type PriceTimers } from "./price-service.js";
import { createCompositeProvider, type CompositeProvider } from "./providers/composite.js";
import type { SocketTimers } from "./providers/reconnecting-socket.js";
import { createSimulatedProvider } from "./providers/simulated/provider.js";
import type { MarketDataProvider } from "./providers/types.js";
import { createSymbolsService, type SymbolsService } from "./symbols.js";
import { findActiveSymbol } from "./symbols-repository.js";

const SIMULATED = "simulated";

export interface MarketRuntimeOptions {
  config: AppConfig;
  providers?: MarketDataProvider[] | undefined;
  now?: (() => Date) | undefined;
  log?: ((message: string) => void) | undefined;
  timers?: SocketTimers | undefined;
  priceTimers?: PriceTimers | undefined;
  aggregatorTimers?: BarAggregatorTimers | undefined;
}

export interface MarketRuntime {
  providers: MarketDataProvider[];
  composite: CompositeProvider;
  priceService: PriceService;
  candles: CandleCache;
  aggregator: BarAggregator;
  symbols: SymbolsService;
  streamProviderName: () => string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

function defaultLog(message: string): void {
  process.stdout.write(`${message}\n`);
}

function symbolSource(providers: MarketDataProvider[]): string {
  return providers.find((provider) => provider.capabilities.has("search"))?.name ?? SIMULATED;
}

async function symbolIdOf(symbol: string): Promise<string | null> {
  return (await findActiveSymbol(symbol))?.id ?? null;
}

export function createMarketRuntime(options: MarketRuntimeOptions): MarketRuntime {
  const now = options.now ?? ((): Date => new Date());
  const log = options.log ?? defaultLog;
  const providers = options.providers ?? [createSimulatedProvider({ now })];
  const composite = createCompositeProvider({ providers, log });
  const candles = createCandleCache({ composite, now, log });

  const priceService = createPriceService({
    composite,
    candles,
    now,
    log,
    timers: options.priceTimers,
  });

  const aggregator = createBarAggregator({
    priceService,
    candles: candlesRepository,
    symbols: symbolIdOf,
    now,
    log,
    timers: options.aggregatorTimers,
  });

  const symbols = createSymbolsService({
    composite,
    prices: priceService,
    now,
    log,
    source: symbolSource(providers),
    refreshHours: options.config.symbolRefreshHours,
    timers: options.timers,
  });

  return {
    providers,
    composite,
    priceService,
    candles,
    aggregator,
    symbols,
    streamProviderName: () => composite.streamProviderName(),

    async start(): Promise<void> {
      await composite.start();
      priceService.start();
      aggregator.start();
    },

    async stop(): Promise<void> {
      await aggregator.stop();
      priceService.stop();
      await composite.stop();
    },
  };
}
