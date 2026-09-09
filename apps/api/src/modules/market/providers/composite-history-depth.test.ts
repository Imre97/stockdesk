import { Decimal } from "@stockdesk/shared";
import { describe, expect, it, vi } from "vitest";
import { createCompositeProvider } from "./composite.js";
import type {
  AssetRecord,
  Bar,
  BarsQuery,
  HistoryDepth,
  MarketDataProvider,
  ProviderName,
  Quote,
  SymbolProfile,
  TradeHandler,
} from "./types.js";

const DEEP: HistoryDepth = { dailyDays: 1825, intradayDays: 1825 };
const SHALLOW: HistoryDepth = { dailyDays: 730, intradayDays: 30 };
const PRICE = new Decimal("100");

const QUERY: BarsQuery = {
  symbol: "TSLA",
  timeframe: "1m",
  end: new Date("2026-09-09T18:34:00.000Z"),
  limit: 1,
};

function onePage(query: BarsQuery): Bar[] {
  return [
    {
      symbol: query.symbol,
      timeframe: query.timeframe,
      time: query.end,
      open: PRICE,
      high: PRICE,
      low: PRICE,
      close: PRICE,
      volume: PRICE,
    },
  ];
}

function barsProvider(
  name: ProviderName,
  historyDepth: HistoryDepth,
  getBars: MarketDataProvider["getBars"],
): MarketDataProvider {
  return {
    name,
    capabilities: new Set(["bars"] as const),
    historyDepth,
    start: async (): Promise<void> => undefined,
    stop: async (): Promise<void> => undefined,
    subscribeTrades: async (): Promise<void> => undefined,
    unsubscribeTrades: async (): Promise<void> => undefined,
    onTrade: (_handler: TradeHandler) => (): void => undefined,
    getBars,
    listAssets: async (): Promise<AssetRecord[]> => [],
    getProfile: async (): Promise<SymbolProfile | null> => null,
    getQuote: async (): Promise<Quote | null> => null,
  };
}

describe("bars history depth of the serving provider", () => {
  it("reports the depth of the provider that served the last page of a symbol", async () => {
    let deepAvailable = false;
    const alpaca = barsProvider("alpaca", DEEP, async (query: BarsQuery): Promise<Bar[]> => {
      if (!deepAvailable) throw new Error("alpaca is unavailable");
      return onePage(query);
    });
    const simulated = barsProvider("simulated", SHALLOW, async (query: BarsQuery): Promise<Bar[]> =>
      onePage(query),
    );
    const composite = createCompositeProvider({ providers: [alpaca, simulated], log: vi.fn() });

    await composite.getBars(QUERY);

    expect(composite.barsServedDepth(QUERY.symbol)).toEqual(SHALLOW);

    deepAvailable = true;
    await composite.getBars(QUERY);

    expect(composite.barsServedDepth(QUERY.symbol)).toEqual(DEEP);
  });

  it("reports no served depth and the deepest routed one before anything served", () => {
    const alpaca = barsProvider("alpaca", DEEP, async (query: BarsQuery): Promise<Bar[]> =>
      onePage(query),
    );
    const simulated = barsProvider("simulated", SHALLOW, async (query: BarsQuery): Promise<Bar[]> =>
      onePage(query),
    );
    const composite = createCompositeProvider({ providers: [alpaca, simulated], log: vi.fn() });

    expect(composite.barsServedDepth(QUERY.symbol)).toBeNull();
    expect(composite.barsHistoryDepth(QUERY.symbol)).toEqual(DEEP);
  });

  it("keeps the served depth per symbol", async () => {
    const alpaca = barsProvider("alpaca", DEEP, async (query: BarsQuery): Promise<Bar[]> => {
      if (query.symbol === "TSLA") throw new Error("alpaca is unavailable");
      return onePage(query);
    });
    const simulated = barsProvider("simulated", SHALLOW, async (query: BarsQuery): Promise<Bar[]> =>
      onePage(query),
    );
    const composite = createCompositeProvider({ providers: [alpaca, simulated], log: vi.fn() });

    await composite.getBars(QUERY);
    await composite.getBars({ ...QUERY, symbol: "AAPL" });

    expect(composite.barsServedDepth("TSLA")).toEqual(SHALLOW);
    expect(composite.barsServedDepth("AAPL")).toEqual(DEEP);
  });
});
