import { Decimal } from "@stockdesk/shared";
import { describe, expect, it } from "vitest";

import type { Bar } from "../types.js";
import { createSimulatedProvider } from "./provider.js";

const NOW = new Date("2026-09-08T18:34:00.000Z");
const SEED = 4242;

function at<T>(items: readonly T[], index: number): T {
  const value = items.at(index);
  if (value === undefined) throw new Error(`Missing element at index ${index}`);
  return value;
}

function provider(seed = SEED) {
  return createSimulatedProvider({ seed, now: () => NOW });
}

function serialize(bars: Bar[]) {
  return bars.map((bar) => ({
    time: bar.time.toISOString(),
    open: bar.open.toString(),
    high: bar.high.toString(),
    low: bar.low.toString(),
    close: bar.close.toString(),
    volume: bar.volume.toString(),
  }));
}

function expectSaneSeries(bars: Bar[]): void {
  expect(bars.length).toBeGreaterThan(0);
  bars.forEach((bar, index) => {
    expect(bar.low.lessThanOrEqualTo(bar.open)).toBe(true);
    expect(bar.low.lessThanOrEqualTo(bar.close)).toBe(true);
    expect(bar.high.greaterThanOrEqualTo(bar.open)).toBe(true);
    expect(bar.high.greaterThanOrEqualTo(bar.close)).toBe(true);
    expect(bar.low.greaterThan(0)).toBe(true);
    expect(bar.volume.greaterThan(0)).toBe(true);
    if (index === 0) return;
    const previous = at(bars, index - 1);
    expect(bar.time.getTime()).toBeGreaterThan(previous.time.getTime());
    expect(bar.open.toString()).toBe(previous.close.toString());
  });
}

function aggregate(group: Bar[]) {
  return {
    open: at(group, 0).open.toString(),
    high: Decimal.max(...group.map((bar) => bar.high)).toString(),
    low: Decimal.min(...group.map((bar) => bar.low)).toString(),
    close: at(group, -1).close.toString(),
    volume: group
      .reduce((total, bar) => total.plus(bar.volume), new Decimal(0))
      .toString(),
  };
}

function groupBy(bars: Bar[], key: (bar: Bar) => string): Map<string, Bar[]> {
  const groups = new Map<string, Bar[]>();
  for (const bar of bars) {
    const bucket = groups.get(key(bar));
    if (bucket === undefined) groups.set(key(bar), [bar]);
    else bucket.push(bar);
  }
  return groups;
}

function fiveMinuteKey(bar: Bar): string {
  const slot = Math.floor(bar.time.getTime() / (5 * 60_000)) * 5 * 60_000;
  return new Date(slot).toISOString();
}

function weekKey(bar: Bar): string {
  const offset = (bar.time.getUTCDay() + 6) % 7;
  return new Date(
    Date.UTC(bar.time.getUTCFullYear(), bar.time.getUTCMonth(), bar.time.getUTCDate() - offset),
  ).toISOString();
}

describe("simulated bars", () => {
  it("returns identical candles for the same seed, symbol, timeframe, end and limit", async () => {
    const first = await provider().getBars({ symbol: "AAPL", timeframe: "1m", end: NOW, limit: 120 });
    const second = await provider().getBars({ symbol: "AAPL", timeframe: "1m", end: NOW, limit: 120 });

    expect(serialize(first)).toEqual(serialize(second));
    expect(first).toHaveLength(120);
  });

  it("returns different candles for a different seed", async () => {
    const first = await provider(1).getBars({ symbol: "AAPL", timeframe: "1D", end: NOW, limit: 60 });
    const second = await provider(2).getBars({ symbol: "AAPL", timeframe: "1D", end: NOW, limit: 60 });

    expect(serialize(first)).not.toEqual(serialize(second));
  });

  it("keeps 300 minute candles continuous and sane", async () => {
    const bars = await provider().getBars({ symbol: "TSLA", timeframe: "1m", end: NOW, limit: 300 });

    expect(bars).toHaveLength(300);
    expectSaneSeries(bars);
    expect(at(bars, -1).time.toISOString()).toBe("2026-09-08T18:33:00.000Z");
  });

  it("keeps 300 daily candles continuous and sane", async () => {
    const bars = await provider().getBars({ symbol: "TSLA", timeframe: "1D", end: NOW, limit: 300 });

    expect(bars).toHaveLength(300);
    expectSaneSeries(bars);
    expect(at(bars, -1).time.toISOString()).toBe("2026-09-07T00:00:00.000Z");
  });

  it("aggregates 5m candles from the 1m candles", async () => {
    const minutes = await provider().getBars({
      symbol: "MSFT",
      timeframe: "1m",
      end: new Date("2026-09-08T18:30:00.000Z"),
      limit: 300,
    });
    const fiveMinutes = await provider().getBars({ symbol: "MSFT", timeframe: "5m", end: NOW, limit: 60 });
    const groups = [...groupBy(minutes, fiveMinuteKey).entries()];

    expect(fiveMinutes).toHaveLength(60);
    expect(groups).toHaveLength(60);
    fiveMinutes.forEach((bar, index) => {
      const [key, group] = at(groups, index);
      expect(group).toHaveLength(5);
      expect(bar.time.toISOString()).toBe(key);
      expect({
        open: bar.open.toString(),
        high: bar.high.toString(),
        low: bar.low.toString(),
        close: bar.close.toString(),
        volume: bar.volume.toString(),
      }).toEqual(aggregate(group));
    });
  });

  it("aggregates 1W candles from the 1D candles on Monday boundaries", async () => {
    const days = await provider().getBars({ symbol: "MSFT", timeframe: "1D", end: NOW, limit: 400 });
    const weeks = await provider().getBars({ symbol: "MSFT", timeframe: "1W", end: NOW, limit: 8 });
    const complete = [...groupBy(days, weekKey).entries()].filter(([, group]) => group.length === 7);
    const expected = complete.slice(-8);

    expect(weeks).toHaveLength(8);
    weeks.forEach((bar, index) => {
      const [key, group] = at(expected, index);
      expect(bar.time.getUTCDay()).toBe(1);
      expect(bar.time.toISOString()).toBe(key);
      expect({
        open: bar.open.toString(),
        high: bar.high.toString(),
        low: bar.low.toString(),
        close: bar.close.toString(),
        volume: bar.volume.toString(),
      }).toEqual(aggregate(group));
    });
  });

  it("returns nothing before the two year daily history", async () => {
    const bars = await provider().getBars({
      symbol: "AAPL",
      timeframe: "1D",
      end: new Date("2023-09-08T00:00:00.000Z"),
      limit: 300,
    });

    expect(bars).toEqual([]);
  });

  it("returns nothing before the thirty day minute history", async () => {
    const bars = await provider().getBars({
      symbol: "AAPL",
      timeframe: "1m",
      end: new Date("2026-08-08T18:34:00.000Z"),
      limit: 300,
    });

    expect(bars).toEqual([]);
  });

  it("stops at the start of the minute history instead of inventing candles", async () => {
    const bars = await provider().getBars({
      symbol: "AAPL",
      timeframe: "1m",
      end: new Date("2026-08-09T19:34:00.000Z"),
      limit: 300,
    });

    expect(bars.length).toBeLessThan(300);
    expect(at(bars, 0).time.getTime()).toBeGreaterThanOrEqual(NOW.getTime() - 30 * 24 * 60 * 60_000);
  });

  it("returns an empty list for an unknown symbol", async () => {
    expect(await provider().getBars({ symbol: "NOPE", timeframe: "1m", end: NOW, limit: 10 })).toEqual([]);
  });
});
