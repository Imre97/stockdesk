import { Decimal, type MarketStatus } from "@stockdesk/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/lib/config.js";
import type { PriceTimers } from "../src/modules/market/price-service.js";
import { createSimulatedProvider } from "../src/modules/market/providers/simulated/provider.js";
import { createMarketRuntime, type MarketRuntime } from "../src/modules/market/runtime.js";
import { upsertSymbols } from "../src/modules/market/symbols-repository.js";
import { truncateAll } from "./db.js";
import { createFakeProvider } from "./market-fakes.js";
import { MARKET_NOW, MARKET_SEED } from "./market-helpers.js";

const SATURDAY = new Date("2026-09-12T18:00:00.000Z");

const config = loadConfig(process.env);

interface ManualTimers extends PriceTimers {
  run: () => void;
  installed: () => number;
}

function manualTimers(): ManualTimers {
  const handlers = new Set<() => void>();

  return {
    setInterval: (handler) => {
      handlers.add(handler);
      return handler;
    },
    clearInterval: (handle) => {
      handlers.delete(handle as () => void);
    },
    run: () => {
      for (const handler of [...handlers]) handler();
    },
    installed: () => handlers.size,
  };
}

const runtimes: MarketRuntime[] = [];

function quoted(prices: Map<string, Decimal | null>): string[] {
  return [...prices].map(([symbol, price]) => `${symbol}=${price?.toString() ?? "null"}`);
}

function buildRuntime(now: Date, timers?: PriceTimers, real = false) {
  const provider = createSimulatedProvider({ seed: MARKET_SEED, now: () => now });
  const providers = real
    ? [createFakeProvider({ name: "alpaca", capabilities: ["stream", "bars"] }), provider]
    : [provider];

  const runtime = createMarketRuntime({
    config,
    providers,
    now: () => now,
    log: () => undefined,
    priceTimers: timers,
  });

  runtimes.push(runtime);

  return { provider, runtime };
}

