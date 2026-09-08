import type { Decimal } from "@stockdesk/shared";
import type { PriceService } from "../modules/market/price-service.js";
import { bucketStartMs } from "../modules/market/timeframes.js";
import type { Trade } from "../modules/market/providers/types.js";
import { quoteMessage } from "./market-messages.js";
import type { MarketSubscriptions } from "./market-subscriptions.js";
import type { QuoteThrottle } from "./quote-throttle.js";

export interface QuoteFeedPrices {
  onTrade: PriceService["onTrade"];
  lastTrade: PriceService["lastTrade"];
  getPrevClose: PriceService["getPrevClose"];
}

export interface QuoteFeedOptions {
  prices: QuoteFeedPrices;
  subscriptions: MarketSubscriptions;
  throttle: QuoteThrottle;
  log: (message: string) => void;
}

export interface QuoteFeed {
  sendSnapshot: (socket: object, symbol: string) => Promise<void>;
  stop: () => void;
}

interface CachedPrevClose {
  dayMs: number;
  value: Promise<Decimal | null>;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The previous close is the same for every trade of a symbol within one trading day, so it is
 * cached as the pending promise: concurrent trades share one database read instead of one per tick.
 */
export function createQuoteFeed(options: QuoteFeedOptions): QuoteFeed {
  const { prices, subscriptions, throttle, log } = options;
  const prevCloses = new Map<string, CachedPrevClose>();

  async function prevCloseFor(symbol: string, at: Date): Promise<Decimal | null> {
    const dayMs = bucketStartMs(at.getTime(), "1D");
    const cached = prevCloses.get(symbol);

    if (cached !== undefined && cached.dayMs === dayMs) return await cached.value;

    const value = prices.getPrevClose(symbol, at).catch((error: unknown) => {
      log(`Reading the previous close of ${symbol} failed: ${describe(error)}`);
      prevCloses.delete(symbol);
      return null;
    });

    prevCloses.set(symbol, { dayMs, value });

    return await value;
  }

  async function deliver(trade: Trade, sockets: object[]): Promise<void> {
    if (sockets.length === 0) return;

    const message = quoteMessage(trade, await prevCloseFor(trade.symbol, trade.at));

    for (const socket of sockets) throttle.push(socket, trade.symbol, message);
  }

  const release = prices.onTrade((trade) => {
    void deliver(trade, subscriptions.quoteSockets(trade.symbol));
  });

  return {
    async sendSnapshot(socket: object, symbol: string): Promise<void> {
      const trade = prices.lastTrade(symbol);
      if (trade === undefined) return;

      await deliver(trade, [socket]);
    },

    stop: release,
  };
}
