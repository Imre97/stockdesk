import { readFileSync } from "node:fs";

import { Decimal } from "@stockdesk/shared";
import { beforeEach, describe, expect, it } from "vitest";

import type { ProviderSocket, ProviderSocketFactory, SocketTimers } from "../reconnecting-socket.js";
import type { Trade } from "../types.js";
import { createFinnhubStream, type FinnhubStream } from "./stream.js";

const KEY = "test-finnhub-key";
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

interface Harness {
  stream: FinnhubStream;
  trades: Trade[];
  runNext: () => void;
}

function setup(): Harness {
  const trades: Trade[] = [];
  const scheduled = new Map<number, () => void>();
  let nextId = 1;

  const timers: SocketTimers = {
    setTimeout: (handler) => {
      const id = nextId;
      nextId += 1;
      scheduled.set(id, handler);
      return id;
    },
    clearTimeout: (handle) => {
      scheduled.delete(handle as number);
    },
  };

  const stream = createFinnhubStream({
    key: KEY,
    WebSocketImpl: SocketImpl,
    timers,
    onTrade: (trade) => trades.push(trade),
  });

  return {
    stream,
    trades,
    runNext: () => {
      const entry = scheduled.entries().next();

      if (entry.done === true) throw new Error("No timer is pending.");

      scheduled.delete(entry.value[0]);
      entry.value[1]();
    },
  };
}

beforeEach(() => {
  FakeSocket.reset();
});

describe("createFinnhubStream", () => {
  it("connects with the token in the url", () => {
    const { stream } = setup();

    stream.start();

    expect(FakeSocket.last().url).toBe("wss://ws.finnhub.io?token=test-finnhub-key");
  });

  it("subscribes to every symbol once the connection is open", () => {
    const { stream } = setup();

    stream.setSymbols(["AAPL", "MSFT"]);
    stream.start();
    FakeSocket.last().acceptConnection();

    expect(FakeSocket.last().frames()).toEqual([
      { type: "subscribe", symbol: "AAPL" },
      { type: "subscribe", symbol: "MSFT" },
    ]);
  });

  it("subscribes and unsubscribes the difference while connected", () => {
    const { stream } = setup();

    stream.setSymbols(["AAPL"]);
    stream.start();
    FakeSocket.last().acceptConnection();
    stream.setSymbols(["MSFT"]);

    expect(FakeSocket.last().frames().slice(1)).toEqual([
      { type: "subscribe", symbol: "MSFT" },
      { type: "unsubscribe", symbol: "AAPL" },
    ]);
  });

  it("parses trade frames into Decimal prices and sizes", () => {
    const { stream, trades } = setup();

    stream.start();
    FakeSocket.last().acceptConnection();
    FakeSocket.last().deliver(readFixture("stream-trade.json"));

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
      { symbol: "MSFT", price: "418.25", size: "250", at: "2026-09-08T14:30:02.456Z" },
    ]);
  });

  it("ignores ping frames and invalid payloads", () => {
    const { stream, trades } = setup();

    stream.start();
    FakeSocket.last().acceptConnection();
    FakeSocket.last().deliver(readFixture("stream-ping.json"));
    FakeSocket.last().deliver("not json");
    FakeSocket.last().deliver('{"type":"trade"}');

    expect(trades).toEqual([]);
  });

  it("resubscribes the current set after a reconnect", () => {
    const { stream, runNext } = setup();

    stream.setSymbols(["AAPL"]);
    stream.start();
    FakeSocket.last().acceptConnection();
    stream.setSymbols(["AAPL", "TSLA"]);

    FakeSocket.last().dropConnection();
    runNext();
    FakeSocket.last().acceptConnection();

    expect(FakeSocket.created).toHaveLength(2);
    expect(FakeSocket.last().frames()).toEqual([
      { type: "subscribe", symbol: "AAPL" },
      { type: "subscribe", symbol: "TSLA" },
    ]);
  });

  it("stops without reconnecting", () => {
    const { stream, runNext } = setup();

    stream.start();
    FakeSocket.last().acceptConnection();
    stream.stop();
    FakeSocket.last().dropConnection();

    expect(FakeSocket.created).toHaveLength(1);
    expect(() => runNext()).toThrow("No timer is pending.");
  });
});
