import { describe, expect, it } from "vitest";
import { startHeartbeat, type HeartbeatSocket, type HeartbeatTimers } from "./heartbeat.js";

const INTERVAL_MS = 30_000;

interface ManualTimers extends HeartbeatTimers {
  tick: () => void;
  installed: () => number;
}

function manualTimers(): ManualTimers {
  const handlers = new Set<() => void>();

  return {
    setInterval: (handler: () => void) => {
      handlers.add(handler);
      return handler;
    },
    clearInterval: (handle: unknown) => {
      handlers.delete(handle as () => void);
    },
    tick: () => {
      for (const handler of [...handlers]) handler();
    },
    installed: () => handlers.size,
  };
}

interface StubSocket extends HeartbeatSocket {
  pings: number;
  terminated: boolean;
  pong: () => void;
}

function stubSocket(): StubSocket {
  const listeners: (() => void)[] = [];

  const socket: StubSocket = {
    pings: 0,
    terminated: false,
    ping: () => {
      socket.pings += 1;
    },
    terminate: () => {
      socket.terminated = true;
    },
    on: (_event: "pong", listener: () => void) => {
      listeners.push(listener);
      return socket;
    },
    pong: () => {
      for (const listener of listeners) listener();
    },
  };

  return socket;
}

describe("websocket heartbeat", () => {
  it("terminates a socket that never answers a ping", () => {
    const timers = manualTimers();
    const socket = stubSocket();
    startHeartbeat({ sockets: () => [socket], intervalMs: INTERVAL_MS, timers });

    timers.tick();

    expect(socket.pings).toBe(1);
    expect(socket.terminated).toBe(false);

    timers.tick();

    expect(socket.terminated).toBe(true);
  });

  it("keeps a socket that answers the ping", () => {
    const timers = manualTimers();
    const socket = stubSocket();
    startHeartbeat({ sockets: () => [socket], intervalMs: INTERVAL_MS, timers });

    timers.tick();
    socket.pong();
    timers.tick();

    expect(socket.terminated).toBe(false);
    expect(socket.pings).toBe(2);
  });

  it("clears the interval on stop", () => {
    const timers = manualTimers();
    const heartbeat = startHeartbeat({ sockets: () => [], intervalMs: INTERVAL_MS, timers });

    expect(timers.installed()).toBe(1);

    heartbeat.stop();

    expect(timers.installed()).toBe(0);
  });
});
