import { Decimal } from "@stockdesk/shared";
import { describe, expect, it, vi } from "vitest";

import type { MarketDataProviderName } from "../../../lib/config.js";
import { createCompositeProvider, ProviderUnavailableError } from "./composite.js";
import type { Bar, Capability, MarketDataProvider, Quote, SymbolProfile, Trade, TradeHandler } from "./types.js";

interface FakeOptions {
  name: MarketDataProviderName;
  capabilities: Capability[];
  getBars?: MarketDataProvider["getBars"];
  getQuote?: MarketDataProvider["getQuote"];
  getProfile?: MarketDataProvider["getProfile"];
  subscribeTrades?: MarketDataProvider["subscribeTrades"];
}

interface FakeProvider extends MarketDataProvider {
  emit(trade: Trade): void;
  started: number;
  stopped: number;
}

function bar(symbol: string, close: string): Bar {
  return {
    symbol,
    timeframe: "1m",
    time: new Date("2026-09-08T18:33:00.000Z"),
    open: new Decimal(close),
    high: new Decimal(close),
    low: new Decimal(close),
    close: new Decimal(close),
    volume: new Decimal(100),
  };
}

function quote(symbol: string, last: string): Quote {
  return {
    symbol,
    last: new Decimal(last),
    prevClose: null,
    open: null,
    high: null,
    low: null,
    volume: null,
    at: new Date("2026-09-08T18:34:00.000Z"),
  };
}

function profile(symbol: string, name: string): SymbolProfile {
  return {
    symbol,
    name,
    exchange: null,
    industry: null,
    marketCap: null,
    sharesOutstanding: null,
    peRatio: null,
    week52High: null,
    week52Low: null,
    beta: null,
    dividendYield: null,
    logoUrl: null,
    websiteUrl: null,
    ipoDate: null,
  };
}

