import type { Timeframe } from "@stockdesk/shared";

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const DURATIONS: Record<Timeframe, number> = {
  "1m": MS_PER_MINUTE,
  "5m": 5 * MS_PER_MINUTE,
  "15m": 15 * MS_PER_MINUTE,
  "1h": MS_PER_HOUR,
  "1D": MS_PER_DAY,
  "1W": 7 * MS_PER_DAY,
  "1M": 31 * MS_PER_DAY,
};

export function timeframeDurationMs(timeframe: Timeframe): number {
  return DURATIONS[timeframe];
}
