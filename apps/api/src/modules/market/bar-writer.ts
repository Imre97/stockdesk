import type { CandleInput } from "./candles-repository.js";

export type PendingBar = Omit<CandleInput, "symbolId">;

export interface BarWriterCandles {
  saveFormingBar: (bar: CandleInput) => Promise<void>;
  finalizeBar: (bar: CandleInput) => Promise<void>;
}

export interface BarWriterOptions {
  candles: BarWriterCandles;
  symbols: (symbol: string) => Promise<string | null>;
  log: (message: string) => void;
}

export interface BarWriter {
  save: (symbol: string, bar: PendingBar, isFinal: boolean) => void;
  flush: () => Promise<void>;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function seriesKeyOf(symbol: string, bar: PendingBar): string {
  return `${symbol}:${bar.timeframe}:${bar.time.getTime()}`;
}

/**
 * Writes are started from the synchronous trade path and never awaited there, so every one of them
 * is registered here: `flush` lets the sweep and the tests wait for the database to catch up. The
 * writes of one bucket are chained, because a `finalizeBar` that overtakes an earlier
 * `saveFormingBar` would leave a closed bucket marked as still forming.
 */
export function createBarWriter(options: BarWriterOptions): BarWriter {
  const { candles, symbols, log } = options;
  const symbolIds = new Map<string, string | null>();
  const inFlight = new Set<Promise<void>>();
  const chains = new Map<string, Promise<void>>();

  async function symbolIdOf(symbol: string): Promise<string | null> {
    const known = symbolIds.get(symbol);
    if (known !== undefined) return known;

    const resolved = await symbols(symbol);
    symbolIds.set(symbol, resolved);

    return resolved;
  }

  async function write(symbol: string, bar: PendingBar, isFinal: boolean): Promise<void> {
    const symbolId = await symbolIdOf(symbol);
    if (symbolId === null) return;

    const input: CandleInput = { symbolId, ...bar };

    if (isFinal) {
      await candles.finalizeBar(input);
      return;
    }

    await candles.saveFormingBar(input);
  }

  return {
    save(symbol: string, bar: PendingBar, isFinal: boolean): void {
      const key = seriesKeyOf(symbol, bar);
      const previous = chains.get(key) ?? Promise.resolve();
      const guarded = previous
        .then(async () => await write(symbol, bar, isFinal))
        .catch((error: unknown) => {
          log(`Persisting a live ${bar.timeframe} bar of ${symbol} failed: ${describe(error)}`);
        });

      chains.set(key, guarded);
      inFlight.add(guarded);
      void guarded.finally(() => {
        inFlight.delete(guarded);
        if (chains.get(key) === guarded) chains.delete(key);
      });
    },

    async flush(): Promise<void> {
      while (inFlight.size > 0) await Promise.all([...inFlight]);
    },
  };
}
