import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ClientMessage } from "@stockdesk/shared";

import { createWsSession } from "./ws-session";

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

const AUTH_OK = { type: "auth_ok", userId: "user-1" } as const;
const ACCOUNT_SUMMARY = { type: "account_summary", accounts: [ACCOUNT_DTO] } as const;
const QUEUED_MESSAGE = { type: "auth", token: "queued-token" } as const;
const SUBSCRIBE_QUOTES: ClientMessage = { type: "subscribe", channel: "quotes", symbols: ["TSLA"] };
const UNSUBSCRIBE_QUOTES: ClientMessage = { type: "unsubscribe", channel: "quotes", symbols: ["TSLA"] };
const QUOTES_KEY = "quotes:TSLA";

function session() {
  return createWsSession({
    url: "/ws",
    getAccessToken: () => "token-1",
    WebSocketImpl: FakeSocket,
    timers: { setTimeout: () => 1, clearTimeout: () => undefined },
  });
}

function framesOf(socket: FakeSocket, message: unknown): string[] {
  return socket.sent.filter((frame) => frame === JSON.stringify(message));
}

function last(): FakeSocket {
  const socket = FakeSocket.instances[FakeSocket.instances.length - 1];
  if (socket === undefined) throw new Error("no socket was created");
  return socket;
}

beforeEach(() => {
  FakeSocket.instances = [];
});

describe("createWsSession", () => {
  it("opens a single socket for repeated connect calls", () => {
    const ws = session();

    ws.connect();
    ws.connect();

    expect(FakeSocket.instances).toHaveLength(1);
    ws.disconnect();
  });

  it("delivers parsed server messages to a listener until it unsubscribes", () => {
    const ws = session();
    const listener = vi.fn();
    const unsubscribe = ws.addMessageListener(listener);

    ws.connect();
    last().open();
    last().emit(AUTH_OK);
    last().emit(ACCOUNT_SUMMARY);

    expect(listener).toHaveBeenCalledWith(ACCOUNT_SUMMARY);

    unsubscribe();
    last().emit(ACCOUNT_SUMMARY);

    expect(listener).toHaveBeenCalledTimes(2);
    ws.disconnect();
  });

  it("queues a message sent before the handshake and flushes it after auth_ok", () => {
    const ws = session();

    ws.connect();
    last().open();
    ws.send(QUEUED_MESSAGE);

    expect(last().sent).toEqual([JSON.stringify({ type: "auth", token: "token-1" })]);

    last().emit(AUTH_OK);

    expect(last().sent).toEqual([
      JSON.stringify({ type: "auth", token: "token-1" }),
      JSON.stringify(QUEUED_MESSAGE),
    ]);
    ws.disconnect();
  });

  it("sends immediately once the handshake succeeded", () => {
    const ws = session();

    ws.connect();
    last().open();
    last().emit(AUTH_OK);
    ws.send(QUEUED_MESSAGE);

    expect(last().sent).toEqual([
      JSON.stringify({ type: "auth", token: "token-1" }),
      JSON.stringify(QUEUED_MESSAGE),
    ]);
    ws.disconnect();
  });

  it("closes the socket on disconnect and stops delivering to listeners", () => {
    const ws = session();
    const listener = vi.fn();
    ws.addMessageListener(listener);

    ws.connect();
    last().open();
    last().emit(AUTH_OK);

    const socket = last();
    ws.disconnect();

    expect(socket.closedByClient).toBe(true);

    socket.emit(ACCOUNT_SUMMARY);

    expect(listener).not.toHaveBeenCalledWith(ACCOUNT_SUMMARY);
  });

  it("opens a fresh socket after a disconnect", () => {
    const ws = session();

    ws.connect();
    last().open();
    ws.disconnect();
    ws.connect();

    expect(FakeSocket.instances).toHaveLength(2);
    ws.disconnect();
  });
});

describe("createWsSession subscriptions", () => {
  it("sends one subscribe frame when two callers subscribe to the same key", () => {
    const ws = session();

    ws.connect();
    last().open();
    last().emit(AUTH_OK);

    ws.subscribe(QUOTES_KEY, SUBSCRIBE_QUOTES, UNSUBSCRIBE_QUOTES);
    ws.subscribe(QUOTES_KEY, SUBSCRIBE_QUOTES, UNSUBSCRIBE_QUOTES);

    expect(framesOf(last(), SUBSCRIBE_QUOTES)).toHaveLength(1);

    ws.disconnect();
  });

  it("unsubscribes only after the last holder released the key", () => {
    const ws = session();

    ws.connect();
    last().open();
    last().emit(AUTH_OK);

    const releaseFirst = ws.subscribe(QUOTES_KEY, SUBSCRIBE_QUOTES, UNSUBSCRIBE_QUOTES);
    const releaseSecond = ws.subscribe(QUOTES_KEY, SUBSCRIBE_QUOTES, UNSUBSCRIBE_QUOTES);

    releaseFirst();

    expect(framesOf(last(), UNSUBSCRIBE_QUOTES)).toHaveLength(0);

    releaseSecond();

    expect(framesOf(last(), UNSUBSCRIBE_QUOTES)).toHaveLength(1);

    releaseSecond();

    expect(framesOf(last(), UNSUBSCRIBE_QUOTES)).toHaveLength(1);

    ws.disconnect();
  });

  it("sends every active subscription again after a later auth_ok", () => {
    const ws = session();

    ws.connect();
    last().open();
    last().emit(AUTH_OK);
    ws.subscribe(QUOTES_KEY, SUBSCRIBE_QUOTES, UNSUBSCRIBE_QUOTES);

    expect(framesOf(last(), SUBSCRIBE_QUOTES)).toHaveLength(1);

    last().emit(AUTH_OK);

    expect(framesOf(last(), SUBSCRIBE_QUOTES)).toHaveLength(2);

    ws.disconnect();
  });

  it("delivers a subscription taken before the handshake once the handshake succeeds", () => {
    const ws = session();

    ws.connect();
    last().open();
    ws.subscribe(QUOTES_KEY, SUBSCRIBE_QUOTES, UNSUBSCRIBE_QUOTES);

    expect(framesOf(last(), SUBSCRIBE_QUOTES)).toHaveLength(0);

    last().emit(AUTH_OK);

    expect(framesOf(last(), SUBSCRIBE_QUOTES)).toHaveLength(1);

    ws.disconnect();
  });

  it("clears the subscription table on disconnect", () => {
    const ws = session();

    ws.connect();
    last().open();
    last().emit(AUTH_OK);
    ws.subscribe(QUOTES_KEY, SUBSCRIBE_QUOTES, UNSUBSCRIBE_QUOTES);
    ws.disconnect();

    ws.connect();
    last().open();
    last().emit(AUTH_OK);

    expect(framesOf(last(), SUBSCRIBE_QUOTES)).toHaveLength(0);

    ws.disconnect();
  });
});
