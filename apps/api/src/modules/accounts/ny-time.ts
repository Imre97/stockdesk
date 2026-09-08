export const NY_TIME_ZONE = "America/New_York";

const SESSION_OPEN_TIME = "09:30:00";
const DAY_START_TIME = "00:00:00";
const WEEKEND_DAYS = new Set(["Sat", "Sun"]);
const MILLISECONDS_PER_SECOND = 1000;
const HALF_DAY_MS = 12 * 60 * 60 * 1000;
const DAY_AND_A_HALF_MS = 36 * 60 * 60 * 1000;
const MAX_LOOKBACK_DAYS = 10;

const wallClockFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: NY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: NY_TIME_ZONE,
  weekday: "short",
});

export interface NyWindow {
  from: Date;
  to: Date;
}

interface WallClock {
  day: string;
  time: string;
}

function partValue(parts: Map<string, string>, type: string): string {
  return parts.get(type) ?? "";
}

function nyWallClock(date: Date): WallClock {
  const parts = new Map(wallClockFormatter.formatToParts(date).map((part) => [part.type, part.value]));

  return {
    day: `${partValue(parts, "year")}-${partValue(parts, "month")}-${partValue(parts, "day")}`,
    time: `${partValue(parts, "hour")}:${partValue(parts, "minute")}:${partValue(parts, "second")}`,
  };
}

function wallClockAsUtcMs(date: Date): number {
  const clock = nyWallClock(date);
  return Date.parse(`${clock.day}T${clock.time}.000Z`);
}

function offsetMs(date: Date): number {
  const wholeSeconds = date.getTime() - (date.getTime() % MILLISECONDS_PER_SECOND);
  return wallClockAsUtcMs(date) - wholeSeconds;
}

/**
 * Resolves a New York wall-clock reading to the instant it denotes. The zone offset depends on the
 * instant itself, so the first pass guesses with the offset at the reading read as UTC and the
 * second pass corrects it with the offset that actually applies there.
 */
function fromNyWallClock(day: string, time: string): Date {
  const target = Date.parse(`${day}T${time}.000Z`);
  const guess = new Date(target - offsetMs(new Date(target)));

  return new Date(target - offsetMs(guess));
}

export function nyDayStart(date: Date): Date {
  return fromNyWallClock(nyWallClock(date).day, DAY_START_TIME);
}

export function isNyWeekday(date: Date): boolean {
  return !WEEKEND_DAYS.has(weekdayFormatter.format(date));
}

function previousNyDayStart(dayStart: Date): Date {
  return nyDayStart(new Date(dayStart.getTime() - HALF_DAY_MS));
}

function nextNyDayStart(dayStart: Date): Date {
  return nyDayStart(new Date(dayStart.getTime() + DAY_AND_A_HALF_MS));
}

function lastWeekdayStart(date: Date): Date {
  let dayStart = nyDayStart(date);

  for (let index = 0; index < MAX_LOOKBACK_DAYS && !isNyWeekday(dayStart); index += 1) {
    dayStart = previousNyDayStart(dayStart);
  }

  return dayStart;
}

function sessionOpen(dayStart: Date): Date {
  return fromNyWallClock(nyWallClock(dayStart).day, SESSION_OPEN_TIME);
}

export function lastElapsedSessionOpen(now: Date): Date {
  let dayStart = lastWeekdayStart(now);
  let open = sessionOpen(dayStart);

  for (let index = 0; index < MAX_LOOKBACK_DAYS && open.getTime() > now.getTime(); index += 1) {
    dayStart = lastWeekdayStart(previousNyDayStart(dayStart));
    open = sessionOpen(dayStart);
  }

  return open;
}

export function nyTradingDayWindow(now: Date): NyWindow {
  const dayStart = lastWeekdayStart(now);

  return { from: dayStart, to: nextNyDayStart(dayStart) };
}

export function lastNWeekdaysWindow(now: Date, count: number): NyWindow {
  let dayStart = lastWeekdayStart(now);
  const to = nextNyDayStart(dayStart);

  for (let index = 1; index < count; index += 1) {
    dayStart = lastWeekdayStart(previousNyDayStart(dayStart));
  }

  return { from: dayStart, to };
}
