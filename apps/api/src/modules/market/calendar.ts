import type { MarketStatusValue } from "@stockdesk/shared";
import { fromNyWallClock, isWeekendDay, nyDay, shiftDay } from "../../lib/ny-clock.js";
import { isEarlyClose, isNyseHoliday } from "./holidays.js";

const PRE_MARKET_START = "04:00:00";
const REGULAR_OPEN = "09:30:00";
const REGULAR_CLOSE = "16:00:00";
const EARLY_CLOSE = "13:00:00";
const AFTER_HOURS_END = "20:00:00";
const EARLY_AFTER_HOURS_END = "17:00:00";
const MAX_LOOKAHEAD_DAYS = 10;

export interface MarketStatusAt {
  status: MarketStatusValue;
  nextOpenAt: Date | null;
  nextCloseAt: Date | null;
}

export interface Session {
  preStart: Date;
  open: Date;
  close: Date;
  afterEnd: Date;
}

export function isNyseTradingDay(day: string): boolean {
  return !isWeekendDay(day) && !isNyseHoliday(day);
}

export function sessionOf(day: string): Session {
  const early = isEarlyClose(day);

  return {
    preStart: fromNyWallClock(day, PRE_MARKET_START),
    open: fromNyWallClock(day, REGULAR_OPEN),
    close: fromNyWallClock(day, early ? EARLY_CLOSE : REGULAR_CLOSE),
    afterEnd: fromNyWallClock(day, early ? EARLY_AFTER_HOURS_END : AFTER_HOURS_END),
  };
}

export function nextTradingDay(day: string): string {
  let candidate = shiftDay(day, 1);

  for (let index = 0; index < MAX_LOOKAHEAD_DAYS && !isNyseTradingDay(candidate); index += 1) {
    candidate = shiftDay(candidate, 1);
  }

  return candidate;
}

function statusWithin(now: Date, session: Session): MarketStatusValue {
  const time = now.getTime();

  if (time < session.preStart.getTime()) return "closed";
  if (time < session.open.getTime()) return "pre";
  if (time < session.close.getTime()) return "open";
  if (time < session.afterEnd.getTime()) return "after";

  return "closed";
}

/**
 * The after-hours window on an early-close day is assumed to run 13:00 to 17:00 New York, the
 * regular four hours measured from the shortened close rather than the usual 16:00 to 20:00.
 */
export function marketStatusAt(now: Date): MarketStatusAt {
  const day = nyDay(now);
  const today = isNyseTradingDay(day) ? sessionOf(day) : null;
  const status = today === null ? "closed" : statusWithin(now, today);

  if (today !== null && status === "open") {
    return { status, nextOpenAt: null, nextCloseAt: today.close };
  }

  if (today !== null && now.getTime() < today.open.getTime()) {
    return { status, nextOpenAt: today.open, nextCloseAt: today.close };
  }

  const upcoming = sessionOf(nextTradingDay(day));

  return { status, nextOpenAt: upcoming.open, nextCloseAt: upcoming.close };
}
