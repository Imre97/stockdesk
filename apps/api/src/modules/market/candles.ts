import { toApiString, type BarDto, type BarsResponseDto, type Timeframe } from "@stockdesk/shared";
import { AppError } from "../../lib/errors.js";
import * as candlesRepository from "./candles-repository.js";
import type { CandleRow, CoverageRow } from "./candles-repository.js";
import { findActiveSymbol } from "./symbols-repository.js";
import { ProviderUnavailableError, type CompositeProvider } from "./providers/composite.js";
import type { Bar } from "./providers/types.js";
import {
  bucketStartMs,
  historyFloorMs,
  nextBucketStartMs,
  windowStartMs,
} from "./timeframes.js";

const PRICE_PLACES = 4;
const VOLUME_PLACES = 0;

export interface CandleCacheOptions {
  composite: CompositeProvider;
  now: () => Date;
  log: (message: string) => void;
}

export interface GetBarsInput {
  symbol: string;
  timeframe: Timeframe;
  limit: number;
  end?: Date | undefined;
}

export interface CandleCache {
  getBars: (input: GetBarsInput) => Promise<BarsResponseDto>;
}

interface FetchRange {
  start: Date;
  end: Date;
}

export function symbolNotFound(symbol: string): AppError {
  return new AppError(404, "SYMBOL_NOT_FOUND", `Unknown symbol ${symbol}.`);
}

function providerUnavailable(symbol: string): AppError {
  return new AppError(503, "PROVIDER_UNAVAILABLE", `No market data provider served bars for ${symbol}.`);
}

function toBarDto(row: CandleRow): BarDto {
  return {
    time: row.time.toISOString(),
    open: toApiString(row.open.toString(), PRICE_PLACES),
    high: toApiString(row.high.toString(), PRICE_PLACES),
    low: toApiString(row.low.toString(), PRICE_PLACES),
    close: toApiString(row.close.toString(), PRICE_PLACES),
    volume: toApiString(row.volume.toString(), VOLUME_PLACES),
  };
}

function contains(coverage: CoverageRow[], from: Date, to: Date): boolean {
  return coverage.some((row) => row.from.getTime() <= from.getTime() && row.to.getTime() >= to.getTime());
}

function covering(coverage: CoverageRow[], instant: Date): CoverageRow | undefined {
  return coverage.find(
    (row) => row.from.getTime() <= instant.getTime() && row.to.getTime() >= instant.getTime(),
  );
}

/**
 * Picks the sub-range still missing for `[lowerBound, end)`: the older half when the coverage row
 * that holds `end` starts too late, the newer half when a row holds `lowerBound` but stops before
 * `end`, and the whole window when nothing around `end` is covered yet.
 */
function missingRange(coverage: CoverageRow[], lowerBound: Date, end: Date): FetchRange | null {
  if (contains(coverage, lowerBound, end)) return null;

  const tail = covering(coverage, end);
  if (tail !== undefined) return { start: lowerBound, end: tail.from };

  const head = covering(coverage, lowerBound);
  if (head !== undefined) return { start: head.to, end };

  return { start: lowerBound, end };
}

export function createCandleCache({ composite, now, log }: CandleCacheOptions): CandleCache {
  async function fetchAndStore(
    symbolId: string,
    symbol: string,
    timeframe: Timeframe,
    limit: number,
    range: FetchRange,
  ): Promise<number> {
    let fetched: Bar[];

    try {
      fetched = await composite.getBars({ symbol, timeframe, start: range.start, end: range.end, limit });
    } catch (error) {
      if (error instanceof ProviderUnavailableError) throw providerUnavailable(symbol);
      throw error;
    }

    const currentTime = now().getTime();
    const complete = fetched.filter(
      (bar) => nextBucketStartMs(bar.time.getTime(), timeframe) <= currentTime,
    );

    await candlesRepository.insertFinalBars(
      complete.map((bar) => ({
        symbolId,
        timeframe,
        time: bar.time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      })),
    );

    const oldest = fetched[0]?.time;
    const from =
      oldest !== undefined && oldest.getTime() < range.start.getTime() ? oldest : range.start;

    await candlesRepository.addCoverage(symbolId, timeframe, from, range.end);

    if (fetched.length === 0) {
      log(`Market data provider returned no ${timeframe} bars for ${symbol}`);
    }

    return fetched.length;
  }

  return {
    async getBars({ symbol, timeframe, limit, end }: GetBarsInput): Promise<BarsResponseDto> {
      const record = await findActiveSymbol(symbol);
      if (record === null) throw symbolNotFound(symbol);

      const nowMs = now().getTime();
      const until = end ?? new Date(nowMs);
      const settled = new Date(bucketStartMs(Math.min(until.getTime(), nowMs), timeframe));
      const depth = composite.barsHistoryDepth(symbol);
      const lowerBound = new Date(
        Math.max(
          windowStartMs(until.getTime(), timeframe, limit),
          historyFloorMs(nowMs, timeframe, depth),
        ),
      );

      const cached = await candlesRepository.listBarsBefore(record.id, timeframe, until, limit);
      const coverage = await candlesRepository.listCoverage(record.id, timeframe);
      const oldestCached = cached[0]?.time;

      const satisfied =
        contains(coverage, lowerBound, settled) ||
        (cached.length === limit &&
          oldestCached !== undefined &&
          contains(coverage, oldestCached, settled));

      let providerPageFull = false;

      if (!satisfied) {
        const range = missingRange(coverage, lowerBound, settled);
        if (range !== null && range.start.getTime() < range.end.getTime()) {
          const returned = await fetchAndStore(record.id, symbol, timeframe, limit, range);
          providerPageFull = returned >= limit;
        }
      }

      const rows = satisfied
        ? cached
        : await candlesRepository.listBarsBefore(record.id, timeframe, until, limit);
      const oldest = rows[0];

      const hasMore =
        providerPageFull ||
        (oldest !== undefined &&
          (await candlesRepository.existsBarBefore(record.id, timeframe, oldest.time)));

      return { symbol: record.symbol, timeframe, bars: rows.map(toBarDto), hasMore };
    },
  };
}
