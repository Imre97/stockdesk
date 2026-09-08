import { Decimal, type MarketStatus, type Timeframe } from "@stockdesk/shared";
import { marketStatusAt } from "./calendar.js";
import * as candlesRepository from "./candles-repository.js";
import type { CandleRow } from "./candles-repository.js";
import type { CandleCache } from "./candles.js";
import type { CompositeProvider } from "./providers/composite.js";
import type { Quote, Trade, TradeHandler } from "./providers/types.js";
import { findActiveSymbol } from "./symbols-repository.js";
import { bucketStartMs } from "./timeframes.js";

const SIMULATED = "simulated";
const DAILY: Timeframe = "1D";
const MINUTE: Timeframe = "1m";
const WARM_BARS = 5;
const STATUS_CHECK_INTERVAL_MS = 60_000;
const PERCENT = 100;

export interface PriceTimers {
  setInterval: (handler: () => void, delayMs: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

export const systemPriceTimers: PriceTimers = {
  setInterval: (handler, delayMs) => {
    const timer = setInterval(handler, delayMs);
    timer.unref();
    return timer;
  },
  clearInterval: (handle) => {
    clearInterval(handle as ReturnType<typeof setInterval>);
  },
};

export interface QuoteSnapshot {
  last: Decimal;
  prevClose: Decimal | null;
  open: Decimal | null;
  high: Decimal | null;
  low: Decimal | null;
  volume: Decimal | null;
  change: Decimal | null;
  changePct: Decimal | null;
  at: Date;
}

export interface PriceServiceOptions {
  composite: CompositeProvider;
  candles: CandleCache;
  now: () => Date;
  log: (message: string) => void;
  timers?: PriceTimers | undefined;
}

export interface PriceService {
  onTrade: (handler: TradeHandler) => () => void;
  lastTrade: (symbol: string) => Trade | undefined;
  getLastPrice: (symbol: string) => Promise<Decimal | null>;
  getPrevClose: (symbol: string, at?: Date) => Promise<Decimal | null>;
  getQuoteSnapshot: (symbol: string) => Promise<QuoteSnapshot | null>;
  getMarketStatus: () => MarketStatus;
  onStatusChange: (listener: (status: MarketStatus) => void) => () => void;
  ensureStreaming: (symbols: string[]) => Promise<void>;
  releaseStreaming: (symbols: string[]) => Promise<void>;
  start: () => void;
  stop: () => void;
}

function toDecimal(value: { toString: () => string }): Decimal {
  return new Decimal(value.toString());
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function dayStart(at: Date): Date {
  return new Date(bucketStartMs(at.getTime(), DAILY));
}

function sameStatus(left: MarketStatus, right: MarketStatus): boolean {
  return (
    left.status === right.status &&
    left.nextOpenAt === right.nextOpenAt &&
    left.nextCloseAt === right.nextCloseAt
  );
}

function sessionValue(
  forming: CandleRow | null,
  fallback: Quote | null,
  field: "open" | "high" | "low" | "volume",
): Decimal | null {
  if (forming !== null) return toDecimal(forming[field]);

  return fallback?.[field] ?? null;
}

export function createPriceService(options: PriceServiceOptions): PriceService {
  const { composite, candles, now, log } = options;
  const timers = options.timers ?? systemPriceTimers;

  const lastTrades = new Map<string, Trade>();
  const statusListeners = new Set<(status: MarketStatus) => void>();
  const streamCounts = new Map<string, number>();

  let statusHandle: unknown = null;
  let lastStatus: MarketStatus | null = null;

  composite.onTrade((trade) => {
    lastTrades.set(trade.symbol, trade);
  });

  function currentStatus(): MarketStatus {
    if (composite.streamProviderName() === SIMULATED) {
      return { status: "open", nextOpenAt: null, nextCloseAt: null };
    }

    const status = marketStatusAt(now());

    return {
      status: status.status,
      nextOpenAt: status.nextOpenAt === null ? null : status.nextOpenAt.toISOString(),
      nextCloseAt: status.nextCloseAt === null ? null : status.nextCloseAt.toISOString(),
    };
  }

  async function symbolId(symbol: string): Promise<string | null> {
    const record = await findActiveSymbol(symbol);

    return record === null ? null : record.id;
  }

  async function cachedClose(id: string): Promise<Decimal | null> {
    const minute = await candlesRepository.latestBar(id, MINUTE);
    if (minute !== null) return toDecimal(minute.close);

    const daily = await candlesRepository.latestBar(id, DAILY);

    return daily === null ? null : toDecimal(daily.close);
  }

  async function prevCloseFor(id: string, at: Date): Promise<Decimal | null> {
    const row = await candlesRepository.latestFinalBarBefore(id, DAILY, dayStart(at));

    return row === null ? null : toDecimal(row.close);
  }

  async function simulatedQuote(symbol: string): Promise<Quote | null> {
    if (composite.streamProviderName() !== SIMULATED) return null;

    try {
      return await composite.getQuote(symbol);
    } catch (error) {
      log(`Reading the simulated quote for ${symbol} failed: ${describe(error)}`);
      return null;
    }
  }

  function checkStatus(): void {
    const status = currentStatus();
    if (lastStatus !== null && sameStatus(lastStatus, status)) return;

    lastStatus = status;
    for (const listener of statusListeners) listener(status);
  }

  async function subscribe(symbols: string[]): Promise<void> {
    if (symbols.length === 0) return;

    try {
      await composite.subscribeTrades(symbols);
    } catch (error) {
      log(`Subscribing to trades for ${symbols.join(",")} failed: ${describe(error)}`);
    }
  }

  async function unsubscribe(symbols: string[]): Promise<void> {
    if (symbols.length === 0) return;

    try {
      await composite.unsubscribeTrades(symbols);
    } catch (error) {
      log(`Unsubscribing from trades for ${symbols.join(",")} failed: ${describe(error)}`);
    }
  }

  async function quoteSnapshot(symbol: string): Promise<QuoteSnapshot | null> {
    const id = await symbolId(symbol);
    if (id === null) return null;

    await candles.getBars({ symbol, timeframe: DAILY, limit: WARM_BARS });

    const at = now();
    const trade = lastTrades.get(symbol);
    const forming = await candlesRepository.formingBarAt(id, DAILY, dayStart(at));
    const fallback = forming === null ? await simulatedQuote(symbol) : null;
    const last = trade?.price ?? fallback?.last ?? (await cachedClose(id));
    if (last === null || last === undefined) return null;

    const prevClose = (await prevCloseFor(id, at)) ?? fallback?.prevClose ?? null;
    const change = prevClose === null ? null : last.minus(prevClose);
    const changePct =
      change === null || prevClose === null || prevClose.isZero()
        ? null
        : change.dividedBy(prevClose).times(PERCENT);

    return {
      last,
      prevClose,
      open: sessionValue(forming, fallback, "open"),
      high: sessionValue(forming, fallback, "high"),
      low: sessionValue(forming, fallback, "low"),
      volume: sessionValue(forming, fallback, "volume"),
      change,
      changePct,
      at: trade?.at ?? fallback?.at ?? at,
    };
  }

  return {
    onTrade: (handler) => composite.onTrade(handler),

    lastTrade: (symbol) => lastTrades.get(symbol),

    async getLastPrice(symbol: string): Promise<Decimal | null> {
      const trade = lastTrades.get(symbol);
      if (trade !== undefined) return trade.price;

      const id = await symbolId(symbol);

      return id === null ? null : await cachedClose(id);
    },

    async getPrevClose(symbol: string, at?: Date): Promise<Decimal | null> {
      const id = await symbolId(symbol);

      return id === null ? null : await prevCloseFor(id, at ?? now());
    },

    getQuoteSnapshot: quoteSnapshot,

    getMarketStatus: currentStatus,

    onStatusChange(listener: (status: MarketStatus) => void): () => void {
      statusListeners.add(listener);

      return () => {
        statusListeners.delete(listener);
      };
    },

    async ensureStreaming(symbols: string[]): Promise<void> {
      const fresh: string[] = [];

      for (const symbol of symbols) {
        const count = streamCounts.get(symbol) ?? 0;
        streamCounts.set(symbol, count + 1);
        if (count === 0) fresh.push(symbol);
      }

      await subscribe(fresh);
    },

    async releaseStreaming(symbols: string[]): Promise<void> {
      const dropped: string[] = [];

      for (const symbol of symbols) {
        const count = streamCounts.get(symbol) ?? 0;
        if (count > 1) {
          streamCounts.set(symbol, count - 1);
          continue;
        }
        streamCounts.delete(symbol);
        if (count === 1) dropped.push(symbol);
      }

      await unsubscribe(dropped);
    },

    start(): void {
      lastStatus = currentStatus();
      statusHandle ??= timers.setInterval(checkStatus, STATUS_CHECK_INTERVAL_MS);
    },

    stop(): void {
      if (statusHandle === null) return;

      timers.clearInterval(statusHandle);
      statusHandle = null;
    },
  };
}
