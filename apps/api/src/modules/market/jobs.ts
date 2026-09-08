import type { Timeframe } from "@stockdesk/shared";
import type { AppConfig } from "../../lib/config.js";
import * as candlesRepository from "./candles-repository.js";
import type { MarketRuntime } from "./runtime.js";

export const CANDLE_MAX_ROWS_PER_SERIES = 5000;

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

export interface MarketJobsOptions {
  config: AppConfig;
  runtime: MarketRuntime;
  now?: (() => Date) | undefined;
  log?: ((message: string) => void) | undefined;
}

export interface MarketJobs {
  runSymbolRefresh: () => Promise<void>;
  runCandleThinning: () => Promise<void>;
  start: () => void;
  stop: () => void;
}

function defaultLog(message: string): void {
  process.stdout.write(`${message}\n`);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createMarketJobs(options: MarketJobsOptions): MarketJobs {
  const log = options.log ?? defaultLog;
  const timers: NodeJS.Timeout[] = [];

  async function guarded(label: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      log(`${label}: ${describe(error)}`);
    }
  }

  async function thinSeries(symbolId: string, timeframe: Timeframe): Promise<number> {
    const deleted = await candlesRepository.deleteOldestBarsAbove(
      symbolId,
      timeframe,
      CANDLE_MAX_ROWS_PER_SERIES,
    );

    if (deleted === 0) return 0;

    const oldest = await candlesRepository.oldestBarTime(symbolId, timeframe);
    if (oldest !== null) await candlesRepository.trimCoverageBefore(symbolId, timeframe, oldest);

    return deleted;
  }

  async function thinAll(): Promise<void> {
    let deleted = 0;

    for (const series of await candlesRepository.listSeries()) {
      deleted += await thinSeries(series.symbolId, series.timeframe as Timeframe);
    }

    if (deleted > 0) log(`Candle thinning removed ${deleted} rows above ${CANDLE_MAX_ROWS_PER_SERIES}`);
  }

  function schedule(intervalMs: number, run: () => Promise<void>): void {
    const timer = setInterval(() => {
      void run();
    }, intervalMs);

    timer.unref();
    timers.push(timer);
  }

  async function runSymbolRefresh(): Promise<void> {
    await guarded("Refreshing the symbol master failed", async () => {
      await options.runtime.symbols.refreshSymbols();
    });
  }

  async function runCandleThinning(): Promise<void> {
    await guarded("Thinning the candle cache failed", thinAll);
  }

  return {
    runSymbolRefresh,
    runCandleThinning,

    start(): void {
      schedule(options.config.candleThinningIntervalHours * MILLISECONDS_PER_HOUR, runCandleThinning);
      schedule(options.config.symbolRefreshHours * MILLISECONDS_PER_HOUR, runSymbolRefresh);
    },

    stop(): void {
      for (const timer of timers) clearInterval(timer);
      timers.length = 0;
    },
  };
}
