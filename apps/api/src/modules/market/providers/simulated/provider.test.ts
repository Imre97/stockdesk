import { Decimal } from "@stockdesk/shared";
import { describe, expect, it, vi } from "vitest";

import type { Trade } from "../types.js";
import { createSimulatedProvider } from "./provider.js";
import { SIMULATED_UNIVERSE } from "./universe.js";

const NOW = new Date("2026-09-08T18:34:00.000Z");
const SEED = 4242;

function at<T>(items: readonly T[], index: number): T {
  const value = items.at(index);
  if (value === undefined) throw new Error(`Missing element at index ${index}`);
  return value;
}

function provider(now: () => Date = () => NOW) {
  return createSimulatedProvider({ seed: SEED, now });
}

function collect(target: ReturnType<typeof provider>): Trade[] {
  const trades: Trade[] = [];
  target.onTrade((trade) => trades.push(trade));
  return trades;
}

describe("simulated provider", () => {
  it("declares its name and every capability", () => {
    const target = provider();

    expect(target.name).toBe("simulated");
    expect([...target.capabilities].sort()).toEqual(["bars", "profile", "quote", "search", "stream"]);
  });

  it("emits one trade per subscribed symbol", async () => {
    const target = provider();
    const trades = collect(target);
    await target.subscribeTrades(["AAPL", "MSFT"]);

    const emitted = target.emitTick();

    expect(emitted).toHaveLength(2);
    expect(trades.map((trade) => trade.symbol).sort()).toEqual(["AAPL", "MSFT"]);
    for (const trade of trades) {
      expect(trade.price).toBeInstanceOf(Decimal);
      expect(trade.size).toBeInstanceOf(Decimal);
      expect(trade.price.greaterThan(0)).toBe(true);
      expect(trade.size.isInteger()).toBe(true);
      expect(trade.size.greaterThanOrEqualTo(1)).toBe(true);
      expect(trade.size.lessThanOrEqualTo(500)).toBe(true);
      expect(trade.at).toBeInstanceOf(Date);
      expect(trade.at.toISOString()).toBe(NOW.toISOString());
    }
  });

  it("stops emitting for unsubscribed symbols and ignores unknown ones", async () => {
    const target = provider();
    const trades = collect(target);
    await target.subscribeTrades(["AAPL", "MSFT", "NOPE"]);
    await target.unsubscribeTrades(["MSFT"]);

    target.emitTick();

    expect(trades.map((trade) => trade.symbol)).toEqual(["AAPL"]);
  });

  it("drops a trade handler after its unsubscribe function runs", async () => {
    const target = provider();
    const trades: Trade[] = [];
    const off = target.onTrade((trade) => trades.push(trade));
    await target.subscribeTrades(["AAPL"]);
    target.emitTick();
    off();
    target.emitTick();

    expect(trades).toHaveLength(1);
  });

  it("continues the tick price from the last completed minute", async () => {
    const target = provider();
    await target.subscribeTrades(["AAPL"]);
    const bars = await target.getBars({ symbol: "AAPL", timeframe: "1m", end: NOW, limit: 2 });
    const lastClose = at(bars, -1).close;

    const trade = at(target.emitTick(), 0);

    expect(trade.price.minus(lastClose).abs().dividedBy(lastClose).lessThan("0.01")).toBe(true);
  });

  it("installs no timer unless a tick interval is configured", async () => {
    vi.useFakeTimers();
    try {
      const target = createSimulatedProvider({ seed: SEED, now: () => NOW });
      const trades = collect(target);
      await target.subscribeTrades(["AAPL"]);
      await target.start();
      vi.advanceTimersByTime(5000);
      await target.stop();

      expect(trades).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits on the configured interval after start and stops on stop", async () => {
    vi.useFakeTimers();
    try {
      const target = createSimulatedProvider({ seed: SEED, now: () => NOW, tickIntervalMs: 1000 });
      const trades = collect(target);
      await target.subscribeTrades(["AAPL"]);
      await target.start();
      vi.advanceTimersByTime(3000);
      await target.stop();
      vi.advanceTimersByTime(3000);

      expect(trades).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lists every universe asset with its trading flags", async () => {
    const assets = await provider().listAssets();

    expect(assets).toHaveLength(SIMULATED_UNIVERSE.length);
    expect(assets.find((asset) => asset.symbol === "BRK.B")).toEqual({
      symbol: "BRK.B",
      name: expect.any(String),
      exchange: expect.any(String),
      shortable: expect.any(Boolean),
      fractionable: false,
    });
  });

  it("derives the quote from the walk with the previous day close", async () => {
    const target = provider();
    const days = await target.getBars({ symbol: "AAPL", timeframe: "1D", end: NOW, limit: 2 });
    const quote = await target.getQuote("AAPL");

    if (quote === null) throw new Error("Expected a simulated quote for AAPL");
    expect(quote.prevClose?.toString()).toBe(at(days, -1).close.toString());
    expect(quote.open?.toString()).toBe(at(days, -1).close.toString());
    expect(quote.at.toISOString()).toBe(NOW.toISOString());
    expect(quote.low?.lessThanOrEqualTo(quote.last)).toBe(true);
    expect(quote.high?.greaterThanOrEqualTo(quote.last)).toBe(true);
    expect(quote.volume?.greaterThan(0)).toBe(true);
  });

  it("reports the latest trade as the quoted last price", async () => {
    const target = provider();
    await target.subscribeTrades(["AAPL"]);
    const trade = at(target.emitTick(), 0);

    const quote = await target.getQuote("AAPL");

    expect(quote?.last.toString()).toBe(trade.price.toString());
  });

  it("derives the profile from the universe and the daily path", async () => {
    const target = provider();
    const days = await target.getBars({ symbol: "AAPL", timeframe: "1D", end: NOW, limit: 252 });
    const profile = await target.getProfile("AAPL");
    const asset = SIMULATED_UNIVERSE.find((entry) => entry.symbol === "AAPL");

    expect(profile?.symbol).toBe("AAPL");
    expect(profile?.marketCap?.toString()).toBe(
      asset?.basePrice.times(asset.sharesOutstanding).toDecimalPlaces(2).toString(),
    );
    expect(profile?.week52High?.toString()).toBe(
      Decimal.max(...days.map((bar) => bar.high)).toString(),
    );
    expect(profile?.week52Low?.toString()).toBe(Decimal.min(...days.map((bar) => bar.low)).toString());
    expect(profile?.beta).toBeInstanceOf(Decimal);
    expect(profile?.exchange).toBe(asset?.exchange);
  });

  it("returns null for an unknown symbol", async () => {
    const target = provider();

    expect(await target.getQuote("NOPE")).toBeNull();
    expect(await target.getProfile("NOPE")).toBeNull();
  });
});
