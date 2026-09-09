import type { Timeframe } from "@stockdesk/shared";

import type { HistoryDepth } from "../types.js";
import {
  BUCKET_EPOCH_MS,
  bucketStartMs,
  historyFloorMs,
  nextBucketStartMs,
  previousBucketStartMs,
} from "../../timeframes.js";

export const EPOCH_MS = BUCKET_EPOCH_MS;
export const MS_PER_MINUTE = 60_000;
export const MS_PER_DAY = 86_400_000;
export const MINUTES_PER_DAY = 1440;
export const DAYS_PER_YEAR = 365;

export const SIMULATED_HISTORY_DEPTH: HistoryDepth = { dailyDays: 730, intradayDays: 30 };

const HALF_DAY_MS = MS_PER_DAY / 2;
const EPOCH_DAY_START_MS = bucketStartMs(BUCKET_EPOCH_MS, "1D");

const MINUTE_SPANS: Partial<Record<Timeframe, number>> = { "1m": 1, "5m": 5, "15m": 15, "1h": 60 };

export type BucketSource = "minute" | "day";

export interface MinuteRef {
  dayIndex: number;
  minuteOfDay: number;
}

export const bucketStartAt = bucketStartMs;
export const nextBucketStart = nextBucketStartMs;
export const previousBucketStart = previousBucketStartMs;

export function minuteSpanOf(timeframe: Timeframe): number | undefined {
  return MINUTE_SPANS[timeframe];
}

export function sourceOf(timeframe: Timeframe): BucketSource {
  return minuteSpanOf(timeframe) === undefined ? "day" : "minute";
}

/**
 * The walk is indexed by New York days, so the index counts day starts rather than fixed spans:
 * daylight saving time moves a day start by an hour at most, which the half-day shift absorbs, and
 * the inverse lands at midday inside the wanted day before it is floored back to that day's start.
 */
export function dayIndexAt(dayStartMs: number): number {
  return Math.floor((dayStartMs - EPOCH_DAY_START_MS + HALF_DAY_MS) / MS_PER_DAY);
}

export function dayStartMsOf(dayIndex: number): number {
  return bucketStartMs(EPOCH_DAY_START_MS + dayIndex * MS_PER_DAY + HALF_DAY_MS, "1D");
}

export function dayIndexOf(time: Date): number {
  return dayIndexAt(bucketStartMs(time.getTime(), "1D"));
}

export function minutesInDay(dayIndex: number): number {
  const start = dayStartMsOf(dayIndex);

  return (nextBucketStartMs(start, "1D") - start) / MS_PER_MINUTE;
}

export function minuteRefOf(time: Date): MinuteRef {
  const dayStart = bucketStartMs(time.getTime(), "1D");

  return {
    dayIndex: dayIndexAt(dayStart),
    minuteOfDay: Math.floor((time.getTime() - dayStart) / MS_PER_MINUTE),
  };
}

export function historyStartMs(timeframe: Timeframe, now: Date): number {
  return Math.max(historyFloorMs(now.getTime(), timeframe, SIMULATED_HISTORY_DEPTH), EPOCH_MS);
}

export function indexRange(first: number, count: number): number[] {
  return Array.from({ length: count }, (_value, offset) => first + offset);
}
