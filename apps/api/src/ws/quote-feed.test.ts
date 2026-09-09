import { Decimal, type QuoteMessage } from "@stockdesk/shared";
import { describe, expect, it, vi } from "vitest";

import type { Trade, TradeHandler } from "../modules/market/providers/types.js";
import { createMarketSubscriptions } from "./market-subscriptions.js";
import { createQuoteFeed, type QuoteFeedPrices } from "./quote-feed.js";
import type { QuoteThrottle } from "./quote-throttle.js";

const SYMBOL_COUNT = 10;
const AT = new Date("2026-09-09T19:00:00.000Z");
const PREV_CLOSE = new Decimal("100.0000");

interface Pushed {
  symbol: string;
  message: QuoteMessage;
}

function symbols(): string[] {
  return Array.from(
    { length: SYMBOL_COUNT },
    (_value, index) => `ZZ${String(index + 1).padStart(2, "0")}`,
  );
}

function tradeOf(symbol: string, index: number): Trade {
  return {
    symbol,
    price: new Decimal(index + 1),
    size: new Decimal(1),
    at: AT,
  };
}

function createHarness(wanted: string[]) {
  const trades = new Map(wanted.map((symbol, index) => [symbol, tradeOf(symbol, index)]));
  const prevCloseCalls: string[][] = [];

  const prices: QuoteFeedPrices = {
    onTrade: (_handler: TradeHandler) => (): void => undefined,
    lastTrade: (symbol: string) => trades.get(symbol),
    getPrevClose: async (symbol: string) => {
      prevCloseCalls.push([symbol]);

      return PREV_CLOSE;
    },
    getPrevCloses: async (requested: string[]) => {
      prevCloseCalls.push(requested);

      return new Map(requested.map((symbol) => [symbol, PREV_CLOSE]));
    },
  };

  const pushed: Pushed[] = [];
  const throttle = {
    push: (_socket: object, symbol: string, message: QuoteMessage) => {
      pushed.push({ symbol, message });
    },
    drop: vi.fn(),
  } as unknown as QuoteThrottle;

  const feed = createQuoteFeed({
    prices,
    subscriptions: createMarketSubscriptions(),
    throttle,
    log: vi.fn(),
  });

  return { feed, pushed, prevCloseCalls };
}

describe("createQuoteFeed", () => {
  it("reads the previous closes of a whole subscribe batch in one lookup", async () => {
    const wanted = symbols();
    const { feed, pushed, prevCloseCalls } = createHarness(wanted);

    await feed.sendSnapshots({}, wanted);

    expect(prevCloseCalls).toHaveLength(1);
    expect(prevCloseCalls[0]).toEqual(wanted);

    expect(pushed.map((entry) => entry.symbol)).toEqual(wanted);
    expect(pushed.every((entry) => entry.message.prevClose === "100.0000")).toBe(true);
  });

  it("keeps the batched closes cached for the snapshots that follow", async () => {
    const wanted = symbols();
    const { feed, pushed, prevCloseCalls } = createHarness(wanted);

    await feed.sendSnapshots({}, wanted);
    await feed.sendSnapshot({}, wanted[0] ?? "");

    expect(prevCloseCalls).toHaveLength(1);
    expect(pushed).toHaveLength(SYMBOL_COUNT + 1);
  });
});
