import type { MarketStatus, ServerMessage } from "@stockdesk/shared";
import type { RawData, WebSocket } from "ws";
import { describe, expect, it, vi } from "vitest";

import type { BarAggregator } from "../modules/market/bar-aggregator.js";
import type { PriceService } from "../modules/market/price-service.js";
import { attachMarketChannels } from "./market-channels.js";
import { createMarketSubscriptions } from "./market-subscriptions.js";
import type { QuoteFeed } from "./quote-feed.js";
import type { QuoteThrottle } from "./quote-throttle.js";

const OPEN_STATUS: MarketStatus = { status: "open", nextOpenAt: null, nextCloseAt: null };
const OPEN_READY_STATE = 1;
const KNOWN = ["TSLA", "AAPL"];
const UNKNOWN = ["XXXX", "YYYY"];
const BATCH_COUNT = 10;

interface FakeSocket {
  socket: WebSocket;
  sent: ServerMessage[];
}

function createFakeSocket(): FakeSocket {
  const sent: ServerMessage[] = [];
  const socket = {
    readyState: OPEN_READY_STATE,
    send: (payload: string) => sent.push(JSON.parse(payload) as ServerMessage),
    on: () => undefined,
  };

  return { socket: socket as unknown as WebSocket, sent };
}

function raw(message: unknown): RawData {
  return Buffer.from(JSON.stringify(message)) as unknown as RawData;
}

function createHarness(active: string[]) {
  const calls: string[][] = [];
  const snapshotBatches: string[][] = [];
  const prices = {
    onStatusChange: () => (): void => undefined,
    getMarketStatus: () => OPEN_STATUS,
    ensureStreaming: async (): Promise<void> => undefined,
    releaseStreaming: async (): Promise<void> => undefined,
  } as unknown as PriceService;

  const aggregator = {
    onBar: () => (): void => undefined,
    trackTimeframe: vi.fn(),
    untrackTimeframe: vi.fn(),
  } as unknown as BarAggregator;

  const channels = attachMarketChannels({
    prices,
    aggregator,
    subscriptions: createMarketSubscriptions(),
    throttle: { drop: vi.fn() } as unknown as QuoteThrottle,
    feed: {
      sendSnapshot: async (): Promise<void> => undefined,
      sendSnapshots: async (_socket: object, batch: string[]): Promise<void> => {
        snapshotBatches.push(batch);
      },
    } as unknown as QuoteFeed,
    activeSymbols: async (symbols: string[]) => {
      calls.push(symbols);

      return symbols.filter((symbol) => active.includes(symbol));
    },
    log: vi.fn(),
  });

  return { channels, calls, snapshotBatches };
}

describe("attachMarketChannels", () => {
  it("looks the subscribed symbols up in one call and reports each unknown one", async () => {
    const { channels, calls } = createHarness(KNOWN);
    const client = createFakeSocket();

    channels.onAuthenticated(client.socket);
    channels.onMessage(
      client.socket,
      raw({ type: "subscribe", channel: "quotes", symbols: [...KNOWN, ...UNKNOWN] }),
    );

    await vi.waitFor(() => {
      expect(calls).toHaveLength(1);
    });

    expect(calls[0]).toEqual([...KNOWN, ...UNKNOWN]);

    const notFound = client.sent.filter(
      (message) => message.type === "error" && message.code === "SYMBOL_NOT_FOUND",
    );

    expect(notFound.map((message) => (message as { symbol?: string }).symbol)).toEqual(UNKNOWN);

    channels.stop();
  });

  it("asks the feed for the snapshots of one subscribe message in a single batch", async () => {
    const wanted = Array.from(
      { length: BATCH_COUNT },
      (_value, index) => `ZZ${String(index + 1).padStart(2, "0")}`,
    );
    const { channels, snapshotBatches } = createHarness(wanted);
    const client = createFakeSocket();

    channels.onAuthenticated(client.socket);
    channels.onMessage(
      client.socket,
      raw({ type: "subscribe", channel: "quotes", symbols: wanted }),
    );

    await vi.waitFor(() => {
      expect(snapshotBatches).toHaveLength(1);
    });

    expect(snapshotBatches[0]).toEqual(wanted);

    channels.stop();
  });
});
