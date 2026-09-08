import { Decimal } from "@stockdesk/shared";
import { describe, expect, it } from "vitest";
import {
  createBarAggregator,
  type BarAggregator,
  type BarAggregatorTimers,
  type BarUpdate,
} from "./bar-aggregator.js";
import type { CandleInput } from "./candles-repository.js";
import type { Trade, TradeHandler } from "./providers/types.js";

const SYMBOL = "TSLA";
const SYMBOL_ID = "symbol-tsla";
const FIRST_MINUTE = "2026-09-08T18:00:00.000Z";
const SECOND_MINUTE = "2026-09-08T18:01:00.000Z";
const DAY_START = "2026-09-08T04:00:00.000Z";
const PERSIST_INTERVAL_MS = 1000;

interface ManualTimers extends BarAggregatorTimers {
  fire: () => void;
  pending: () => number;
}

function manualTimers(): ManualTimers {
  let handlers: (() => void)[] = [];

  return {
    setTimeout: (handler: () => void) => {
      handlers.push(handler);
      return handler;
    },
    clearTimeout: (handle: unknown) => {
      handlers = handlers.filter((handler) => handler !== handle);
    },
    fire: () => {
      const current = handlers;
      handlers = [];
      for (const handler of current) handler();
    },
    pending: () => handlers.length,
  };
}

function trade(at: string, price: string, size: string): Trade {
  return { symbol: SYMBOL, price: new Decimal(price), size: new Decimal(size), at: new Date(at) };
}

interface Harness {
  aggregator: BarAggregator;
  timers: ManualTimers;
  forming: CandleInput[];
  finalized: CandleInput[];
  updates: BarUpdate[];
  setNow: (at: string) => void;
  emit: (value: Trade) => Promise<void>;
}

function createHarness(): Harness {
  const handlers = new Set<TradeHandler>();
  const forming: CandleInput[] = [];
  const finalized: CandleInput[] = [];
  const updates: BarUpdate[] = [];
  const timers = manualTimers();
  let current = new Date(FIRST_MINUTE);

  const aggregator = createBarAggregator({
    priceService: {
      onTrade: (handler: TradeHandler) => {
        handlers.add(handler);
        return () => {
          handlers.delete(handler);
        };
      },
    },
    candles: {
      saveFormingBar: async (bar: CandleInput) => {
        forming.push(bar);
      },
      finalizeBar: async (bar: CandleInput) => {
        finalized.push(bar);
      },
    },
    symbols: async () => SYMBOL_ID,
    now: () => current,
    log: () => undefined,
    timers,
    persistIntervalMs: PERSIST_INTERVAL_MS,
  });

  aggregator.onBar((update) => updates.push(update));

  return {
    aggregator,
    timers,
    forming,
    finalized,
    updates,
    setNow: (at: string) => {
      current = new Date(at);
    },
    emit: async (value: Trade) => {
      for (const handler of handlers) handler(value);
      await aggregator.flush();
    },
  };
}

function minuteUpdates(updates: BarUpdate[]): BarUpdate[] {
  return updates.filter((update) => update.timeframe === "1m");
}

function lastOf(updates: BarUpdate[]): BarUpdate {
  const update = updates[updates.length - 1];
  if (update === undefined) throw new Error("Expected at least one bar update.");
  return update;
}

