import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createReconnectingSocket,
  systemTimers,
  type ProviderSocket,
  type ProviderSocketFactory,
  type SocketTimers,
} from "./reconnecting-socket.js";

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 3;

class FakeSocket implements ProviderSocket {
  static created: FakeSocket[] = [];

  readyState = CONNECTING;
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

  dropConnection(): void {
    this.readyState = CLOSED;
    this.onclose?.();
  }

  failConnection(): void {
    this.onerror?.();
  }
}

const SocketImpl = FakeSocket as unknown as ProviderSocketFactory;

interface FakeTimers {
  timers: SocketTimers;
  delays: number[];
  pending: () => number;
  runNext: () => void;
}

function createFakeTimers(): FakeTimers {
  const scheduled = new Map<number, () => void>();
  const delays: number[] = [];
  let nextId = 1;

  const timers: SocketTimers = {
    setTimeout: (handler, delayMs) => {
      const id = nextId;
      nextId += 1;
      delays.push(delayMs);
      scheduled.set(id, handler);
      return id;
    },
    clearTimeout: (handle) => {
      scheduled.delete(handle as number);
    },
  };

  return {
    timers,
    delays,
    pending: () => scheduled.size,
    runNext: () => {
      const entry = scheduled.entries().next();

      if (entry.done === true) throw new Error("No timer is pending.");

      scheduled.delete(entry.value[0]);
      entry.value[1]();
    },
  };
}

interface SetupOverrides {
  onOpen?: () => void;
  onMessage?: (data: unknown) => void;
  onClose?: () => void;
}

function setup(overrides: SetupOverrides = {}) {
  const fakeTimers = createFakeTimers();
  const socket = createReconnectingSocket({
    url: "wss://stream.example.test/v2/iex",
    WebSocketImpl: SocketImpl,
    timers: fakeTimers.timers,
    onOpen: overrides.onOpen ?? ((): void => undefined),
    onMessage: overrides.onMessage ?? ((): void => undefined),
    onClose: overrides.onClose ?? ((): void => undefined),
  });

  return { socket, fakeTimers };
}

beforeEach(() => {
  FakeSocket.reset();
});

describe("createReconnectingSocket", () => {
  it("opens the configured url on connect", () => {
    const { socket } = setup();

    socket.connect();

    expect(FakeSocket.created).toHaveLength(1);
    expect(FakeSocket.last().url).toBe("wss://stream.example.test/v2/iex");
  });

  it("reports the open connection and forwards messages", () => {
    const opens: number[] = [];
    const received: unknown[] = [];
    const { socket } = setup({ onOpen: () => opens.push(1), onMessage: (data) => received.push(data) });

    socket.connect();
    FakeSocket.last().acceptConnection();
    FakeSocket.last().deliver('{"T":"success"}');

    expect(opens).toHaveLength(1);
    expect(received).toEqual(['{"T":"success"}']);
  });

  it("sends only while the connection is open", () => {
    const { socket } = setup();

    socket.connect();

    expect(socket.send("early")).toBe(false);

    FakeSocket.last().acceptConnection();

    expect(socket.send("late")).toBe(true);
    expect(FakeSocket.last().sent).toEqual(["late"]);
  });

  it("backs off exponentially from one second to a sixty second cap", () => {
    const { socket, fakeTimers } = setup();

    socket.connect();

    for (let attempt = 0; attempt < 8; attempt += 1) {
      FakeSocket.last().dropConnection();
      fakeTimers.runNext();
    }

    expect(fakeTimers.delays).toEqual([1000, 2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000]);
    expect(FakeSocket.created).toHaveLength(9);
  });

  it("resets the delay after a successful open", () => {
    const { socket, fakeTimers } = setup();

    socket.connect();
    FakeSocket.last().dropConnection();
    fakeTimers.runNext();
    FakeSocket.last().dropConnection();
    fakeTimers.runNext();
    FakeSocket.last().acceptConnection();
    FakeSocket.last().dropConnection();

    expect(fakeTimers.delays).toEqual([1000, 2000, 1000]);
  });

  it("reconnects after a socket error", () => {
    const { socket, fakeTimers } = setup();

    socket.connect();
    FakeSocket.last().failConnection();

    expect(fakeTimers.delays).toEqual([1000]);

    fakeTimers.runNext();

    expect(FakeSocket.created).toHaveLength(2);
  });

  it("schedules one reconnect when an error is followed by a close", () => {
    const { socket, fakeTimers } = setup();

    socket.connect();
    FakeSocket.last().failConnection();
    FakeSocket.last().dropConnection();

    expect(fakeTimers.delays).toEqual([1000]);
    expect(fakeTimers.pending()).toBe(1);
  });

  it("reports the dropped connection once", () => {
    const closes: number[] = [];
    const { socket } = setup({ onClose: () => closes.push(1) });

    socket.connect();
    FakeSocket.last().acceptConnection();
    FakeSocket.last().failConnection();
    FakeSocket.last().dropConnection();

    expect(closes).toHaveLength(1);
  });

  it("never reconnects after close", () => {
    const closes: number[] = [];
    const { socket, fakeTimers } = setup({ onClose: () => closes.push(1) });

    socket.connect();
    FakeSocket.last().acceptConnection();
    socket.close();
    FakeSocket.last().dropConnection();

    expect(FakeSocket.last().closeCalls).toBe(1);
    expect(fakeTimers.delays).toEqual([]);
    expect(fakeTimers.pending()).toBe(0);
    expect(closes).toEqual([]);
    expect(socket.send("after close")).toBe(false);
  });

  it("cancels a pending reconnect on close", () => {
    const { socket, fakeTimers } = setup();

    socket.connect();
    FakeSocket.last().dropConnection();

    expect(fakeTimers.pending()).toBe(1);

    socket.close();

    expect(fakeTimers.pending()).toBe(0);
  });

  it("ignores a second connect while a socket exists", () => {
    const { socket } = setup();

    socket.connect();
    socket.connect();

    expect(FakeSocket.created).toHaveLength(1);
  });

  it("honors custom backoff bounds", () => {
    const fakeTimers = createFakeTimers();
    const socket = createReconnectingSocket({
      url: "wss://stream.example.test/v2/iex",
      WebSocketImpl: SocketImpl,
      timers: fakeTimers.timers,
      onMessage: () => undefined,
      minDelayMs: 250,
      maxDelayMs: 500,
    });

    socket.connect();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      FakeSocket.last().dropConnection();
      fakeTimers.runNext();
    }

    expect(fakeTimers.delays).toEqual([250, 500, 500]);
  });
});

describe("systemTimers", () => {
  it("schedules and cancels real timers", async () => {
    const fired: string[] = [];

    systemTimers.setTimeout(() => fired.push("kept"), 0);
    const cancelled = systemTimers.setTimeout(() => fired.push("cancelled"), 0);
    systemTimers.clearTimeout(cancelled);

    await vi.waitFor(() => expect(fired).toEqual(["kept"]));
  });
});
