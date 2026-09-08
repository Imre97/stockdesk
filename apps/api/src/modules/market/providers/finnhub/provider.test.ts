import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

import type { ProviderSocket, ProviderSocketFactory, SocketTimers } from "../reconnecting-socket.js";
import type { Trade } from "../types.js";
import type { FetchLike, HttpResponse } from "./client.js";
import { createFinnhubProvider } from "./provider.js";

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
  closeCalls = 0;
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
    this.closeCalls += 1;
    this.readyState = CLOSED;
  }

  acceptConnection(): void {
    this.readyState = OPEN;
    this.onopen?.();
  }

  deliver(data: string): void {
    this.onmessage?.({ data });
  }

  frames(): unknown[] {
    return this.sent.map((frame) => JSON.parse(frame) as unknown);
  }
}

const SocketImpl = FakeSocket as unknown as ProviderSocketFactory;

const noopTimers: SocketTimers = {
  setTimeout: () => 0,
  clearTimeout: () => undefined,
};

function createProvider(bodies: string[] = []) {
  let index = 0;

  const fetchImpl: FetchLike = async (url) => {
    const body = bodies[index];
    index += 1;

    if (body === undefined) throw new Error(`Unexpected request to ${url}`);

    const response: HttpResponse = { ok: true, status: 200, text: () => Promise.resolve(body) };

    return response;
  };

  return createFinnhubProvider({ key: KEY, fetchImpl, WebSocketImpl: SocketImpl, timers: noopTimers });
}

beforeEach(() => {
  FakeSocket.reset();
});

describe("createFinnhubProvider", () => {
  it("declares its name and capabilities", () => {
    const provider = createProvider();

    expect(provider.name).toBe("finnhub");
    expect([...provider.capabilities].sort()).toEqual(["profile", "search", "stream"]);
  });

  it("rejects bars and resolves quotes to null", async () => {
    const provider = createProvider();

    await expect(provider.getBars({ symbol: "TSLA", timeframe: "1m", end: new Date(), limit: 1 })).rejects.toThrow(
      /does not support/,
    );
    await expect(provider.getQuote("TSLA")).resolves.toBeNull();
  });

  it("returns the mapped profile", async () => {
    const provider = createProvider([readFixture("profile2.json"), readFixture("metric.json")]);

    const profile = await provider.getProfile("TSLA");

    expect(profile?.marketCap?.toString()).toBe("800123456000");
  });

  it("lists the common stock universe", async () => {
    const provider = createProvider([readFixture("symbols.json")]);

    const assets = await provider.listAssets();

    expect(assets.map((asset) => asset.symbol)).toEqual(["AAPL", "TSLA"]);
  });

  it("subscribes on the stream and delivers trades", async () => {
    const provider = createProvider();
    const received: Trade[] = [];

    await provider.start();
    await provider.subscribeTrades(["AAPL"]);
    FakeSocket.last().acceptConnection();

    expect(FakeSocket.last().frames()).toEqual([{ type: "subscribe", symbol: "AAPL" }]);

    const off = provider.onTrade((trade) => received.push(trade));

    FakeSocket.last().deliver(readFixture("stream-trade.json"));
    off();
    FakeSocket.last().deliver(readFixture("stream-trade.json"));

    expect(received.map((trade) => trade.symbol)).toEqual(["AAPL", "MSFT"]);

    await provider.unsubscribeTrades(["AAPL"]);

    expect(FakeSocket.last().frames().at(-1)).toEqual({ type: "unsubscribe", symbol: "AAPL" });
  });

  it("closes the stream on stop", async () => {
    const provider = createProvider();

    await provider.start();
    FakeSocket.last().acceptConnection();
    await provider.stop();

    expect(FakeSocket.last().closeCalls).toBe(1);
  });
});
