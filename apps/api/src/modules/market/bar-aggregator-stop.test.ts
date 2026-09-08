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
const NOW = new Date("2026-09-08T18:00:00.000Z");
const FIRST_TRADE_AT = "2026-09-08T18:00:10.000Z";
const NEXT_BUCKET_TRADE_AT = "2026-09-08T18:01:10.000Z";

const IDLE_TIMERS: BarAggregatorTimers = {
  setTimeout: () => null,
  clearTimeout: () => undefined,
};

interface StopHarness {
  aggregator: BarAggregator;
  writes: CandleInput[];
  updates: BarUpdate[];
  emit: (at: string, price: string) => Promise<void>;
}

function trade(at: string, price: string): Trade {
  return { symbol: SYMBOL, price: new Decimal(price), size: new Decimal("1"), at: new Date(at) };
}

function createStopHarness(): StopHarness {
  const handlers = new Set<TradeHandler>();
  const writes: CandleInput[] = [];
  const updates: BarUpdate[] = [];

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
        writes.push(bar);
      },
      finalizeBar: async (bar: CandleInput) => {
        writes.push(bar);
      },
    },
    symbols: async () => SYMBOL_ID,
    now: () => NOW,
    log: () => undefined,
    timers: IDLE_TIMERS,
  });

  aggregator.onBar((update) => updates.push(update));

  return {
    aggregator,
    writes,
    updates,
    emit: async (at: string, price: string) => {
      for (const handler of handlers) handler(trade(at, price));
      await aggregator.flush();
    },
  };
}

describe("bar aggregator shutdown", () => {
  it("ignores a trade that arrives after stop resolved", async () => {
    const harness = createStopHarness();

    harness.aggregator.start();
    await harness.emit(FIRST_TRADE_AT, "100");

    const writesBeforeStop = harness.writes.length;
    const updatesBeforeStop = harness.updates.length;

    expect(writesBeforeStop).toBeGreaterThan(0);

    await harness.aggregator.stop();
    await harness.emit(NEXT_BUCKET_TRADE_AT, "101");

    expect(harness.updates).toHaveLength(updatesBeforeStop);
    expect(harness.writes).toHaveLength(writesBeforeStop);
  });
});