function createFakeProvider(options: FakeOptions): FakeProvider {
  const handlers = new Set<TradeHandler>();
  const fake: FakeProvider = {
    name: options.name,
    capabilities: new Set(options.capabilities),
    started: 0,
    stopped: 0,
    async start() {
      fake.started += 1;
    },
    async stop() {
      fake.stopped += 1;
    },
    subscribeTrades: options.subscribeTrades ?? (async () => undefined),
    async unsubscribeTrades() {
      return undefined;
    },
    onTrade(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    getBars: options.getBars ?? (async () => []),
    async listAssets() {
      return [];
    },
    getProfile: options.getProfile ?? (async () => null),
    getQuote: options.getQuote ?? (async () => null),
    emit(trade) {
      for (const handler of handlers) handler(trade);
    },
  };
  return fake;
}

const QUERY = {
  symbol: "TSLA",
  timeframe: "1m",
  end: new Date("2026-09-08T18:34:00.000Z"),
  limit: 1,
} as const;

function at<T>(items: readonly T[], index: number): T {
  const value = items.at(index);
  if (value === undefined) throw new Error(`Missing element at index ${index}`);
  return value;
}

describe("composite provider", () => {
  it("unions the capabilities and reports the active providers", () => {
    const alpaca = createFakeProvider({ name: "alpaca", capabilities: ["stream", "bars"] });
    const finnhub = createFakeProvider({ name: "finnhub", capabilities: ["profile"] });
    const composite = createCompositeProvider({ providers: [alpaca, finnhub], log: vi.fn() });

    expect([...composite.capabilities].sort()).toEqual(["bars", "profile", "stream"]);
    expect(composite.activeProviderNames()).toEqual(["alpaca", "finnhub"]);
    expect(composite.streamProviderName()).toBe("alpaca");
  });

  it("uses the first provider that declares the capability", async () => {
    const finnhub = createFakeProvider({
      name: "finnhub",
      capabilities: ["quote"],
      getQuote: async (symbol) => quote(symbol, "10"),
    });
    const simulated = createFakeProvider({
      name: "simulated",
      capabilities: ["quote"],
      getQuote: async (symbol) => quote(symbol, "20"),
    });
    const composite = createCompositeProvider({ providers: [finnhub, simulated], log: vi.fn() });

    expect((await composite.getQuote("TSLA"))?.last.toString()).toBe("10");
  });

  it("retries the same provider once before falling back", async () => {
    const getBars = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue([bar("TSLA", "250")]);
    const alpaca = createFakeProvider({ name: "alpaca", capabilities: ["bars"], getBars });
    const simulated = createFakeProvider({
      name: "simulated",
      capabilities: ["bars"],
      getBars: async () => [bar("TSLA", "1")],
    });
    const log = vi.fn();
    const composite = createCompositeProvider({ providers: [alpaca, simulated], log });

    const bars = await composite.getBars(QUERY);

    expect(getBars).toHaveBeenCalledTimes(2);
    expect(at(bars, 0).close.toString()).toBe("250");
    expect(log).not.toHaveBeenCalled();
  });

  it("falls back to the next provider and logs after two failures", async () => {
    const alpaca = createFakeProvider({
      name: "alpaca",
      capabilities: ["bars"],
      getBars: async () => {
        throw new Error("upstream down");
      },
    });
    const simulated = createFakeProvider({
      name: "simulated",
      capabilities: ["bars"],
      getBars: async () => [bar("TSLA", "1")],
    });
    const log = vi.fn();
    const composite = createCompositeProvider({ providers: [alpaca, simulated], log });

    const bars = await composite.getBars(QUERY);

    expect(at(bars, 0).close.toString()).toBe("1");
    expect(log).toHaveBeenCalledTimes(1);
    const message = at(at(log.mock.calls, 0), 0) as string;
    expect(message).toContain("alpaca");
    expect(message).toContain("bars");
    expect(message).toContain("TSLA");
    expect(message).toContain("upstream down");
  });

  it("throws PROVIDER_UNAVAILABLE when every capable provider failed", async () => {
    const failing = createFakeProvider({
      name: "alpaca",
      capabilities: ["bars"],
      getBars: async () => {
        throw new Error("upstream down");
      },
    });
    const composite = createCompositeProvider({ providers: [failing], log: vi.fn() });

    await expect(composite.getBars(QUERY)).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it("never falls back to simulated prices for a symbol a real provider already served", async () => {
    let healthy = true;
    const alpaca = createFakeProvider({
      name: "alpaca",
      capabilities: ["bars"],
      getBars: async (query) => {
        if (!healthy) throw new Error("upstream down");
        return [bar(query.symbol, "250")];
      },
    });
    const simulated = createFakeProvider({
      name: "simulated",
      capabilities: ["bars"],
      getBars: async (query) => [bar(query.symbol, "1")],
    });
    const composite = createCompositeProvider({ providers: [alpaca, simulated], log: vi.fn() });

    await composite.getBars(QUERY);
    healthy = false;

    await expect(composite.getBars(QUERY)).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it("uses the simulated provider for a symbol no real provider can serve", async () => {
    const alpaca = createFakeProvider({ name: "alpaca", capabilities: ["stream"] });
    const simulated = createFakeProvider({
      name: "simulated",
      capabilities: ["bars"],
      getBars: async (query) => [bar(query.symbol, "1")],
    });
    const composite = createCompositeProvider({ providers: [alpaca, simulated], log: vi.fn() });

    const bars = await composite.getBars({ ...QUERY, symbol: "AAPL" });

    expect(at(bars, 0).close.toString()).toBe("1");
  });

  it("returns a null profile instead of simulated data for a real served symbol", async () => {
    let healthy = true;
    const alpaca = createFakeProvider({
      name: "alpaca",
      capabilities: ["bars"],
      getBars: async (query) => {
        if (!healthy) throw new Error("upstream down");
        return [bar(query.symbol, "250")];
      },
    });
    const simulated = createFakeProvider({
      name: "simulated",
      capabilities: ["profile"],
      getProfile: async (symbol) => profile(symbol, "Simulated Motors"),
    });
    const composite = createCompositeProvider({ providers: [alpaca, simulated], log: vi.fn() });

    await composite.getBars(QUERY);
    healthy = false;

    expect(await composite.getProfile("TSLA")).toBeNull();
    expect(await composite.getProfile("AAPL")).toEqual(profile("AAPL", "Simulated Motors"));
  });

  it("subscribes on the stream provider and fans its trades in", async () => {
    const subscribeTrades = vi.fn(async () => undefined);
    const alpaca = createFakeProvider({ name: "alpaca", capabilities: ["stream"], subscribeTrades });
    const simulated = createFakeProvider({ name: "simulated", capabilities: ["stream", "bars"] });
    const composite = createCompositeProvider({ providers: [alpaca, simulated], log: vi.fn() });
    const seen: Trade[] = [];
    composite.onTrade((trade) => seen.push(trade));

    await composite.subscribeTrades(["TSLA"]);
    alpaca.emit({ symbol: "TSLA", price: new Decimal("250"), size: new Decimal(10), at: new Date() });
    simulated.emit({ symbol: "AAPL", price: new Decimal("220"), size: new Decimal(5), at: new Date() });

    expect(subscribeTrades).toHaveBeenCalledWith(["TSLA"]);
    expect(seen.map((trade) => trade.symbol)).toEqual(["TSLA", "AAPL"]);
  });

  it("never streams simulated ticks for a symbol a real provider already served", async () => {
    const alpacaSubscribe = vi.fn(async () => {
      throw new Error("stream refused");
    });
    const alpaca = createFakeProvider({
      name: "alpaca",
      capabilities: ["stream", "bars"],
      getBars: async (query) => [bar(query.symbol, "250")],
      subscribeTrades: alpacaSubscribe,
    });
    const simulatedSubscribe = vi.fn(async () => undefined);
    const simulated = createFakeProvider({
      name: "simulated",
      capabilities: ["stream", "bars"],
      subscribeTrades: simulatedSubscribe,
    });
    const log = vi.fn();
    const composite = createCompositeProvider({ providers: [alpaca, simulated], log });

    await composite.getBars(QUERY);

    await expect(composite.subscribeTrades(["TSLA"])).rejects.toBeInstanceOf(ProviderUnavailableError);

    expect(alpacaSubscribe).toHaveBeenCalledTimes(2);
    expect(simulatedSubscribe).not.toHaveBeenCalled();
    expect(at(at(log.mock.calls, 0), 0)).toContain("stream refused");
  });

  it("unsubscribes on every stream provider and survives a failure", async () => {
    const failing = createFakeProvider({ name: "alpaca", capabilities: ["stream"] });
    failing.unsubscribeTrades = async () => {
      throw new Error("socket closed");
    };
    const unsubscribeTrades = vi.fn(async () => undefined);
    const simulated = createFakeProvider({ name: "simulated", capabilities: ["stream"] });
    simulated.unsubscribeTrades = unsubscribeTrades;
    const log = vi.fn();
    const composite = createCompositeProvider({ providers: [failing, simulated], log });

    await composite.unsubscribeTrades(["TSLA"]);

    expect(unsubscribeTrades).toHaveBeenCalledWith(["TSLA"]);
    expect(at(at(log.mock.calls, 0), 0)).toContain("socket closed");
  });

  it("lists assets through the first search capable provider", async () => {
    const record = { symbol: "TSLA", name: "Tesla, Inc.", exchange: "NASDAQ", shortable: true, fractionable: true };
    const alpaca = createFakeProvider({ name: "alpaca", capabilities: ["search"] });
    alpaca.listAssets = async () => [record];
    const simulated = createFakeProvider({ name: "simulated", capabilities: ["search"] });
    const composite = createCompositeProvider({ providers: [alpaca, simulated], log: vi.fn() });

    expect(await composite.listAssets()).toEqual([record]);
  });

  it("starts and stops every provider", async () => {
    const alpaca = createFakeProvider({ name: "alpaca", capabilities: ["stream"] });
    const simulated = createFakeProvider({ name: "simulated", capabilities: ["bars"] });
    const composite = createCompositeProvider({ providers: [alpaca, simulated], log: vi.fn() });

    await composite.start();
    await composite.stop();

    expect([alpaca.started, alpaca.stopped]).toEqual([1, 1]);
    expect([simulated.started, simulated.stopped]).toEqual([1, 1]);
  });
});
