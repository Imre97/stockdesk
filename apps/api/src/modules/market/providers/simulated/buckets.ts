import type { Timeframe } from "@stockdesk/shared";

import {
  BUCKET_EPOCH_MS,
  bucketStartMs,
  nextBucketStartMs,
  previousBucketStartMs,
} from "../../timeframes.js";

export const EPOCH_MS = BUCKET_EPOCH_MS;
export const MS_PER_MINUTE = 60_000;
export const MS_PER_DAY = 86_400_000;
export const MINUTES_PER_DAY = 1440;
export const DAYS_PER_YEAR = 365;
export const DAILY_HISTORY_DAYS = 730;
export const MINUTE_HISTORY_DAYS = 30;

const MINUTE_SPANS: Partial<Record<Timeframe, number>> = { "1m": 1, "5m": 5, "15m": 15, "1h": 60 };

export type BucketSource = "minute" | "day";

export const bucketStartAt = bucketStartMs;
export const nextBucketStart = nextBucketStartMs;
export const previousBucketStart = previousBucketStartMs;

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

export function historyStartMs(timeframe: Timeframe, now: Date): number {
  if (sourceOf(timeframe) === "minute") {
    const start = bucketStartMs(now.getTime(), "1m") - MINUTE_HISTORY_DAYS * MS_PER_DAY;
    return Math.max(start, EPOCH_MS);
  }

  const start = bucketStartMs(now.getTime(), "1D") - DAILY_HISTORY_DAYS * MS_PER_DAY;

  return Math.max(start, EPOCH_MS);
}

export function indexRange(first: number, count: number): number[] {
  return Array.from({ length: count }, (_value, offset) => first + offset);
}
