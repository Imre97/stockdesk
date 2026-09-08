import { beforeEach, describe, expect, it, vi } from "vitest";

import { createWsClient, type WsTimers } from "./ws";

interface PendingTimer {
  handler: () => void;
  delay: number;
}

class FakeSocket {
  static instances: FakeSocket[] = [];

  readonly url: string;
  readonly sent: string[] = [];
  closedByClient = false;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closedByClient = true;
    this.dropped();
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  emit(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  emitRaw(data: string): void {
    this.onmessage?.({ data });
  }

  dropped(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

const ACCOUNT_DTO = {
  id: "acc-1",
  name: "Main",
  cash: "100000.00",
  positionsValue: "0.00",
  equity: "100000.00",
  unrealizedPnl: "0.00",
  unrealizedPnlPct: "0.00",
  dailyPnl: "0.00",
  dailyPnlPct: "0.00",
  createdAt: "2026-09-08T10:00:00.000Z",
};

function fakeTimers(): { timers: WsTimers; pending: PendingTimer[] } {
  const pending: PendingTimer[] = [];

  const timers: WsTimers = {
    setTimeout: (handler, delay) => {
      pending.push({ handler, delay });
      return pending.length;
    },
    clearTimeout: (id) => {
      const entry = pending[id - 1];
      if (entry !== undefined) entry.handler = () => undefined;
    },
  };

  return { timers, pending };
}

function last(): FakeSocket {
  const socket = FakeSocket.instances[FakeSocket.instances.length - 1];
  if (socket === undefined) throw new Error("no socket was created");
  return socket;
}

beforeEach(() => {
  FakeSocket.instances = [];
});

describe("createWsClient", () => {
  it("resolves a relative path against the page origin", () => {
    const client = createWsClient({
      url: "/ws",
      getAccessToken: () => "token-1",
      onMessage: vi.fn(),
      WebSocketImpl: FakeSocket,
    });

    client.connect();

    expect(last().url).toMatch(/^ws:\/\/[^/]+\/ws$/);
    client.disconnect();
  });

  it("sends the auth handshake with the current token when the socket opens", () => {
    const client = createWsClient({
      url: "/ws",
      getAccessToken: () => "token-1",
      onMessage: vi.fn(),
      WebSocketImpl: FakeSocket,
    });

    client.connect();
    last().open();

    expect(last().sent).toEqual([JSON.stringify({ type: "auth", token: "token-1" })]);
    client.disconnect();
  });

  it("dispatches a parsed account_summary message", () => {
    const onMessage = vi.fn();
    const client = createWsClient({
      url: "/ws",
      getAccessToken: () => "token-1",
      onMessage,
      WebSocketImpl: FakeSocket,
    });

    client.connect();
    last().open();
    last().emit({ type: "auth_ok", userId: "user-1" });
    last().emit({ type: "account_summary", accounts: [ACCOUNT_DTO] });

    expect(onMessage).toHaveBeenCalledWith({ type: "account_summary", accounts: [ACCOUNT_DTO] });
    client.disconnect();
  });

  it("ignores payloads that do not match the server message schema", () => {
    const onMessage = vi.fn();
    const client = createWsClient({
      url: "/ws",
      getAccessToken: () => "token-1",
      onMessage,
      WebSocketImpl: FakeSocket,
    });

    client.connect();
    last().open();
    last().emitRaw("not json");
    last().emit({ type: "unknown_message" });

    expect(onMessage).not.toHaveBeenCalled();
    client.disconnect();
  });

  it("reconnects with an exponential backoff capped at 30 seconds", () => {
    const { timers, pending } = fakeTimers();
    const client = createWsClient({
      url: "/ws",
      getAccessToken: () => "token-1",
      onMessage: vi.fn(),
      WebSocketImpl: FakeSocket,
      timers,
    });

    client.connect();

    for (let attempt = 0; attempt < 7; attempt += 1) {
      last().dropped();
      const timer = pending[pending.length - 1];
      if (timer === undefined) throw new Error("no reconnect scheduled");
      timer.handler();
    }

    expect(pending.map((timer) => timer.delay)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    client.disconnect();
  });

  it("resets the backoff after a successful handshake", () => {
    const { timers, pending } = fakeTimers();
    const client = createWsClient({
      url: "/ws",
      getAccessToken: () => "token-1",
      onMessage: vi.fn(),
      WebSocketImpl: FakeSocket,
      timers,
    });

    client.connect();
    last().dropped();
    pending[0]?.handler();
    last().dropped();
    pending[1]?.handler();

    last().open();
    last().emit({ type: "auth_ok", userId: "user-1" });
    last().dropped();

    expect(pending.map((timer) => timer.delay)).toEqual([1000, 2000, 1000]);
    client.disconnect();
  });

  it("re-authenticates with the token that is current at reconnect time", () => {
    const { timers, pending } = fakeTimers();
    let token = "token-1";
    const client = createWsClient({
      url: "/ws",
      getAccessToken: () => token,
      onMessage: vi.fn(),
      WebSocketImpl: FakeSocket,
      timers,
    });

    client.connect();
    last().open();
    last().dropped();

    token = "token-2";
    pending[0]?.handler();
    last().open();

    expect(last().sent).toEqual([JSON.stringify({ type: "auth", token: "token-2" })]);
    client.disconnect();
  });

  it("does not reconnect after disconnect", () => {
    const { timers, pending } = fakeTimers();
    const client = createWsClient({
      url: "/ws",
      getAccessToken: () => "token-1",
      onMessage: vi.fn(),
      WebSocketImpl: FakeSocket,
      timers,
    });

    client.connect();
    last().open();
    client.disconnect();

    expect(pending).toEqual([]);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
