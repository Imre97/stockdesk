import type { Timeframe } from "@stockdesk/shared";

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_WEEK = 7 * MS_PER_DAY;

export const BUCKET_EPOCH_MS = Date.UTC(2024, 0, 1);

const DURATIONS: Record<Timeframe, number> = {
  "1m": MS_PER_MINUTE,
  "5m": 5 * MS_PER_MINUTE,
  "15m": 15 * MS_PER_MINUTE,
  "1h": MS_PER_HOUR,
  "1D": MS_PER_DAY,
  "1W": MS_PER_WEEK,
  "1M": 31 * MS_PER_DAY,
};

const FIXED_SIZES: Partial<Record<Timeframe, number>> = {
  "1m": MS_PER_MINUTE,
  "5m": 5 * MS_PER_MINUTE,
  "15m": 15 * MS_PER_MINUTE,
  "1h": MS_PER_HOUR,
  "1D": MS_PER_DAY,
  "1W": MS_PER_WEEK,
};

export function timeframeDurationMs(timeframe: Timeframe): number {
  return DURATIONS[timeframe];
}

function floorTo(timeMs: number, sizeMs: number): number {
  return BUCKET_EPOCH_MS + Math.floor((timeMs - BUCKET_EPOCH_MS) / sizeMs) * sizeMs;
}

/**
 * Every bucket except the calendar month is anchored to the epoch instant, so `1D` starts at UTC
 * midnight and `1W` on a Monday. The persisted candle rows of every provider use this alignment;
 * the live aggregator has to hit the same instants or it would write a second row per bucket.
 */
export function bucketStartMs(timeMs: number, timeframe: Timeframe): number {
  const size = FIXED_SIZES[timeframe];
  if (size !== undefined) return floorTo(timeMs, size);

  const start = new Date(timeMs);

  return Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1);
}

export function nextBucketStartMs(startMs: number, timeframe: Timeframe): number {
  const size = FIXED_SIZES[timeframe];
  if (size !== undefined) return startMs + size;

  const start = new Date(startMs);

  return Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1);
}

export function previousBucketStartMs(startMs: number, timeframe: Timeframe): number {
  const size = FIXED_SIZES[timeframe];
  if (size !== undefined) return startMs - size;

  const start = new Date(startMs);

  return Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1);
}
