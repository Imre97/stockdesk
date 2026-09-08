import { readFileSync } from "node:fs";

import { Decimal } from "@stockdesk/shared";
import { beforeEach, describe, expect, it } from "vitest";

import type {
  ProviderLogger,
  ProviderSocket,
  ProviderSocketFactory,
  SocketTimers,
} from "../reconnecting-socket.js";
import type { Trade } from "../types.js";
import { createAlpacaStream, type AlpacaStream } from "./stream.js";

const KEY = "test-alpaca-key";
const SECRET = "test-alpaca-secret";
const OPEN = 1;
const CLOSED = 3;

function readFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

class FakeSocket implements ProviderSocket {
  static created: FakeSocket[] = [];

  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.created.push(this);
  }

  static reset(): void {
    FakeSocket.created = [];
  }

  static last(): FakeSocket {
    const socket = FakeSocket.created.at(-1);

    if (socket === undefined) throw new Error("No socket was created.");

    return socket;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = CLOSED;
  }

  acceptConnection(): void {
    this.readyState = OPEN;
    this.onopen?.();
  }

  deliver(data: string): void {
    this.onmessage?.({ data });
  }

  dropConnection(): void {
    this.readyState = CLOSED;
    this.onclose?.();
  }

  frames(): unknown[] {
    return this.sent.map((frame) => JSON.parse(frame) as unknown);
  }
}

const SocketImpl = FakeSocket as unknown as ProviderSocketFactory;

function createFakeTimers(): { timers: SocketTimers; runNext: () => void; pending: () => number } {
  const scheduled = new Map<number, () => void>();
  let nextId = 1;

  return {
    timers: {
      setTimeout: (handler) => {
        const id = nextId;
        nextId += 1;
        scheduled.set(id, handler);
        return id;
      },
      clearTimeout: (handle) => {
        scheduled.delete(handle as number);
      },
    },
    pending: () => scheduled.size,
    runNext: () => {
      const entry = scheduled.entries().next();

      if (entry.done === true) throw new Error("No timer is pending.");

      scheduled.delete(entry.value[0]);
      entry.value[1]();
    },
  };
}

function createFakeLogger(): { log: ProviderLogger; messages: string[] } {
  const messages: string[] = [];

  return {
    messages,
    log: {
      info: (message) => messages.push(message),
      warn: (message) => messages.push(message),
      error: (message) => messages.push(message),
    },
  };
}

interface Harness {
  stream: AlpacaStream;
  trades: Trade[];
  runNext: () => void;
  messages: string[];
}

function setup(): Harness {
  const trades: Trade[] = [];
  const fakeTimers = createFakeTimers();
  const logger = createFakeLogger();
  const stream = createAlpacaStream({
    key: KEY,
    secret: SECRET,
    feed: "iex",
    WebSocketImpl: SocketImpl,
    timers: fakeTimers.timers,
    onTrade: (trade) => trades.push(trade),
    log: logger.log,
  });

  return { stream, trades, runNext: fakeTimers.runNext, messages: logger.messages };
}

function completeHandshake(): void {
  FakeSocket.last().acceptConnection();
  FakeSocket.last().deliver(readFixture("stream-connected.json"));
  FakeSocket.last().deliver(readFixture("stream-authenticated.json"));
}

beforeEach(() => {
  FakeSocket.reset();
});

describe("createAlpacaStream", () => {
  it("connects to the configured feed", () => {
    const { stream } = setup();

    stream.start();

    expect(FakeSocket.last().url).toBe("wss://stream.data.alpaca.markets/v2/iex");
  });

  it("authenticates before subscribing", () => {
    const { stream } = setup();

    stream.setSymbols(["AAPL", "MSFT"]);
    stream.start();
    completeHandshake();

    expect(FakeSocket.last().frames()).toEqual([
      { action: "auth", key: KEY, secret: SECRET },
      { action: "subscribe", trades: ["AAPL", "MSFT"] },
    ]);
  });

  it("subscribes to nothing when no symbol was requested", () => {
    const { stream } = setup();

    stream.start();
    completeHandshake();

    expect(FakeSocket.last().frames()).toEqual([{ action: "auth", key: KEY, secret: SECRET }]);
  });

  it("parses trade frames into Decimal prices and sizes", () => {
    const { stream, trades } = setup();

    stream.setSymbols(["AAPL", "MSFT"]);
    stream.start();
    completeHandshake();
    FakeSocket.last().deliver(readFixture("stream-trades.json"));

    expect(trades[0]?.price).toBeInstanceOf(Decimal);
    expect(
      trades.map((trade) => ({
        symbol: trade.symbol,
        price: trade.price.toString(),
        size: trade.size.toString(),
        at: trade.at.toISOString(),
      })),
    ).toEqual([
      {
        symbol: "AAPL",
        price: "182.10000000000000001",
        size: "100",
        at: "2026-09-08T14:30:01.123Z",
      },
      { symbol: "MSFT", price: "418.25", size: "250", at: "2026-09-08T14:30:01.987Z" },
    ]);
  });

  it("logs error frames without emitting a trade", () => {
    const { stream, trades, messages } = setup();

    stream.start();
    completeHandshake();
    FakeSocket.last().deliver(readFixture("stream-error.json"));

    expect(trades).toEqual([]);
    expect(messages.some((message) => message.includes("invalid syntax"))).toBe(true);
  });

  it("ignores frames that are not a message array", () => {
    const { stream, trades } = setup();

    stream.start();
    completeHandshake();
    FakeSocket.last().deliver("not json");
    FakeSocket.last().deliver('{"T":"t"}');

    expect(trades).toEqual([]);
  });

  it("sends the difference when the symbol set changes while streaming", () => {
    const { stream } = setup();

    stream.setSymbols(["AAPL"]);
    stream.start();
    completeHandshake();
    stream.setSymbols(["AAPL", "MSFT"]);
    stream.setSymbols(["MSFT"]);

    expect(FakeSocket.last().frames().slice(2)).toEqual([
      { action: "subscribe", trades: ["MSFT"] },
      { action: "unsubscribe", trades: ["AAPL"] },
    ]);
  });

  it("resubscribes the current set after a reconnect", () => {
    const { stream, runNext } = setup();

    stream.setSymbols(["AAPL"]);
    stream.start();
    completeHandshake();
    stream.setSymbols(["AAPL", "TSLA"]);

    FakeSocket.last().dropConnection();
    runNext();
    completeHandshake();

    expect(FakeSocket.created).toHaveLength(2);
    expect(FakeSocket.last().frames()).toEqual([
      { action: "auth", key: KEY, secret: SECRET },
      { action: "subscribe", trades: ["AAPL", "TSLA"] },
    ]);
  });

  it("stops without reconnecting", () => {
    const { stream, runNext } = setup();

    stream.start();
    completeHandshake();
    stream.stop();
    FakeSocket.last().dropConnection();

    expect(FakeSocket.created).toHaveLength(1);
    expect(() => runNext()).toThrow("No timer is pending.");
  });
});
