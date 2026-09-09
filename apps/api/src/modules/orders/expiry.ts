import { nyDay } from "../../lib/ny-clock.js";
import { isNyseTradingDay, nextTradingDay, sessionOf } from "../market/calendar.js";

/**
 * A DAY order placed inside a running session expires at that session's close; one placed after the
 * close, on a weekend or on a holiday expires at the close of the next trading day.
 */
export function nextSessionClose(now: Date): Date {
  const day = nyDay(now);

  if (isNyseTradingDay(day)) {
    const { close } = sessionOf(day);

    if (now.getTime() < close.getTime()) return close;
  }

  return sessionOf(nextTradingDay(day)).close;
}
