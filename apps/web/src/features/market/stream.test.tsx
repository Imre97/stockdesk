import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { wsSession } from "../../lib/ws-session";
import { useAuthStore } from "../auth/store";
import { useMarketStream } from "./stream";
import { useMarketStore } from "./store";

class FakeSocket {
  static instances: FakeSocket[] = [];

  readonly sent: string[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor() {
    FakeSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  emit(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

const QUOTE = {
  type: "quote",
  symbol: "TSLA",
  price: "251.3400",
  size: "100",
  at: "2026-09-08T14:30:01.123Z",
  prevClose: "248.9000",
};

const BAR = {
  type: "bar",
  symbol: "TSLA",
  timeframe: "1m",
  bar: {
    time: "2026-09-08T14:30:00.000Z",
    open: "251.10",
    high: "251.40",
    low: "251.05",
    close: "251.34",
    volume: "1200",
  },
  isFinal: false,
};

const MARKET_STATUS = {
  type: "market_status",
  status: "open",
  nextOpenAt: null,
  nextCloseAt: "2026-09-08T20:00:00.000Z",
};

const nativeWebSocket = globalThis.WebSocket;

function lastSocket(): FakeSocket {
  const socket = FakeSocket.instances[FakeSocket.instances.length - 1];
  if (socket === undefined) throw new Error("no socket was created");
  return socket;
}

function handshake(): FakeSocket {
  const socket = lastSocket();
  socket.open();
  socket.emit({ type: "auth_ok", userId: "user-1" });
  return socket;
}

beforeEach(() => {
  FakeSocket.instances = [];
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  useAuthStore.setState({ user: null, accessToken: "token-1", status: "authenticated" });
  useMarketStore.getState().reset();
});

afterEach(() => {
  wsSession.disconnect();
  globalThis.WebSocket = nativeWebSocket;
});

describe("useMarketStream", () => {
  it("routes quote, bar and market status messages into the market store", () => {
    const { unmount } = renderHook(() => useMarketStream());
    const socket = handshake();

    socket.emit(QUOTE);
    socket.emit(BAR);
    socket.emit(MARKET_STATUS);

    expect(useMarketStore.getState().quotes.TSLA?.price.toString()).toBe("251.34");
    expect(useMarketStore.getState().bars["TSLA:1m"]).toHaveLength(1);
    expect(useMarketStore.getState().marketStatus?.status).toBe("open");

    unmount();
  });

  it("ignores messages of other channels", () => {
    const { unmount } = renderHook(() => useMarketStream());
    const socket = handshake();

    socket.emit({ type: "account_summary", accounts: [] });

    expect(useMarketStore.getState().quotes).toEqual({});

    unmount();
  });

  it("stops applying messages after unmount", () => {
    const { unmount } = renderHook(() => useMarketStream());
    const socket = handshake();

    unmount();
    socket.emit(QUOTE);

    expect(useMarketStore.getState().quotes).toEqual({});
  });
});
