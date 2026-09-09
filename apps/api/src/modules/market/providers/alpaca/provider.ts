import type { ProviderLogger, ProviderSocketFactory, SocketTimers } from "../reconnecting-socket.js";
import type {
  AssetRecord,
  Bar,
  BarsQuery,
  Capability,
  HistoryDepth,
  MarketDataProvider,
  Quote,
  SymbolProfile,
  Trade,
  TradeHandler,
} from "../types.js";
import { fetchAlpacaAssets } from "./assets.js";
import { fetchAlpacaBars } from "./bars.js";
import { createAlpacaClient, type AlpacaFeed, type FetchLike } from "./client.js";
import { fetchAlpacaLatestTrades } from "./latest-trades.js";
import { createAlpacaStream } from "./stream.js";
import { createAlpacaSubscriptions } from "./subscriptions.js";

const ALPACA_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>(["stream", "bars", "search"]);

const DAYS_PER_YEAR = 365;
const DAILY_HISTORY_YEARS = 10;
const INTRADAY_HISTORY_YEARS = 5;

export const ALPACA_HISTORY_DEPTH: HistoryDepth = {
  dailyDays: DAILY_HISTORY_YEARS * DAYS_PER_YEAR,
  intradayDays: INTRADAY_HISTORY_YEARS * DAYS_PER_YEAR,
};

export interface AlpacaProviderOptions {
  key: string;
  secret: string;
  feed: AlpacaFeed;
  fetchImpl: FetchLike;
  WebSocketImpl: ProviderSocketFactory;
  timers: SocketTimers;
  log?: ProviderLogger;
  dataBaseUrl?: string;
  tradingBaseUrl?: string;
  streamBaseUrl?: string;
}

export function createAlpacaProvider(options: AlpacaProviderOptions): MarketDataProvider {
  const client = createAlpacaClient({
    key: options.key,
    secret: options.secret,
    feed: options.feed,
    fetchImpl: options.fetchImpl,
    ...(options.dataBaseUrl === undefined ? {} : { dataBaseUrl: options.dataBaseUrl }),
    ...(options.tradingBaseUrl === undefined ? {} : { tradingBaseUrl: options.tradingBaseUrl }),
  });

  const handlers = new Set<TradeHandler>();

  function emit(trade: Trade): void {
    for (const handler of handlers) handler(trade);
  }

  const stream = createAlpacaStream({
    key: options.key,
    secret: options.secret,
    feed: options.feed,
    WebSocketImpl: options.WebSocketImpl,
    timers: options.timers,
    onTrade: emit,
    ...(options.log === undefined ? {} : { log: options.log }),
    ...(options.streamBaseUrl === undefined ? {} : { baseUrl: options.streamBaseUrl }),
  });

  const subscriptions = createAlpacaSubscriptions({
    timers: options.timers,
    setStreamedSymbols: (symbols) => stream.setSymbols(symbols),
    fetchLatestTrades: (symbols) => fetchAlpacaLatestTrades(client, symbols),
    onTrade: emit,
    ...(options.log === undefined ? {} : { log: options.log }),
  });

  return {
    name: "alpaca",
    capabilities: ALPACA_CAPABILITIES,
    historyDepth: ALPACA_HISTORY_DEPTH,

    start: (): Promise<void> => {
      stream.start();
      subscriptions.start();

      return Promise.resolve();
    },

    stop: (): Promise<void> => {
      subscriptions.stop();
      stream.stop();

      return Promise.resolve();
    },

    subscribeTrades: (symbols: string[]): Promise<void> => {
      subscriptions.requestSymbols(symbols);

      return Promise.resolve();
    },

    unsubscribeTrades: (symbols: string[]): Promise<void> => {
      subscriptions.releaseSymbols(symbols);

      return Promise.resolve();
    },

    onTrade: (handler: TradeHandler): (() => void) => {
      handlers.add(handler);

      return () => {
        handlers.delete(handler);
      };
    },

    getBars: (query: BarsQuery): Promise<Bar[]> => fetchAlpacaBars(client, query),

    listAssets: (): Promise<AssetRecord[]> => fetchAlpacaAssets(client),

    getProfile: (): Promise<SymbolProfile | null> => Promise.resolve(null),

    getQuote: (): Promise<Quote | null> => Promise.resolve(null),
  };
}
