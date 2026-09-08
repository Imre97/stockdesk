import { Decimal } from "@stockdesk/shared";

import type {
  AssetRecord,
  Bar,
  BarsQuery,
  MarketDataProvider,
  Quote,
  SymbolProfile,
  Trade,
  TradeHandler,
} from "../types.js";
import { CAPABILITIES } from "../types.js";
import { buildBars } from "./bars.js";
import { minuteRefOf, type MinuteRef } from "./buckets.js";
import type { RandomStream } from "./prng.js";
import { createStream } from "./prng.js";
import { buildProfile, buildQuote } from "./quotes.js";
import type { SimulatedAsset } from "./universe.js";
import { findSimulatedAsset, SIMULATED_UNIVERSE } from "./universe.js";
import { createPriceWalk } from "./walk.js";

export const DEFAULT_SIMULATED_SEED = 20260908;

const MAX_TRADE_SIZE = 500;

export interface SimulatedProviderOptions {
  seed?: number;
  now?: () => Date;
  tickIntervalMs?: number;
}

export interface SimulatedProvider extends MarketDataProvider {
  emitTick(): Trade[];
}

interface TickStream {
  key: string;
  stream: RandomStream;
}

export function createSimulatedProvider(options: SimulatedProviderOptions = {}): SimulatedProvider {
  const seed = options.seed ?? DEFAULT_SIMULATED_SEED;
  const now = options.now ?? (() => new Date());
  const walk = createPriceWalk({ seed });
  const subscribed = new Set<string>();
  const handlers = new Set<TradeHandler>();
  const lastTrades = new Map<string, Trade>();
  const tickStreams = new Map<string, TickStream>();
  let timer: NodeJS.Timeout | undefined;

  function tickStreamFor(symbol: string, minute: MinuteRef): RandomStream {
    const key = `${minute.dayIndex}:${minute.minuteOfDay}`;
    const current = tickStreams.get(symbol);
    if (current !== undefined && current.key === key) return current.stream;
    const stream = createStream(seed, symbol, "tick", minute.dayIndex, minute.minuteOfDay);
    tickStreams.set(symbol, { key, stream });
    return stream;
  }

  function nextTrade(asset: SimulatedAsset, at: Date): Trade {
    const minute = minuteRefOf(at);
    const stream = tickStreamFor(asset.symbol, minute);
    const price = walk.tickPrice(asset, minute.dayIndex, minute.minuteOfDay, stream.nextNormal());
    const size = new Decimal(1 + Math.floor(stream.next() * MAX_TRADE_SIZE));
    return { symbol: asset.symbol, price, size, at };
  }

  function emitTick(): Trade[] {
    const at = now();
    const trades: Trade[] = [];
    for (const symbol of subscribed) {
      const asset = findSimulatedAsset(symbol);
      if (asset === undefined) continue;
      const trade = nextTrade(asset, at);
      lastTrades.set(asset.symbol, trade);
      trades.push(trade);
    }
    for (const trade of trades) {
      for (const handler of handlers) handler(trade);
    }
    return trades;
  }

  return {
    name: "simulated",
    capabilities: new Set(CAPABILITIES),
    emitTick,

    async start(): Promise<void> {
      if (options.tickIntervalMs === undefined || timer !== undefined) return;
      timer = setInterval(emitTick, options.tickIntervalMs);
      timer.unref();
    },

    async stop(): Promise<void> {
      if (timer === undefined) return;
      clearInterval(timer);
      timer = undefined;
    },

    async subscribeTrades(symbols: string[]): Promise<void> {
      for (const symbol of symbols) {
        const asset = findSimulatedAsset(symbol);
        if (asset !== undefined) subscribed.add(asset.symbol);
      }
    },

    async unsubscribeTrades(symbols: string[]): Promise<void> {
      for (const symbol of symbols) subscribed.delete(symbol.trim().toUpperCase());
    },

    onTrade(handler: TradeHandler): () => void {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },

    async getBars(query: BarsQuery): Promise<Bar[]> {
      const asset = findSimulatedAsset(query.symbol);
      if (asset === undefined) return [];
      return buildBars(walk, asset, query, now());
    },

    async listAssets(): Promise<AssetRecord[]> {
      return SIMULATED_UNIVERSE.map((asset) => ({
        symbol: asset.symbol,
        name: asset.name,
        exchange: asset.exchange,
        shortable: asset.shortable,
        fractionable: asset.fractionable,
      }));
    },

    async getProfile(symbol: string): Promise<SymbolProfile | null> {
      const asset = findSimulatedAsset(symbol);
      if (asset === undefined) return null;
      return buildProfile(walk, asset, now());
    },

    async getQuote(symbol: string): Promise<Quote | null> {
      const asset = findSimulatedAsset(symbol);
      if (asset === undefined) return null;
      return buildQuote(walk, asset, lastTrades.get(asset.symbol), now());
    },
  };
}
