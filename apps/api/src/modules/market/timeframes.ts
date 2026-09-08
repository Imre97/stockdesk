import type { Timeframe } from "@stockdesk/shared";

import { fromNyWallClock, nyDay, shiftDay } from "../../lib/ny-clock.js";

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_WEEK = 7 * MS_PER_DAY;
const DAYS_PER_WEEK = 7;
const DAY_START_TIME = "00:00:00";
const NOON_UTC = "12:00:00.000Z";
const DAY_LENGTH = 10;
const MONTH_LENGTH = 7;

export const BUCKET_EPOCH_MS = Date.UTC(2024, 0, 1);

const CALENDAR_TIMEFRAMES = ["1D", "1W", "1M"] as const;

type CalendarTimeframe = (typeof CALENDAR_TIMEFRAMES)[number];
type FixedTimeframe = Exclude<Timeframe, CalendarTimeframe>;

const DURATIONS: Record<Timeframe, number> = {
  "1m": MS_PER_MINUTE,
  "5m": 5 * MS_PER_MINUTE,
  "15m": 15 * MS_PER_MINUTE,
  "1h": MS_PER_HOUR,
  "1D": MS_PER_DAY,
  "1W": MS_PER_WEEK,
  "1M": 31 * MS_PER_DAY,
};

const FIXED_SIZES: Record<FixedTimeframe, number> = {
  "1m": MS_PER_MINUTE,
  "5m": 5 * MS_PER_MINUTE,
  "15m": 15 * MS_PER_MINUTE,
  "1h": MS_PER_HOUR,
};

interface CalendarBucket {
  floor: (day: string) => string;
  step: (day: string, steps: number) => string;
}

function weekdayIndex(day: string): number {
  return new Date(`${day}T${NOON_UTC}`).getUTCDay();
}

function mondayOf(day: string): string {
  return shiftDay(day, -((weekdayIndex(day) + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK));
}

function firstOfMonth(day: string): string {
  return `${day.slice(0, MONTH_LENGTH)}-01`;
}

function shiftMonth(day: string, months: number): string {
  const base = new Date(`${day}T${NOON_UTC}`);
  const shifted = Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, 1);

  return new Date(shifted).toISOString().slice(0, DAY_LENGTH);
}

const CALENDAR: Record<CalendarTimeframe, CalendarBucket> = {
  "1D": { floor: (day) => day, step: (day, steps) => shiftDay(day, steps) },
  "1W": { floor: mondayOf, step: (day, steps) => shiftDay(mondayOf(day), steps * DAYS_PER_WEEK) },
  "1M": { floor: firstOfMonth, step: shiftMonth },
};

function isCalendarTimeframe(timeframe: Timeframe): timeframe is CalendarTimeframe {
  return CALENDAR_TIMEFRAMES.includes(timeframe as CalendarTimeframe);
}

function nyDayStartMs(day: string): number {
  return fromNyWallClock(day, DAY_START_TIME).getTime();
}

function nyDayOf(timeMs: number): string {
  return nyDay(new Date(timeMs));
}

export function timeframeDurationMs(timeframe: Timeframe): number {
  return DURATIONS[timeframe];
}

function floorTo(timeMs: number, sizeMs: number): number {
  return BUCKET_EPOCH_MS + Math.floor((timeMs - BUCKET_EPOCH_MS) / sizeMs) * sizeMs;
}

/**
 * `1m` to `1h` are anchored to the epoch instant, so they stay aligned to UTC. `1D`, `1W` and `1M`
 * follow the New York calendar instead: a daily bucket starts at America/New_York midnight, which
 * is what Alpaca's daily bars carry, so a provider bar and the live forming bar share one row. The
 * offset moves with daylight saving time, which makes a calendar day 23, 24 or 25 hours long;
 * stepping therefore goes through the wall-clock day and never through a fixed millisecond size.
 */
export function bucketStartMs(timeMs: number, timeframe: Timeframe): number {
  if (isCalendarTimeframe(timeframe)) {
    return nyDayStartMs(CALENDAR[timeframe].floor(nyDayOf(timeMs)));
  }

  return floorTo(timeMs, FIXED_SIZES[timeframe]);
}

export function nextBucketStartMs(startMs: number, timeframe: Timeframe): number {
  if (isCalendarTimeframe(timeframe)) {
    return nyDayStartMs(CALENDAR[timeframe].step(nyDayOf(startMs), 1));
  }

  return startMs + FIXED_SIZES[timeframe];
}

export function previousBucketStartMs(startMs: number, timeframe: Timeframe): number {
  if (isCalendarTimeframe(timeframe)) {
    return nyDayStartMs(CALENDAR[timeframe].step(nyDayOf(startMs), -1));
  }

  return startMs - FIXED_SIZES[timeframe];
}
