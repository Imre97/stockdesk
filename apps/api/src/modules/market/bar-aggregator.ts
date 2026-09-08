import { Decimal, type Timeframe } from "@stockdesk/shared";
import { createBarWriter, type BarWriterCandles, type PendingBar } from "./bar-writer.js";
import type { Trade, TradeHandler } from "./providers/types.js";
import { bucketStartMs, nextBucketStartMs } from "./timeframes.js";

const ALWAYS_AGGREGATED: Timeframe[] = ["1m", "1D"];
const DEFAULT_PERSIST_INTERVAL_MS = 1000;
const SWEEP_INTERVAL_MS = 60_000;

export type AggregatorCandles = BarWriterCandles;

export interface AggregatedBar {
  time: Date;
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume: Decimal;
}

export interface BarUpdate {
  symbol: string;
  timeframe: Timeframe;
  bar: AggregatedBar;
  isFinal: boolean;
}

export interface BarAggregatorTimers {
  setTimeout: (handler: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export const systemBarTimers: BarAggregatorTimers = {
  setTimeout: (handler, delayMs) => {
    const timer = setTimeout(handler, delayMs);
    timer.unref();
    return timer;
  },
  clearTimeout: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

export interface AggregatorPriceService {
  onTrade: (handler: TradeHandler) => () => void;
}

export interface BarAggregatorOptions {
  priceService: AggregatorPriceService;
  candles: AggregatorCandles;
  symbols: (symbol: string) => Promise<string | null>;
  now: () => Date;
  log: (message: string) => void;
  timers?: BarAggregatorTimers | undefined;
  persistIntervalMs?: number | undefined;
}

export interface BarAggregator {
  trackTimeframe: (symbol: string, timeframe: Timeframe) => void;
  untrackTimeframe: (symbol: string, timeframe: Timeframe) => void;
  onBar: (handler: (update: BarUpdate) => void) => () => void;
  sweep: (now: Date) => Promise<void>;
  flush: () => Promise<void>;
  start: () => void;
  stop: () => void;
}

interface FormingBar {
  symbol: string;
  timeframe: Timeframe;
  startMs: number;
  endMs: number;
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume: Decimal;
  persistedAtMs: number | null;
}

function seriesKey(symbol: string, timeframe: Timeframe): string {
  return `${symbol}:${timeframe}`;
}

function snapshot(bar: FormingBar): AggregatedBar {
  return {
    time: new Date(bar.startMs),
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  };
}

function pending(bar: FormingBar): PendingBar {
  return { timeframe: bar.timeframe, ...snapshot(bar) };
}

/**
 * Every streamed symbol always aggregates `1m` and `1D`; a further timeframe lives only while a
 * bars subscription holds it. A bucket closes on the first trade of the next one or in the sweep,
 * so a symbol that stops trading still gets its final bar.
 */
export function createBarAggregator(options: BarAggregatorOptions): BarAggregator {
  const { priceService, now } = options;
  const timers = options.timers ?? systemBarTimers;
  const persistIntervalMs = options.persistIntervalMs ?? DEFAULT_PERSIST_INTERVAL_MS;
  const writer = createBarWriter({
    candles: options.candles,
    symbols: options.symbols,
    log: options.log,
  });

  const forming = new Map<string, FormingBar>();
  const tracked = new Map<string, number>();
  const listeners = new Set<(update: BarUpdate) => void>();

  let sweepHandle: unknown = null;
  let running = false;

  function emit(bar: FormingBar, isFinal: boolean): void {
    const update: BarUpdate = {
      symbol: bar.symbol,
      timeframe: bar.timeframe,
      bar: snapshot(bar),
      isFinal,
    };

    for (const listener of listeners) listener(update);
  }

  function close(key: string, bar: FormingBar): void {
    forming.delete(key);
    emit(bar, true);
    writer.save(bar.symbol, pending(bar), true);
  }

  function persistForming(bar: FormingBar): void {
    const currentMs = now().getTime();

    if (bar.persistedAtMs !== null && currentMs - bar.persistedAtMs < persistIntervalMs) return;

    bar.persistedAtMs = currentMs;
    writer.save(bar.symbol, pending(bar), false);
  }

  function openBar(symbol: string, timeframe: Timeframe, startMs: number, trade: Trade): FormingBar {
    return {
      symbol,
      timeframe,
      startMs,
      endMs: nextBucketStartMs(startMs, timeframe),
      open: trade.price,
      high: trade.price,
      low: trade.price,
      close: trade.price,
      volume: trade.size,
      persistedAtMs: null,
    };
  }

  function timeframesFor(symbol: string): Timeframe[] {
    const prefix = `${symbol}:`;
    const extra = [...tracked.keys()]
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length) as Timeframe)
      .filter((timeframe) => !ALWAYS_AGGREGATED.includes(timeframe));

    return [...ALWAYS_AGGREGATED, ...extra];
  }

  function applyTrade(symbol: string, timeframe: Timeframe, trade: Trade): void {
    const key = seriesKey(symbol, timeframe);
    const startMs = bucketStartMs(trade.at.getTime(), timeframe);
    const current = forming.get(key);

    if (current !== undefined && current.startMs > startMs) return;
    if (current !== undefined && current.startMs < startMs) close(key, current);

    const held = forming.get(key);

    if (held === undefined) {
      const opened = openBar(symbol, timeframe, startMs, trade);
      forming.set(key, opened);
      emit(opened, false);
      persistForming(opened);
      return;
    }

    held.high = Decimal.max(held.high, trade.price);
    held.low = Decimal.min(held.low, trade.price);
    held.close = trade.price;
    held.volume = held.volume.plus(trade.size);
    emit(held, false);
    persistForming(held);
  }

  function handleTrade(trade: Trade): void {
    for (const timeframe of timeframesFor(trade.symbol)) applyTrade(trade.symbol, timeframe, trade);
  }

  async function sweep(at: Date): Promise<void> {
    const limit = at.getTime();

    for (const [key, bar] of [...forming]) {
      if (bar.endMs > limit) continue;
      close(key, bar);
    }

    await writer.flush();
  }

  function scheduleSweep(): void {
    if (!running) return;

    const delay = SWEEP_INTERVAL_MS - (now().getTime() % SWEEP_INTERVAL_MS);

    sweepHandle = timers.setTimeout(() => {
      sweepHandle = null;
      void sweep(now());
      scheduleSweep();
    }, delay);
  }

  priceService.onTrade(handleTrade);

  return {
    trackTimeframe(symbol: string, timeframe: Timeframe): void {
      const key = seriesKey(symbol, timeframe);
      tracked.set(key, (tracked.get(key) ?? 0) + 1);
    },

    untrackTimeframe(symbol: string, timeframe: Timeframe): void {
      const key = seriesKey(symbol, timeframe);
      const count = tracked.get(key) ?? 0;

      if (count > 1) {
        tracked.set(key, count - 1);
        return;
      }

      tracked.delete(key);
      if (!ALWAYS_AGGREGATED.includes(timeframe)) forming.delete(key);
    },

    onBar(handler: (update: BarUpdate) => void): () => void {
      listeners.add(handler);

      return () => {
        listeners.delete(handler);
      };
    },

    sweep,
    flush: writer.flush,

    start(): void {
      if (running) return;

      running = true;
      scheduleSweep();
    },

    stop(): void {
      running = false;
      if (sweepHandle === null) return;

      timers.clearTimeout(sweepHandle);
      sweepHandle = null;
    },
  };
}
