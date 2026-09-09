import {
  clientMessageSchema,
  type MarketStatus,
  type MarketStatusMessage,
  type Timeframe,
} from "@stockdesk/shared";
import type { RawData, WebSocket } from "ws";
import type { BarAggregator } from "../modules/market/bar-aggregator.js";
import type { PriceService } from "../modules/market/price-service.js";
import {
  barMessage,
  subscriptionLimitMessage,
  symbolNotFoundMessage,
} from "./market-messages.js";
import type { MarketSubscriptions } from "./market-subscriptions.js";
import type { QuoteFeed } from "./quote-feed.js";
import type { QuoteThrottle } from "./quote-throttle.js";
import { sendMessage } from "./send-message.js";

export interface MarketChannelsOptions {
  prices: PriceService;
  aggregator: BarAggregator;
  subscriptions: MarketSubscriptions;
  throttle: QuoteThrottle;
  feed: QuoteFeed;
  activeSymbols: (symbols: string[]) => Promise<string[]>;
  log: (message: string) => void;
}

export interface MarketChannels {
  onAuthenticated: (socket: WebSocket) => void;
  onMessage: (socket: WebSocket, raw: RawData) => void;
  stop: () => void;
}

function statusMessage(status: MarketStatus): MarketStatusMessage {
  return { type: "market_status", ...status };
}

function normalize(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readJson(raw: RawData): unknown {
  try {
    return JSON.parse(raw.toString());
  } catch {
    return undefined;
  }
}

/**
 * Messages of one socket are handled one after the other: a subscribe and the unsubscribe that
 * follows it touch the same index, and an unordered pair would leave a stream running forever.
 */
export function attachMarketChannels(options: MarketChannelsOptions): MarketChannels {
  const { prices, aggregator, subscriptions, throttle, feed, activeSymbols, log } = options;

  const sockets = new Set<WebSocket>();
  const queues = new WeakMap<WebSocket, Promise<void>>();

  function send(socket: object, message: Parameters<typeof sendMessage>[1]): void {
    sendMessage(socket as WebSocket, message);
  }

  const releaseStatus = prices.onStatusChange((status) => {
    for (const socket of sockets) send(socket, statusMessage(status));
  });

  const releaseBars = aggregator.onBar((update) => {
    const message = barMessage(update);

    for (const socket of subscriptions.barSockets(update.symbol, update.timeframe)) {
      send(socket, message);
    }
  });

  async function knownSymbols(socket: WebSocket, symbols: string[]): Promise<string[]> {
    const wanted = [...new Set(symbols.map(normalize))];
    const active = new Set(await activeSymbols(wanted));

    for (const symbol of wanted) {
      if (!active.has(symbol)) send(socket, symbolNotFoundMessage(symbol));
    }

    return wanted.filter((symbol) => active.has(symbol));
  }

  async function subscribeQuotes(socket: WebSocket, symbols: string[]): Promise<void> {
    const results = subscriptions.subscribeQuotes(socket, await knownSymbols(socket, symbols));

    if (results.some((result) => result.outcome === "limit")) {
      send(socket, subscriptionLimitMessage());
    }

    const added = results.filter((result) => result.outcome === "added");
    const fresh = added.filter((result) => result.first).map((result) => result.symbol);

    if (fresh.length > 0) await prices.ensureStreaming(fresh);

    await feed.sendSnapshots(
      socket,
      added.map((result) => result.symbol),
    );
  }

  async function unsubscribeQuotes(socket: WebSocket, symbols: string[]): Promise<void> {
    const wanted = [...new Set(symbols.map(normalize))];

    for (const symbol of wanted) throttle.drop(socket, symbol);

    const orphaned = subscriptions.unsubscribeQuotes(socket, wanted);

    if (orphaned.length > 0) await prices.releaseStreaming(orphaned);
  }

  async function subscribeBars(
    socket: WebSocket,
    symbol: string,
    timeframe: Timeframe,
  ): Promise<void> {
    const [known] = await knownSymbols(socket, [symbol]);
    if (known === undefined) return;

    const result = subscriptions.subscribeBar(socket, known, timeframe);

    if (result.outcome === "limit") {
      send(socket, subscriptionLimitMessage());
      return;
    }

    if (!result.first) return;

    aggregator.trackTimeframe(known, timeframe);
    await prices.ensureStreaming([known]);
  }

  async function unsubscribeBars(
    socket: WebSocket,
    symbol: string,
    timeframe: Timeframe,
  ): Promise<void> {
    const known = normalize(symbol);
    const result = subscriptions.unsubscribeBar(socket, known, timeframe);

    if (!result.removed || !result.last) return;

    aggregator.untrackTimeframe(known, timeframe);
    await prices.releaseStreaming([known]);
  }

  async function handle(socket: WebSocket, raw: RawData): Promise<void> {
    const parsed = clientMessageSchema.safeParse(readJson(raw));
    if (!parsed.success) return;

    const message = parsed.data;
    if (message.type === "auth") return;

    if (message.type === "subscribe") {
      if (message.channel === "quotes") {
        await subscribeQuotes(socket, message.symbols);
        return;
      }

      await subscribeBars(socket, message.symbol, message.timeframe);
      return;
    }

    if (message.channel === "quotes") {
      await unsubscribeQuotes(socket, message.symbols);
      return;
    }

    await unsubscribeBars(socket, message.symbol, message.timeframe);
  }

  function onClose(socket: WebSocket): void {
    sockets.delete(socket);
    throttle.drop(socket);

    const orphaned = subscriptions.removeSocket(socket);
    const released = [...orphaned.symbols];

    for (const bar of orphaned.bars) {
      aggregator.untrackTimeframe(bar.symbol, bar.timeframe);
      released.push(bar.symbol);
    }

    if (released.length === 0) return;

    prices.releaseStreaming(released).catch((error: unknown) => {
      log(`Releasing the stream of a closed socket failed: ${describe(error)}`);
    });
  }

  return {
    onAuthenticated(socket: WebSocket): void {
      sockets.add(socket);
      send(socket, statusMessage(prices.getMarketStatus()));
      socket.on("close", () => onClose(socket));
    },

    onMessage(socket: WebSocket, raw: RawData): void {
      const queued = (queues.get(socket) ?? Promise.resolve())
        .then(async () => await handle(socket, raw))
        .catch((error: unknown) => {
          log(`Handling a WebSocket message failed: ${describe(error)}`);
        });

      queues.set(socket, queued);
    },

    stop(): void {
      releaseStatus();
      releaseBars();
      sockets.clear();
    },
  };
}
