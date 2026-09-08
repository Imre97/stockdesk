import type { Timeframe } from "@stockdesk/shared";

export const EPOCH_MS = Date.UTC(2024, 0, 1);
export const MS_PER_MINUTE = 60_000;
export const MS_PER_DAY = 86_400_000;
export const MINUTES_PER_DAY = 1440;
export const DAYS_PER_YEAR = 365;
export const DAILY_HISTORY_DAYS = 730;
export const MINUTE_HISTORY_DAYS = 30;

const WEEK_MS = 7 * MS_PER_DAY;

const MINUTE_SPANS: Partial<Record<Timeframe, number>> = { "1m": 1, "5m": 5, "15m": 15, "1h": 60 };

export type BucketSource = "minute" | "day";

export function minuteSpanOf(timeframe: Timeframe): number | undefined {
  return MINUTE_SPANS[timeframe];
}

export function sourceOf(timeframe: Timeframe): BucketSource {
  return minuteSpanOf(timeframe) === undefined ? "day" : "minute";
}

export function dayIndexOf(time: Date): number {
  return Math.floor((time.getTime() - EPOCH_MS) / MS_PER_DAY);
}

export function minuteIndexOf(time: Date): number {
  return Math.floor((time.getTime() - EPOCH_MS) / MS_PER_MINUTE);
}

export function minuteIndexAt(dayIndex: number, minuteOfDay: number): number {
  return dayIndex * MINUTES_PER_DAY + minuteOfDay;
}

export function bucketStartAt(timeMs: number, timeframe: Timeframe): number {
  const span = minuteSpanOf(timeframe);
  if (span !== undefined) return floorTo(timeMs, span * MS_PER_MINUTE);
  if (timeframe === "1D") return floorTo(timeMs, MS_PER_DAY);
  if (timeframe === "1W") return floorTo(timeMs, WEEK_MS);
  const start = new Date(timeMs);
  return Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1);
}

export function previousBucketStart(startMs: number, timeframe: Timeframe): number {
  const span = minuteSpanOf(timeframe);
  if (span !== undefined) return startMs - span * MS_PER_MINUTE;
  if (timeframe === "1D") return startMs - MS_PER_DAY;
  if (timeframe === "1W") return startMs - WEEK_MS;
  const start = new Date(startMs);
  return Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1);
}

export function nextBucketStart(startMs: number, timeframe: Timeframe): number {
  const span = minuteSpanOf(timeframe);
  if (span !== undefined) return startMs + span * MS_PER_MINUTE;
  if (timeframe === "1D") return startMs + MS_PER_DAY;
  if (timeframe === "1W") return startMs + WEEK_MS;
  const start = new Date(startMs);
  return Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1);
}

export function historyStartMs(timeframe: Timeframe, now: Date): number {
  if (sourceOf(timeframe) === "minute") {
    const start = floorTo(now.getTime(), MS_PER_MINUTE) - MINUTE_HISTORY_DAYS * MS_PER_DAY;
    return Math.max(start, EPOCH_MS);
  }
  const start = floorTo(now.getTime(), MS_PER_DAY) - DAILY_HISTORY_DAYS * MS_PER_DAY;
  return Math.max(start, EPOCH_MS);
}

export function indexRange(first: number, count: number): number[] {
  return Array.from({ length: count }, (_value, offset) => first + offset);
}

function floorTo(timeMs: number, sizeMs: number): number {
  return EPOCH_MS + Math.floor((timeMs - EPOCH_MS) / sizeMs) * sizeMs;
}