describe("price service", () => {
  afterEach(async () => {
    for (const runtime of runtimes.splice(0)) await runtime.stop();
  });

  beforeEach(async () => {
    await truncateAll();
    const provider = createSimulatedProvider({ seed: MARKET_SEED, now: () => MARKET_NOW });
    await upsertSymbols(await provider.listAssets(), "simulated");
  });

  it("returns no price for a symbol without trades or candles", async () => {
    const { runtime } = buildRuntime(MARKET_NOW);

    expect(await runtime.priceService.getLastPrice("TSLA")).toBeNull();
    expect(await runtime.priceService.getLastPrice("XXXX")).toBeNull();
  });

  it("prefers the last streamed trade over the candle cache", async () => {
    const { provider, runtime } = buildRuntime(MARKET_NOW);

    await provider.subscribeTrades(["TSLA"]);
    const [trade] = provider.emitTick();

    expect(trade).toBeDefined();
    expect((await runtime.priceService.getLastPrice("TSLA"))?.toString()).toBe(
      trade?.price.toString(),
    );
  });

  it("falls back to the newest cached candle close", async () => {
    const { runtime } = buildRuntime(MARKET_NOW);

    const page = await runtime.candles.getBars({ symbol: "TSLA", timeframe: "1m", limit: 10 });
    const newest = page.bars[page.bars.length - 1];

    expect(newest).toBeDefined();
    expect((await runtime.priceService.getLastPrice("TSLA"))?.toString()).toBe(
      new Decimal(newest?.close ?? "0").toString(),
    );
  });

  it("batches the last prices exactly like the per-symbol lookup", async () => {
    const { provider, runtime } = buildRuntime(MARKET_NOW);

    await provider.subscribeTrades(["TSLA"]);
    provider.emitTick();
    await runtime.aggregator.flush();
    await runtime.candles.getBars({ symbol: "AAPL", timeframe: "1m", limit: 10 });
    await runtime.candles.getBars({ symbol: "MSFT", timeframe: "1D", limit: 5 });

    const symbols = ["TSLA", "AAPL", "MSFT", "XXXX"];
    const batched = await runtime.priceService.getLastPrices(symbols);
    const single = new Map<string, Decimal | null>();

    for (const symbol of symbols) {
      single.set(symbol, await runtime.priceService.getLastPrice(symbol));
    }

    expect(quoted(batched)).toEqual(quoted(single));
    expect(quoted(batched)).toHaveLength(symbols.length);
    expect(batched.get("XXXX")).toBeNull();
    expect(batched.get("AAPL")).not.toBeNull();
    expect(batched.get("MSFT")).not.toBeNull();
  });

  it("reads the previous close from the last daily candle before the trading day", async () => {
    const { runtime } = buildRuntime(MARKET_NOW);

    await runtime.candles.getBars({ symbol: "TSLA", timeframe: "1D", limit: 5 });

    const bars = await runtime.candles.getBars({ symbol: "TSLA", timeframe: "1D", limit: 5 });
    const newest = bars.bars[bars.bars.length - 1];
    const prevClose = await runtime.priceService.getPrevClose("TSLA", MARKET_NOW);

    expect(prevClose).not.toBeNull();
    expect(prevClose?.toDecimalPlaces(4).toString()).toBe(
      new Decimal(newest?.close ?? "0").toString(),
    );
  });

  it("reads the previous close from the last final daily candle before the New York day", async () => {
    const { runtime } = buildRuntime(SATURDAY);

    await runtime.candles.getBars({ symbol: "TSLA", timeframe: "1D", limit: 5 });

    const bars = await runtime.candles.getBars({ symbol: "TSLA", timeframe: "1D", limit: 5 });
    const newest = bars.bars[bars.bars.length - 1];
    const prevClose = await runtime.priceService.getPrevClose("TSLA", SATURDAY);

    expect(newest?.time).toBe("2026-09-11T04:00:00.000Z");
    expect(prevClose?.toDecimalPlaces(4).toString()).toBe(
      new Decimal(newest?.close ?? "0").toString(),
    );
  });

  it("builds a quote snapshot with a derived change", async () => {
    const { runtime } = buildRuntime(MARKET_NOW);

    const snapshot = await runtime.priceService.getQuoteSnapshot("TSLA");

    expect(snapshot).not.toBeNull();
    expect(snapshot?.prevClose).not.toBeNull();
    expect(snapshot?.change?.toString()).toBe(
      snapshot?.last.minus(snapshot.prevClose ?? new Decimal("0")).toString(),
    );
  });

  it("returns no snapshot for an unknown symbol", async () => {
    const { runtime } = buildRuntime(MARKET_NOW);

    expect(await runtime.priceService.getQuoteSnapshot("XXXX")).toBeNull();
  });

  it("reports the simulated market as always open", () => {
    const { runtime } = buildRuntime(SATURDAY);

    expect(runtime.priceService.getMarketStatus()).toEqual({
      status: "open",
      nextOpenAt: null,
      nextCloseAt: null,
    });
  });

  it("follows the calendar when a real provider owns the stream", () => {
    const { runtime } = buildRuntime(SATURDAY, undefined, true);

    expect(runtime.priceService.getMarketStatus()).toEqual({
      status: "closed",
      nextOpenAt: "2026-09-14T13:30:00.000Z",
      nextCloseAt: "2026-09-14T20:00:00.000Z",
    });
  });

  it("installs and clears the one-minute status check", () => {
    const timers = manualTimers();
    const { runtime } = buildRuntime(MARKET_NOW, timers);
    const seen: MarketStatus[] = [];

    runtime.priceService.onStatusChange((status) => seen.push(status));
    runtime.priceService.start();

    expect(timers.installed()).toBe(1);

    timers.run();
    expect(seen).toEqual([]);

    runtime.priceService.stop();
    expect(timers.installed()).toBe(0);
  });

  it("subscribes once and unsubscribes on the last release", async () => {
    const { provider, runtime } = buildRuntime(MARKET_NOW);
    const subscribe = vi.spyOn(provider, "subscribeTrades");
    const unsubscribe = vi.spyOn(provider, "unsubscribeTrades");

    await runtime.priceService.ensureStreaming(["TSLA"]);
    await runtime.priceService.ensureStreaming(["TSLA"]);

    expect(subscribe).toHaveBeenCalledTimes(1);

    await runtime.priceService.releaseStreaming(["TSLA"]);
    expect(unsubscribe).not.toHaveBeenCalled();

    await runtime.priceService.releaseStreaming(["TSLA"]);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
