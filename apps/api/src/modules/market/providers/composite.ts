import type {
  AssetRecord,
  Bar,
  BarsQuery,
  Capability,
  MarketDataProvider,
  Quote,
  SymbolProfile,
  TradeHandler,
} from "./types.js";

const SIMULATED = "simulated";
const RETRIES_PER_PROVIDER = 2;

export class ProviderUnavailableError extends Error {
  readonly capability: Capability;
  readonly symbol: string | null;

  constructor(capability: Capability, symbol: string | null) {
    super(
      symbol === null
        ? `No market data provider available for ${capability}`
        : `No market data provider available for ${capability} of ${symbol}`,
    );
    this.name = "ProviderUnavailableError";
    this.capability = capability;
    this.symbol = symbol;
  }
}

export interface CompositeProviderOptions {
  providers: MarketDataProvider[];
  log: (message: string) => void;
}

export type CompositeProvider = MarketDataProvider & {
  activeProviderNames(): string[];
  streamProviderName(): string | null;
};

type Attempt<T> = { ok: true; value: T } | { ok: false };

/**
 * Routing keeps the "never mix real and simulated" rule: the first non-simulated provider that
 * serves prices for a symbol claims it, and from then on the simulated provider is skipped for
 * that symbol's stream, bars, quote and profile even when the real chain fails.
 */
export function createCompositeProvider({ providers, log }: CompositeProviderOptions): CompositeProvider {
  const handlers = new Set<TradeHandler>();
  const claimedByReal = new Map<string, string>();
  const capabilities = new Set<Capability>();

  for (const provider of providers) {
    for (const capability of provider.capabilities) capabilities.add(capability);
    provider.onTrade((trade) => {
      for (const handler of handlers) handler(trade);
    });
  }

  function capableProviders(capability: Capability, symbol: string | null): MarketDataProvider[] {
    const capable = providers.filter((provider) => provider.capabilities.has(capability));
    if (symbol === null || !claimedByReal.has(symbol)) return capable;
    return capable.filter((provider) => provider.name !== SIMULATED);
  }

  async function attempt<T>(
    provider: MarketDataProvider,
    capability: Capability,
    symbol: string | null,
    call: (target: MarketDataProvider) => Promise<T>,
  ): Promise<Attempt<T>> {
    let failure: unknown;
    for (let tries = 0; tries < RETRIES_PER_PROVIDER; tries += 1) {
      try {
        return { ok: true, value: await call(provider) };
      } catch (error) {
        failure = error;
      }
    }
    log(failureMessage(provider.name, capability, symbol, failure));
    return { ok: false };
  }

  async function route<T>(
    capability: Capability,
    symbol: string | null,
    call: (target: MarketDataProvider) => Promise<T>,
  ): Promise<{ provider: MarketDataProvider; value: T }> {
    for (const provider of capableProviders(capability, symbol)) {
      const result = await attempt<T>(provider, capability, symbol, call);
      if (result.ok) return { provider, value: result.value };
    }
    throw new ProviderUnavailableError(capability, symbol);
  }

  function claim(provider: MarketDataProvider, symbols: string[]): void {
    if (provider.name === SIMULATED) return;
    for (const symbol of symbols) claimedByReal.set(symbol, provider.name);
  }

  async function subscribeGroup(group: string[], claimed: boolean): Promise<void> {
    const label = group.join(",");
    const capable = providers.filter(
      (provider) => provider.capabilities.has("stream") && (!claimed || provider.name !== SIMULATED),
    );
    for (const provider of capable) {
      const result = await attempt<void>(provider, "stream", label, (target) => target.subscribeTrades(group));
      if (result.ok) {
        claim(provider, group);
        return;
      }
    }
    throw new ProviderUnavailableError("stream", label);
  }

  return {
    name: "composite",
    capabilities,

    activeProviderNames(): string[] {
      return providers.map((provider) => provider.name);
    },

    streamProviderName(): string | null {
      return providers.find((provider) => provider.capabilities.has("stream"))?.name ?? null;
    },

    async start(): Promise<void> {
      for (const provider of providers) await provider.start();
    },

    async stop(): Promise<void> {
      for (const provider of providers) await provider.stop();
    },

    async subscribeTrades(symbols: string[]): Promise<void> {
      const claimed = symbols.filter((symbol) => claimedByReal.has(symbol));
      const free = symbols.filter((symbol) => !claimedByReal.has(symbol));
      if (free.length > 0) await subscribeGroup(free, false);
      if (claimed.length > 0) await subscribeGroup(claimed, true);
    },

    async unsubscribeTrades(symbols: string[]): Promise<void> {
      for (const provider of providers.filter((candidate) => candidate.capabilities.has("stream"))) {
        try {
          await provider.unsubscribeTrades(symbols);
        } catch (error) {
          log(failureMessage(provider.name, "stream", symbols.join(","), error));
        }
      }
    },

    onTrade(handler: TradeHandler): () => void {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },

    async getBars(query: BarsQuery): Promise<Bar[]> {
      const result = await route<Bar[]>("bars", query.symbol, (provider) => provider.getBars(query));
      if (result.value.length > 0) claim(result.provider, [query.symbol]);
      return result.value;
    },

    async listAssets(): Promise<AssetRecord[]> {
      const result = await route<AssetRecord[]>("search", null, (provider) => provider.listAssets());
      return result.value;
    },

    async getQuote(symbol: string): Promise<Quote | null> {
      const result = await route<Quote | null>("quote", symbol, (provider) => provider.getQuote(symbol));
      if (result.value !== null) claim(result.provider, [symbol]);
      return result.value;
    },

    async getProfile(symbol: string): Promise<SymbolProfile | null> {
      const candidates = capableProviders("profile", symbol);
      let served = candidates.length === 0;
      for (const provider of candidates) {
        const result = await attempt<SymbolProfile | null>(provider, "profile", symbol, (target) =>
          target.getProfile(symbol),
        );
        if (!result.ok) continue;
        served = true;
        if (result.value !== null && result.value !== undefined) return result.value;
      }
      if (!served) throw new ProviderUnavailableError("profile", symbol);
      return null;
    },
  };
}

function failureMessage(
  name: string,
  capability: Capability,
  symbol: string | null,
  error: unknown,
): string {
  const target = symbol === null ? capability : `${capability} ${symbol}`;
  return `Market data provider ${name} failed for ${target}: ${describe(error)}`;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
