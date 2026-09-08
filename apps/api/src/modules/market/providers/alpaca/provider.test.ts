import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

import type { ProviderSocket, ProviderSocketFactory, SocketTimers } from "../reconnecting-socket.js";
import type { Trade } from "../types.js";
import type { FetchLike, HttpResponse } from "./client.js";
import { createAlpacaProvider } from "./provider.js";

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

  handshake(): void {
    this.readyState = OPEN;
    this.onopen?.();
    this.deliver(readFixture("stream-connected.json"));
    this.deliver(readFixture("stream-authenticated.json"));
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

function createFakeFetch(bodies: string[]): { fetchImpl: FetchLike; urls: string[] } {
  const urls: string[] = [];
  let index = 0;

  const fetchImpl: FetchLike = async (url) => {
    urls.push(url);

    const body = bodies[index];
    index += 1;

    if (body === undefined) throw new Error(`Unexpected request to ${url}`);

    const response: HttpResponse = { ok: true, status: 200, text: () => Promise.resolve(body) };

    return response;
  };

  return { fetchImpl, urls };
}

function createProvider(bodies: string[] = []) {
  const fake = createFakeFetch(bodies);

  return {
    urls: fake.urls,
    provider: createAlpacaProvider({
      key: KEY,
      secret: SECRET,
      feed: "iex",
      fetchImpl: fake.fetchImpl,
      WebSocketImpl: SocketImpl,
      timers: noopTimers,
    }),
  };
}

beforeEach(() => {
  FakeSocket.reset();
});

describe("createAlpacaProvider", () => {
  it("declares its name and capabilities", () => {
    const { provider } = createProvider();

    expect(provider.name).toBe("alpaca");
    expect([...provider.capabilities].sort()).toEqual(["bars", "search", "stream"]);
  });

  it("returns null for the capabilities it does not declare", async () => {
    const { provider } = createProvider();

    await expect(provider.getProfile("AAPL")).resolves.toBeNull();
    await expect(provider.getQuote("AAPL")).resolves.toBeNull();
  });

  it("lists tradable assets", async () => {
    const { provider } = createProvider([readFixture("assets.json")]);

    const assets = await provider.listAssets();

    expect(assets.map((asset) => asset.symbol)).toEqual(["AAPL", "MSFT", "BRK.A", "TSLA"]);
  });

  it("loads bars through the data API", async () => {
    const { provider } = createProvider([readFixture("bars-page-2.json")]);

    const bars = await provider.getBars({
      symbol: "AAPL",
      timeframe: "1m",
      end: new Date("2026-09-08T14:00:00.000Z"),
      limit: 1,
      start: new Date("2026-09-08T13:00:00.000Z"),
    });

    expect(bars.map((bar) => bar.close.toString())).toEqual(["182.85"]);
  });

  it("subscribes the requested symbols on the stream", async () => {
    const { provider } = createProvider();

    await provider.start();
    await provider.subscribeTrades(["AAPL"]);
    FakeSocket.last().handshake();

    expect(FakeSocket.last().frames()).toEqual([
      { action: "auth", key: KEY, secret: SECRET },
      { action: "subscribe", trades: ["AAPL"] },
    ]);

    await provider.unsubscribeTrades(["AAPL"]);

    expect(FakeSocket.last().frames().at(-1)).toEqual({ action: "unsubscribe", trades: ["AAPL"] });
  });

  it("delivers trades to registered handlers until they unsubscribe", async () => {
    const { provider } = createProvider();
    const received: Trade[] = [];

    await provider.start();
    await provider.subscribeTrades(["AAPL", "MSFT"]);
    FakeSocket.last().handshake();

    const off = provider.onTrade((incoming) => received.push(incoming));

    FakeSocket.last().deliver(readFixture("stream-trades.json"));

    expect(received.map((incoming) => incoming.symbol)).toEqual(["AAPL", "MSFT"]);

    off();
    FakeSocket.last().deliver(readFixture("stream-trades.json"));

    expect(received).toHaveLength(2);
  });

  it("closes the stream on stop", async () => {
    const { provider } = createProvider();

    await provider.start();
    FakeSocket.last().handshake();
    await provider.stop();

    expect(FakeSocket.last().closeCalls).toBe(1);
  });
});
