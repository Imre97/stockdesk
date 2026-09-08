export const NY_TIME_ZONE = "America/New_York";

const DAY_START_TIME = "00:00:00";
const WEEKEND_DAYS = new Set(["Sat", "Sun"]);
const MILLISECONDS_PER_SECOND = 1000;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const NOON_UTC = "12:00:00.000Z";
const DAY_LENGTH = 10;

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

export interface NyWallClock {
  day: string;
  time: string;
}

function partValue(parts: Map<string, string>, type: string): string {
  return parts.get(type) ?? "";
}

export function nyWallClock(date: Date): NyWallClock {
  const parts = new Map(wallClockFormatter.formatToParts(date).map((part) => [part.type, part.value]));

  return {
    day: `${partValue(parts, "year")}-${partValue(parts, "month")}-${partValue(parts, "day")}`,
    time: `${partValue(parts, "hour")}:${partValue(parts, "minute")}:${partValue(parts, "second")}`,
  };
}

export function nyDay(date: Date): string {
  return nyWallClock(date).day;
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
export function fromNyWallClock(day: string, time: string): Date {
  const target = Date.parse(`${day}T${time}.000Z`);
  const guess = new Date(target - offsetMs(new Date(target)));

  return new Date(target - offsetMs(guess));
}

export function nyDayStart(date: Date): Date {
  return fromNyWallClock(nyDay(date), DAY_START_TIME);
}

export function isNyWeekday(date: Date): boolean {
  return !WEEKEND_DAYS.has(weekdayFormatter.format(date));
}

export function isWeekendDay(day: string): boolean {
  return WEEKEND_DAYS.has(weekdayFormatter.format(new Date(`${day}T${NOON_UTC}`)));
}

export function shiftDay(day: string, days: number): string {
  const base = Date.parse(`${day}T${NOON_UTC}`);

  return new Date(base + days * MILLISECONDS_PER_DAY).toISOString().slice(0, DAY_LENGTH);
}
