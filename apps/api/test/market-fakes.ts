import { Decimal } from "@stockdesk/shared";
import { SIMULATED_HISTORY_DEPTH } from "../src/modules/market/providers/simulated/buckets.js";
import type {
  AssetRecord,
  Capability,
  HistoryDepth,
  MarketDataProvider,
  ProviderName,
  Quote,
  SymbolProfile,
  Trade,
  TradeHandler,
} from "../src/modules/market/providers/types.js";

export interface FakeTradeInput {
  symbol: string;
  price: string | Decimal;
  size?: string | Decimal;
  at?: Date;
}

export interface FakeProviderOptions {
  name: ProviderName;
  capabilities: Capability[];
  getBars?: MarketDataProvider["getBars"];
  getProfile?: MarketDataProvider["getProfile"];
  historyDepth?: HistoryDepth;
  now?: () => Date;
}

export type FakeProvider = MarketDataProvider & {
  emit: (trade: FakeTradeInput) => void;
  subscribedSymbols: () => string[];
};

const DEFAULT_TRADE_SIZE = "1";

export function createFakeProvider(options: FakeProviderOptions): FakeProvider {
  const failing = async (): Promise<never> => {
    throw new Error(`${options.name} is unavailable`);
  };

  const now = options.now ?? ((): Date => new Date());
  const subscribed = new Set<string>();
  const handlers = new Set<TradeHandler>();

  return {
    name: options.name,
    capabilities: new Set(options.capabilities),
    historyDepth: options.historyDepth ?? SIMULATED_HISTORY_DEPTH,
    start: async (): Promise<void> => undefined,
    stop: async (): Promise<void> => undefined,

    subscribeTrades: async (symbols: string[]): Promise<void> => {
      for (const symbol of symbols) subscribed.add(symbol.trim().toUpperCase());
    },

    unsubscribeTrades: async (symbols: string[]): Promise<void> => {
      for (const symbol of symbols) subscribed.delete(symbol.trim().toUpperCase());
    },

    onTrade: (handler: TradeHandler) => {
      handlers.add(handler);

      return (): void => {
        handlers.delete(handler);
      };
    },

    subscribedSymbols: () => [...subscribed],

    emit: (trade: FakeTradeInput): void => {
      const symbol = trade.symbol.trim().toUpperCase();
      if (!subscribed.has(symbol)) return;

      const fanned: Trade = {
        symbol,
        price: new Decimal(trade.price),
        size: new Decimal(trade.size ?? DEFAULT_TRADE_SIZE),
        at: trade.at ?? now(),
      };

      for (const handler of handlers) handler(fanned);
    },

    getBars: options.getBars ?? failing,
    listAssets: async (): Promise<AssetRecord[]> => failing(),
    getProfile: options.getProfile ?? (async (): Promise<SymbolProfile | null> => failing()),
    getQuote: async (): Promise<Quote | null> => failing(),
  };
}
