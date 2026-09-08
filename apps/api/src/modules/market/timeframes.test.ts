import type { Timeframe } from "@stockdesk/shared";
import { describe, expect, it } from "vitest";

import {
  bucketStartMs,
  nextBucketStartMs,
  previousBucketStartMs,
  windowStartMs,
} from "./timeframes.js";

const MS_PER_HOUR = 3_600_000;

function startOf(instant: string, timeframe: Timeframe): string {
  return new Date(bucketStartMs(Date.parse(instant), timeframe)).toISOString();
}

function nextOf(start: string, timeframe: Timeframe): string {
  return new Date(nextBucketStartMs(Date.parse(start), timeframe)).toISOString();
}

function previousOf(start: string, timeframe: Timeframe): string {
  return new Date(previousBucketStartMs(Date.parse(start), timeframe)).toISOString();
}

function windowOf(until: string, timeframe: Timeframe, buckets: number): string {
  return new Date(windowStartMs(Date.parse(until), timeframe, buckets)).toISOString();
}

describe("bucketStartMs", () => {
  it("puts the 1D bucket of a summer instant on New York midnight in daylight saving time", () => {
    expect(startOf("2026-09-08T14:30:00.000Z", "1D")).toBe("2026-09-08T04:00:00.000Z");
  });

  it("puts the 1D bucket of a winter instant on New York midnight in standard time", () => {
    expect(startOf("2026-01-15T14:30:00.000Z", "1D")).toBe("2026-01-15T05:00:00.000Z");
  });

  it("keeps an instant that is still the previous evening in New York in the previous 1D bucket", () => {
    expect(startOf("2026-09-08T02:00:00.000Z", "1D")).toBe("2026-09-07T04:00:00.000Z");
  });

  it("puts the 1W bucket of a Wednesday on the Monday New York midnight of that week", () => {
    expect(startOf("2026-09-09T15:00:00.000Z", "1W")).toBe("2026-09-07T04:00:00.000Z");
  });

  it("puts the 1M bucket on the first-of-month New York midnight", () => {
    expect(startOf("2026-09-15T15:00:00.000Z", "1M")).toBe("2026-09-01T04:00:00.000Z");
  });

  it("keeps the 1h bucket aligned to UTC", () => {
    expect(startOf("2026-09-08T14:30:00.000Z", "1h")).toBe("2026-09-08T14:00:00.000Z");
  });

  it("keeps the 1m, 5m and 15m buckets aligned to UTC", () => {
    expect(startOf("2026-09-08T14:32:45.500Z", "1m")).toBe("2026-09-08T14:32:00.000Z");
    expect(startOf("2026-09-08T14:32:45.500Z", "5m")).toBe("2026-09-08T14:30:00.000Z");
    expect(startOf("2026-09-08T14:32:45.500Z", "15m")).toBe("2026-09-08T14:30:00.000Z");
  });
});

describe("nextBucketStartMs and previousBucketStartMs", () => {
  it("steps 1D by calendar days across the end of daylight saving time", () => {
    expect(nextOf("2026-10-31T04:00:00.000Z", "1D")).toBe("2026-11-01T04:00:00.000Z");
    expect(nextOf("2026-11-01T04:00:00.000Z", "1D")).toBe("2026-11-02T05:00:00.000Z");
    expect(previousOf("2026-11-02T05:00:00.000Z", "1D")).toBe("2026-11-01T04:00:00.000Z");
    expect(previousOf("2026-11-01T04:00:00.000Z", "1D")).toBe("2026-10-31T04:00:00.000Z");
  });

  it("makes the New York day 25 hours long when the clocks fall back", () => {
    const start = Date.parse("2026-11-01T04:00:00.000Z");

    expect((nextBucketStartMs(start, "1D") - start) / MS_PER_HOUR).toBe(25);
  });

  it("makes the New York day 23 hours long when the clocks spring forward", () => {
    const start = Date.parse("2026-03-08T05:00:00.000Z");

    expect((nextBucketStartMs(start, "1D") - start) / MS_PER_HOUR).toBe(23);
  });

  it("steps 1W by calendar weeks across the end of daylight saving time", () => {
    expect(nextOf("2026-10-26T04:00:00.000Z", "1W")).toBe("2026-11-02T05:00:00.000Z");
    expect(previousOf("2026-11-02T05:00:00.000Z", "1W")).toBe("2026-10-26T04:00:00.000Z");
  });

  it("steps 1M by calendar months across the year boundary", () => {
    expect(nextOf("2026-09-01T04:00:00.000Z", "1M")).toBe("2026-10-01T04:00:00.000Z");
    expect(previousOf("2026-01-01T05:00:00.000Z", "1M")).toBe("2025-12-01T05:00:00.000Z");
  });

  it("steps the UTC-aligned timeframes by their fixed size", () => {
    expect(nextOf("2026-09-08T14:00:00.000Z", "1h")).toBe("2026-09-08T15:00:00.000Z");
    expect(previousOf("2026-09-08T14:30:00.000Z", "15m")).toBe("2026-09-08T14:15:00.000Z");
  });
});

describe("windowStartMs", () => {
  it("steps a calendar window back by whole months, weeks and days", () => {
    expect(windowOf("2026-03-02T15:00:00.000Z", "1M", 3)).toBe("2025-12-01T05:00:00.000Z");
    expect(windowOf("2026-09-09T15:00:00.000Z", "1W", 2)).toBe("2026-08-24T04:00:00.000Z");
    expect(windowOf("2026-11-02T04:30:00.000Z", "1D", 2)).toBe("2026-10-30T04:00:00.000Z");
  });

  it("steps a UTC-aligned window back by the fixed bucket size", () => {
    expect(windowOf("2026-09-08T14:32:45.500Z", "15m", 4)).toBe("2026-09-08T13:30:00.000Z");
  });
});
