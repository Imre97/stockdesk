import {
  BAR_SUBSCRIPTION_LIMIT,
  QUOTE_SUBSCRIPTION_LIMIT,
  type Timeframe,
} from "@stockdesk/shared";

export type SubscribeOutcome = "added" | "already" | "limit";

export interface QuoteSubscribeResult {
  symbol: string;
  outcome: SubscribeOutcome;
  first: boolean;
}

export interface BarSubscribeResult {
  outcome: SubscribeOutcome;
  first: boolean;
}

export interface BarUnsubscribeResult {
  removed: boolean;
  last: boolean;
}

export interface BarKey {
  symbol: string;
  timeframe: Timeframe;
}

export interface OrphanedSubscriptions {
  symbols: string[];
  bars: BarKey[];
}

export interface MarketSubscriptions {
  subscribeQuotes: (socket: object, symbols: string[]) => QuoteSubscribeResult[];
  unsubscribeQuotes: (socket: object, symbols: string[]) => string[];
  subscribeBar: (socket: object, symbol: string, timeframe: Timeframe) => BarSubscribeResult;
  unsubscribeBar: (socket: object, symbol: string, timeframe: Timeframe) => BarUnsubscribeResult;
  quoteSockets: (symbol: string) => object[];
  barSockets: (symbol: string, timeframe: Timeframe) => object[];
  removeSocket: (socket: object) => OrphanedSubscriptions;
  quoteCount: (socket: object) => number;
  barCount: (socket: object) => number;
}

interface SocketState {
  quotes: Set<string>;
  bars: Set<string>;
}

function barKeyOf(symbol: string, timeframe: Timeframe): string {
  return `${symbol}:${timeframe}`;
}

function parseBarKey(key: string): BarKey {
  const separator = key.lastIndexOf(":");

  return {
    symbol: key.slice(0, separator),
    timeframe: key.slice(separator + 1) as Timeframe,
  };
}

function addTo(index: Map<string, Set<object>>, key: string, socket: object): boolean {
  const holders = index.get(key);

  if (holders === undefined) {
    index.set(key, new Set([socket]));
    return true;
  }

  holders.add(socket);

  return false;
}

function removeFrom(index: Map<string, Set<object>>, key: string, socket: object): boolean {
  const holders = index.get(key);
  if (holders === undefined) return false;

  holders.delete(socket);
  if (holders.size > 0) return false;

  index.delete(key);

  return true;
}

export function createMarketSubscriptions(): MarketSubscriptions {
  const states = new Map<object, SocketState>();
  const quoteIndex = new Map<string, Set<object>>();
  const barIndex = new Map<string, Set<object>>();

  function stateOf(socket: object): SocketState {
    const known = states.get(socket);
    if (known !== undefined) return known;

    const created: SocketState = { quotes: new Set(), bars: new Set() };
    states.set(socket, created);

    return created;
  }

  return {
    subscribeQuotes(socket: object, symbols: string[]): QuoteSubscribeResult[] {
      const state = stateOf(socket);

      return symbols.map((symbol) => {
        if (state.quotes.has(symbol)) return { symbol, outcome: "already" as const, first: false };
        if (state.quotes.size >= QUOTE_SUBSCRIPTION_LIMIT) {
          return { symbol, outcome: "limit" as const, first: false };
        }

        state.quotes.add(symbol);

        return { symbol, outcome: "added" as const, first: addTo(quoteIndex, symbol, socket) };
      });
    },

    unsubscribeQuotes(socket: object, symbols: string[]): string[] {
      const state = stateOf(socket);
      const orphaned: string[] = [];

      for (const symbol of symbols) {
        if (!state.quotes.delete(symbol)) continue;
        if (removeFrom(quoteIndex, symbol, socket)) orphaned.push(symbol);
      }

      return orphaned;
    },

    subscribeBar(socket: object, symbol: string, timeframe: Timeframe): BarSubscribeResult {
      const state = stateOf(socket);
      const key = barKeyOf(symbol, timeframe);

      if (state.bars.has(key)) return { outcome: "already", first: false };
      if (state.bars.size >= BAR_SUBSCRIPTION_LIMIT) return { outcome: "limit", first: false };

      state.bars.add(key);

      return { outcome: "added", first: addTo(barIndex, key, socket) };
    },

    unsubscribeBar(socket: object, symbol: string, timeframe: Timeframe): BarUnsubscribeResult {
      const state = stateOf(socket);
      const key = barKeyOf(symbol, timeframe);

      if (!state.bars.delete(key)) return { removed: false, last: false };

      return { removed: true, last: removeFrom(barIndex, key, socket) };
    },

    quoteSockets(symbol: string): object[] {
      return [...(quoteIndex.get(symbol) ?? [])];
    },

    barSockets(symbol: string, timeframe: Timeframe): object[] {
      return [...(barIndex.get(barKeyOf(symbol, timeframe)) ?? [])];
    },

    removeSocket(socket: object): OrphanedSubscriptions {
      const state = states.get(socket);
      if (state === undefined) return { symbols: [], bars: [] };

      states.delete(socket);

      const symbols = [...state.quotes].filter((symbol) => removeFrom(quoteIndex, symbol, socket));
      const bars = [...state.bars]
        .filter((key) => {
          const { symbol, timeframe } = parseBarKey(key);
          return removeFrom(barIndex, barKeyOf(symbol, timeframe), socket);
        })
        .map(parseBarKey);

      return { symbols, bars };
    },

    quoteCount(socket: object): number {
      return states.get(socket)?.quotes.size ?? 0;
    },

    barCount(socket: object): number {
      return states.get(socket)?.bars.size ?? 0;
    },
  };
}
