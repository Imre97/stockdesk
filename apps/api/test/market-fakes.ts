import type {
  AssetRecord,
  Capability,
  MarketDataProvider,
  ProviderName,
  Quote,
  SymbolProfile,
  TradeHandler,
} from "../src/modules/market/providers/types.js";

export interface FakeProviderOptions {
  name: ProviderName;
  capabilities: Capability[];
  getBars?: MarketDataProvider["getBars"];
  getProfile?: MarketDataProvider["getProfile"];
}

export function createFakeProvider(options: FakeProviderOptions): MarketDataProvider {
  const failing = async (): Promise<never> => {
    throw new Error(`${options.name} is unavailable`);
  };

  return {
    name: options.name,
    capabilities: new Set(options.capabilities),
    start: async (): Promise<void> => undefined,
    stop: async (): Promise<void> => undefined,
    subscribeTrades: async (): Promise<void> => undefined,
    unsubscribeTrades: async (): Promise<void> => undefined,
    onTrade: (_handler: TradeHandler) => (): void => undefined,
    getBars: options.getBars ?? failing,
    listAssets: async (): Promise<AssetRecord[]> => failing(),
    getProfile: options.getProfile ?? (async (): Promise<SymbolProfile | null> => failing()),
    getQuote: async (): Promise<Quote | null> => failing(),
  };
}
