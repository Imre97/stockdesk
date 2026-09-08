import type { ProviderLogger, ProviderSocketFactory, SocketTimers } from "../reconnecting-socket.js";
import type {
  AssetRecord,
  Bar,
  Capability,
  MarketDataProvider,
  ProfileOptions,
  Quote,
  SymbolProfile,
  Trade,
  TradeHandler,
} from "../types.js";
import { createFinnhubClient, type FetchLike } from "./client.js";
import { fetchFinnhubProfile } from "./profile.js";
import { fetchFinnhubSymbols } from "./search.js";
import { createFinnhubStream } from "./stream.js";

const FINNHUB_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  "profile",
  "stream",
  "search",
]);

export interface FinnhubProviderOptions {
  key: string;
  fetchImpl: FetchLike;
  WebSocketImpl: ProviderSocketFactory;
  timers: SocketTimers;
  log?: ProviderLogger;
  baseUrl?: string;
  streamBaseUrl?: string;
}

export function createFinnhubProvider(options: FinnhubProviderOptions): MarketDataProvider {
  const client = createFinnhubClient({
    key: options.key,
    fetchImpl: options.fetchImpl,
    ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
  });

  const handlers = new Set<TradeHandler>();
  let streamed: string[] = [];

  const stream = createFinnhubStream({
    key: options.key,
    WebSocketImpl: options.WebSocketImpl,
    timers: options.timers,
    onTrade: (trade: Trade) => {
      for (const handler of handlers) handler(trade);
    },
    ...(options.log === undefined ? {} : { log: options.log }),
    ...(options.streamBaseUrl === undefined ? {} : { baseUrl: options.streamBaseUrl }),
  });

  return {
    name: "finnhub",
    capabilities: FINNHUB_CAPABILITIES,

    start: (): Promise<void> => {
      stream.start();

      return Promise.resolve();
    },

    stop: (): Promise<void> => {
      stream.stop();

      return Promise.resolve();
    },

    subscribeTrades: (symbols: string[]): Promise<void> => {
      streamed = [...streamed, ...symbols.filter((symbol) => !streamed.includes(symbol))];
      stream.setSymbols(streamed);

      return Promise.resolve();
    },

    unsubscribeTrades: (symbols: string[]): Promise<void> => {
      streamed = streamed.filter((symbol) => !symbols.includes(symbol));
      stream.setSymbols(streamed);

      return Promise.resolve();
    },

    onTrade: (handler: TradeHandler): (() => void) => {
      handlers.add(handler);

      return () => {
        handlers.delete(handler);
      };
    },

    getBars: (): Promise<Bar[]> =>
      Promise.reject(new Error("The Finnhub provider does not support historical bars.")),

    listAssets: (): Promise<AssetRecord[]> => fetchFinnhubSymbols(client),

    getProfile: (symbol: string, options?: ProfileOptions): Promise<SymbolProfile | null> =>
      fetchFinnhubProfile(client, symbol, options?.parts ?? "all"),

    getQuote: (): Promise<Quote | null> => Promise.resolve(null),
  };
}
