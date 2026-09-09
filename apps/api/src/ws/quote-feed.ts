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
  getPrevCloses: PriceService["getPrevCloses"];
}

export interface QuoteFeedOptions {
  prices: QuoteFeedPrices;
  subscriptions: MarketSubscriptions;
  throttle: QuoteThrottle;
  log: (message: string) => void;
}

export interface QuoteFeed {
  sendSnapshot: (socket: object, symbol: string) => Promise<void>;
  sendSnapshots: (socket: object, symbols: string[]) => Promise<void>;
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

  /**
   * One subscribe message must not turn into one previous-close query per symbol (TD-67), so the
   * pending promise of the whole batch is written into the same per-symbol cache the tick path
   * reads: the snapshots that follow answer from it.
   */
  function primePrevCloses(symbols: string[], at: Date): void {
    const dayMs = bucketStartMs(at.getTime(), "1D");
    const missing = symbols.filter((symbol) => prevCloses.get(symbol)?.dayMs !== dayMs);

    if (missing.length === 0) return;

    const batch = prices.getPrevCloses(missing, at).catch((error: unknown) => {
      log(`Reading the previous closes of a subscribe batch failed: ${describe(error)}`);

      for (const symbol of missing) prevCloses.delete(symbol);

      return new Map<string, Decimal | null>();
    });

    for (const symbol of missing) {
      prevCloses.set(symbol, { dayMs, value: batch.then((closes) => closes.get(symbol) ?? null) });
    }
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

    async sendSnapshots(socket: object, symbols: string[]): Promise<void> {
      const trades = symbols
        .map((symbol) => prices.lastTrade(symbol))
        .filter((trade): trade is Trade => trade !== undefined);

      const byDay = new Map<number, Trade[]>();

      for (const trade of trades) {
        const dayMs = bucketStartMs(trade.at.getTime(), "1D");
        const owned = byDay.get(dayMs) ?? [];
        owned.push(trade);
        byDay.set(dayMs, owned);
      }

      for (const group of byDay.values()) {
        const first = group[0];
        if (first === undefined) continue;

        primePrevCloses(
          group.map((trade) => trade.symbol),
          first.at,
        );
      }

      for (const trade of trades) await deliver(trade, [socket]);
    },

    stop: release,
  };
}