describe("bar aggregator", () => {
  it("opens a forming bar on the first trade of a bucket", async () => {
    const harness = createHarness();

    await harness.emit(trade("2026-09-08T18:00:10.000Z", "100", "5"));

    const update = lastOf(minuteUpdates(harness.updates));

    expect(update.isFinal).toBe(false);
    expect(update.bar.time.toISOString()).toBe(FIRST_MINUTE);
    expect(update.bar.open.toString()).toBe("100");
    expect(update.bar.high.toString()).toBe("100");
    expect(update.bar.low.toString()).toBe("100");
    expect(update.bar.close.toString()).toBe("100");
    expect(update.bar.volume.toString()).toBe("5");
  });

  it("widens the forming bar on later trades of the same bucket", async () => {
    const harness = createHarness();

    await harness.emit(trade("2026-09-08T18:00:10.000Z", "100", "5"));
    await harness.emit(trade("2026-09-08T18:00:20.000Z", "101", "3"));
    await harness.emit(trade("2026-09-08T18:00:30.000Z", "99", "2"));

    const update = lastOf(minuteUpdates(harness.updates));

    expect(update.bar.open.toString()).toBe("100");
    expect(update.bar.high.toString()).toBe("101");
    expect(update.bar.low.toString()).toBe("99");
    expect(update.bar.close.toString()).toBe("99");
    expect(update.bar.volume.toString()).toBe("10");
  });

  it("finalizes the previous bar when a trade opens the next bucket", async () => {
    const harness = createHarness();

    await harness.emit(trade("2026-09-08T18:00:10.000Z", "100", "5"));
    await harness.emit(trade("2026-09-08T18:01:05.000Z", "102", "4"));

    const minutes = minuteUpdates(harness.updates);
    const closed = minutes.filter((update) => update.isFinal);
    const opened = lastOf(minutes);

    expect(closed).toHaveLength(1);
    expect(closed[0]?.bar.time.toISOString()).toBe(FIRST_MINUTE);
    expect(closed[0]?.bar.close.toString()).toBe("100");
    expect(opened.isFinal).toBe(false);
    expect(opened.bar.time.toISOString()).toBe(SECOND_MINUTE);
    expect(opened.bar.open.toString()).toBe("102");

    const finalizedMinutes = harness.finalized.filter((bar) => bar.timeframe === "1m");

    expect(finalizedMinutes).toHaveLength(1);
    expect(finalizedMinutes[0]?.time.toISOString()).toBe(FIRST_MINUTE);
  });

  it("finalizes a quiet symbol's bar in the sweep", async () => {
    const harness = createHarness();

    await harness.emit(trade("2026-09-08T18:00:10.000Z", "100", "5"));
    await harness.aggregator.sweep(new Date("2026-09-08T18:01:30.000Z"));

    const closed = minuteUpdates(harness.updates).filter((update) => update.isFinal);

    expect(closed).toHaveLength(1);
    expect(closed[0]?.bar.time.toISOString()).toBe(FIRST_MINUTE);
    expect(harness.finalized.filter((bar) => bar.timeframe === "1m")).toHaveLength(1);
  });

  it("aggregates a timeframe only while it is tracked", async () => {
    const harness = createHarness();

    await harness.emit(trade("2026-09-08T18:00:10.000Z", "100", "5"));

    expect(harness.updates.filter((update) => update.timeframe === "5m")).toHaveLength(0);

    harness.aggregator.trackTimeframe(SYMBOL, "5m");
    await harness.emit(trade("2026-09-08T18:00:20.000Z", "101", "3"));

    expect(harness.updates.filter((update) => update.timeframe === "5m")).toHaveLength(1);

    harness.aggregator.untrackTimeframe(SYMBOL, "5m");
    await harness.emit(trade("2026-09-08T18:00:30.000Z", "102", "1"));

    expect(harness.updates.filter((update) => update.timeframe === "5m")).toHaveLength(1);
  });

  it("keeps a timeframe tracked until the last subscriber releases it", async () => {
    const harness = createHarness();

    harness.aggregator.trackTimeframe(SYMBOL, "5m");
    harness.aggregator.trackTimeframe(SYMBOL, "5m");
    harness.aggregator.untrackTimeframe(SYMBOL, "5m");

    await harness.emit(trade("2026-09-08T18:00:10.000Z", "100", "5"));

    expect(harness.updates.filter((update) => update.timeframe === "5m")).toHaveLength(1);
  });

  it("accumulates the daily bar across minutes", async () => {
    const harness = createHarness();

    await harness.emit(trade("2026-09-08T18:00:10.000Z", "100", "5"));
    await harness.emit(trade("2026-09-08T18:01:05.000Z", "102", "3"));

    const daily = lastOf(harness.updates.filter((update) => update.timeframe === "1D"));

    expect(daily.isFinal).toBe(false);
    expect(daily.bar.time.toISOString()).toBe(DAY_START);
    expect(daily.bar.open.toString()).toBe("100");
    expect(daily.bar.high.toString()).toBe("102");
    expect(daily.bar.volume.toString()).toBe("8");
  });

  it("persists a forming bar at most once per second", async () => {
    const harness = createHarness();

    await harness.emit(trade("2026-09-08T18:00:10.000Z", "100", "5"));
    await harness.emit(trade("2026-09-08T18:00:11.000Z", "101", "3"));

    expect(harness.forming.filter((bar) => bar.timeframe === "1m")).toHaveLength(1);

    harness.setNow("2026-09-08T18:00:12.000Z");
    await harness.emit(trade("2026-09-08T18:00:12.000Z", "103", "2"));

    const persisted = harness.forming.filter((bar) => bar.timeframe === "1m");

    expect(persisted).toHaveLength(2);
    expect(persisted[1]?.close.toString()).toBe("103");
    expect(persisted[1]?.symbolId).toBe(SYMBOL_ID);
  });

  it("schedules the sweep on start and clears it on stop", async () => {
    const harness = createHarness();

    await harness.emit(trade("2026-09-08T18:00:10.000Z", "100", "5"));
    harness.aggregator.start();

    expect(harness.timers.pending()).toBe(1);

    harness.setNow("2026-09-08T18:01:00.000Z");
    harness.timers.fire();
    await harness.aggregator.flush();

    expect(minuteUpdates(harness.updates).filter((update) => update.isFinal)).toHaveLength(1);
    expect(harness.timers.pending()).toBe(1);

    harness.aggregator.stop();

    expect(harness.timers.pending()).toBe(0);
  });
});

describe("bar aggregator stop", () => {
  it("waits for every in-flight persistence before it resolves", async () => {
    const handlers = new Set<TradeHandler>();
    const forming: CandleInput[] = [];
    const releases: (() => void)[] = [];
    const aggregator = createBarAggregator({
      priceService: {
        onTrade: (handler: TradeHandler) => {
          handlers.add(handler);
          return () => {
            handlers.delete(handler);
          };
        },
      },
      candles: {
        saveFormingBar: async (bar: CandleInput) => {
          await new Promise<void>((resolve) => {
            releases.push(resolve);
          });
          forming.push(bar);
        },
        finalizeBar: async () => undefined,
      },
      symbols: async () => SYMBOL_ID,
      now: () => new Date(FIRST_MINUTE),
      log: () => undefined,
      timers: manualTimers(),
      persistIntervalMs: PERSIST_INTERVAL_MS,
    });

    for (const handler of handlers) handler(trade("2026-09-08T18:00:10.000Z", "100", "5"));

    let settled = false;
    const stopped = Promise.resolve(aggregator.stop()).then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(settled).toBe(false);

    for (const release of releases) release();
    await stopped;

    expect(forming).toHaveLength(2);
  });
});
