import type { ProviderLogger, SocketTimers, TimerHandle } from "../reconnecting-socket.js";
import type { Trade } from "../types.js";

export const ALPACA_MAX_STREAMED_SYMBOLS = 30;
export const ALPACA_POLL_INTERVAL_MS = 5000;

export interface AlpacaSubscriptionsOptions {
  timers: SocketTimers;
  setStreamedSymbols: (symbols: string[]) => void;
  fetchLatestTrades: (symbols: string[]) => Promise<Trade[]>;
  onTrade: (trade: Trade) => void;
  log?: ProviderLogger;
  maxStreamedSymbols?: number;
  pollIntervalMs?: number;
}

export interface AlpacaSubscriptions {
  start: () => void;
  stop: () => void;
  requestSymbols: (symbols: string[]) => void;
  releaseSymbols: (symbols: string[]) => void;
  streamedSymbols: () => string[];
  polledSymbols: () => string[];
}

function sameList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function createAlpacaSubscriptions(options: AlpacaSubscriptionsOptions): AlpacaSubscriptions {
  const maxStreamed = options.maxStreamedSymbols ?? ALPACA_MAX_STREAMED_SYMBOLS;
  const pollIntervalMs = options.pollIntervalMs ?? ALPACA_POLL_INTERVAL_MS;
  const lastEmittedAt = new Map<string, number>();

  let recency: string[] = [];
  let streamed: string[] = [];
  let polled: string[] = [];
  let pollHandle: TimerHandle = null;
  let running = false;

  function applyRecency(): void {
    const splitAt = recency.length > maxStreamed ? recency.length - maxStreamed : 0;
    const nextPolled = recency.slice(0, splitAt);
    const nextStreamed = recency.slice(splitAt);

    polled = nextPolled;

    for (const symbol of lastEmittedAt.keys()) {
      if (nextPolled.includes(symbol)) continue;

      lastEmittedAt.delete(symbol);
    }

    if (sameList(streamed, nextStreamed)) return;

    streamed = nextStreamed;
    options.setStreamedSymbols([...streamed]);
  }

  function emitNewTrades(trades: Trade[]): void {
    for (const trade of trades) {
      const previous = lastEmittedAt.get(trade.symbol);
      const at = trade.at.getTime();

      if (previous !== undefined && at <= previous) continue;

      lastEmittedAt.set(trade.symbol, at);
      options.onTrade(trade);
    }
  }

  function schedulePoll(): void {
    if (!running || pollHandle !== null) return;

    pollHandle = options.timers.setTimeout(() => {
      pollHandle = null;
      void runPoll();
    }, pollIntervalMs);
  }

  async function runPoll(): Promise<void> {
    if (polled.length === 0) {
      schedulePoll();
      return;
    }

    try {
      emitNewTrades(await options.fetchLatestTrades([...polled]));
    } catch (error) {
      options.log?.warn(`Alpaca latest trades poll failed: ${String(error)}`);
    }

    schedulePoll();
  }

  return {
    start: () => {
      if (running) return;

      running = true;
      schedulePoll();
    },

    stop: () => {
      running = false;

      if (pollHandle === null) return;

      options.timers.clearTimeout(pollHandle);
      pollHandle = null;
    },

    requestSymbols: (symbols) => {
      const requested = [...new Set(symbols)];
      recency = [...recency.filter((symbol) => !requested.includes(symbol)), ...requested];
      applyRecency();
    },

    releaseSymbols: (symbols) => {
      recency = recency.filter((symbol) => !symbols.includes(symbol));
      applyRecency();
    },

    streamedSymbols: () => [...streamed],
    polledSymbols: () => [...polled],
  };
}
