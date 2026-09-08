import type { AppConfig } from "../../lib/config.js";
import { createCandleCache, type CandleCache } from "./candles.js";
import { createPriceService, type PriceService, type PriceTimers } from "./price-service.js";
import { createCompositeProvider, type CompositeProvider } from "./providers/composite.js";
import type { SocketTimers } from "./providers/reconnecting-socket.js";
import { createSimulatedProvider } from "./providers/simulated/provider.js";
import type { MarketDataProvider } from "./providers/types.js";
import { createSymbolsService, type SymbolsService } from "./symbols.js";

const SIMULATED = "simulated";

export interface MarketRuntimeOptions {
  config: AppConfig;
  providers?: MarketDataProvider[] | undefined;
  now?: (() => Date) | undefined;
  log?: ((message: string) => void) | undefined;
  timers?: SocketTimers | undefined;
  priceTimers?: PriceTimers | undefined;
}

export interface MarketRuntime {
  providers: MarketDataProvider[];
  composite: CompositeProvider;
  priceService: PriceService;
  candles: CandleCache;
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
    symbols,
    streamProviderName: () => composite.streamProviderName(),

    async start(): Promise<void> {
      await composite.start();
      priceService.start();
    },

    async stop(): Promise<void> {
      priceService.stop();
      await composite.stop();
    },
  };
}
