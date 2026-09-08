import {
  fromNyWallClock,
  isNyWeekday,
  nyDay,
  nyDayStart,
  NY_TIME_ZONE,
} from "../../lib/ny-clock.js";
import { isNyseHoliday } from "../market/holidays.js";

export { isNyWeekday, nyDayStart, NY_TIME_ZONE };

/**
 * The "at" column is a timestamp without time zone holding a UTC instant, so it is anchored to UTC
 * first and only then read in New York; a bare AT TIME ZONE would add the offset instead.
 */
export const NY_LOCAL_AT_SQL = `("at" AT TIME ZONE 'UTC') AT TIME ZONE '${NY_TIME_ZONE}'`;

const SESSION_OPEN_TIME = "09:30:00";
const HALF_DAY_MS = 12 * 60 * 60 * 1000;
const DAY_AND_A_HALF_MS = 36 * 60 * 60 * 1000;
const MAX_LOOKBACK_DAYS = 10;

export interface NyWindow {
  from: Date;
  to: Date;
}

export function isNyTradingDay(date: Date): boolean {
  return isNyWeekday(date) && !isNyseHoliday(nyDay(date));
}

function previousNyDayStart(dayStart: Date): Date {
  return nyDayStart(new Date(dayStart.getTime() - HALF_DAY_MS));
}

function nextNyDayStart(dayStart: Date): Date {
  return nyDayStart(new Date(dayStart.getTime() + DAY_AND_A_HALF_MS));
}

function lastTradingDayStart(date: Date): Date {
  let dayStart = nyDayStart(date);

  for (let index = 0; index < MAX_LOOKBACK_DAYS && !isNyTradingDay(dayStart); index += 1) {
    dayStart = previousNyDayStart(dayStart);
  }

  return dayStart;
}

function sessionOpen(dayStart: Date): Date {
  return fromNyWallClock(nyDay(dayStart), SESSION_OPEN_TIME);
}

export function lastElapsedSessionOpen(now: Date): Date {
  let dayStart = lastTradingDayStart(now);
  let open = sessionOpen(dayStart);

  for (let index = 0; index < MAX_LOOKBACK_DAYS && open.getTime() > now.getTime(); index += 1) {
    dayStart = lastTradingDayStart(previousNyDayStart(dayStart));
    open = sessionOpen(dayStart);
  }

  return open;
}

export function nyTradingDayWindow(now: Date): NyWindow {
  const dayStart = lastTradingDayStart(now);

  return { from: dayStart, to: nextNyDayStart(dayStart) };
}

export function lastNWeekdaysWindow(now: Date, count: number): NyWindow {
  let dayStart = lastTradingDayStart(now);
  const to = nextNyDayStart(dayStart);

  for (let index = 1; index < count; index += 1) {
    dayStart = lastTradingDayStart(previousNyDayStart(dayStart));
  }

  return { from: dayStart, to };
}
