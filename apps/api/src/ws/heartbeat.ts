export const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;

export interface HeartbeatSocket {
  ping(): void;
  terminate(): void;
  on(event: "pong", listener: () => void): unknown;
}

export interface HeartbeatTimers {
  setInterval: (handler: () => void, delayMs: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

export const systemHeartbeatTimers: HeartbeatTimers = {
  setInterval: (handler, delayMs) => {
    const timer = setInterval(handler, delayMs);
    timer.unref();
    return timer;
  },
  clearInterval: (handle) => {
    clearInterval(handle as ReturnType<typeof setInterval>);
  },
};

export interface HeartbeatOptions {
  sockets: () => Iterable<HeartbeatSocket>;
  intervalMs?: number | undefined;
  timers?: HeartbeatTimers | undefined;
}

export interface Heartbeat {
  stop: () => void;
}

/**
 * A socket is pinged on the tick that first sees it and terminated on the tick after the one it
 * failed to answer, so a half-open connection leaves the registries within two intervals.
 */
export function startHeartbeat(options: HeartbeatOptions): Heartbeat {
  const timers = options.timers ?? systemHeartbeatTimers;
  const intervalMs = options.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  const alive = new WeakMap<HeartbeatSocket, boolean>();

  function sweep(): void {
    for (const socket of options.sockets()) {
      if (alive.get(socket) === false) {
        socket.terminate();
        continue;
      }

      if (!alive.has(socket)) {
        socket.on("pong", () => alive.set(socket, true));
      }

      alive.set(socket, false);
      socket.ping();
    }
  }

  const handle = timers.setInterval(sweep, intervalMs);

  return {
    stop(): void {
      timers.clearInterval(handle);
    },
  };
}
