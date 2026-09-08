import type { QuoteMessage } from "@stockdesk/shared";

const MS_PER_SECOND = 1000;

export interface ThrottleTimers {
  setTimeout: (handler: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export const systemThrottleTimers: ThrottleTimers = {
  setTimeout: (handler, delayMs) => {
    const timer = setTimeout(handler, delayMs);
    timer.unref();
    return timer;
  },
  clearTimeout: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

export interface QuoteThrottleOptions {
  perSecond: number;
  timers?: ThrottleTimers | undefined;
  send: (socket: object, message: QuoteMessage) => void;
}

export interface QuoteThrottle {
  push: (socket: object, symbol: string, message: QuoteMessage) => void;
  drop: (socket: object, symbol?: string) => void;
}

interface Window {
  handle: unknown;
  pending: QuoteMessage | null;
}

/**
 * One send window per socket and symbol: the first push of a window goes out at once, every later
 * push replaces the pending message, and the window flushes the newest one when it expires. A
 * client therefore never sees a stale price and never more than `perSecond` messages per symbol.
 */
export function createQuoteThrottle(options: QuoteThrottleOptions): QuoteThrottle {
  const timers = options.timers ?? systemThrottleTimers;
  const windowMs = Math.ceil(MS_PER_SECOND / options.perSecond);
  const windows = new Map<object, Map<string, Window>>();

  function symbolWindows(socket: object): Map<string, Window> {
    const known = windows.get(socket);
    if (known !== undefined) return known;

    const created = new Map<string, Window>();
    windows.set(socket, created);

    return created;
  }

  function openWindow(socket: object, symbol: string, held: Map<string, Window>): Window {
    const window: Window = { handle: null, pending: null };

    window.handle = timers.setTimeout(() => {
      const message = window.pending;

      if (message === null) {
        held.delete(symbol);
        if (held.size === 0) windows.delete(socket);
        return;
      }

      window.pending = null;
      options.send(socket, message);
      openWindow(socket, symbol, held);
    }, windowMs);

    held.set(symbol, window);

    return window;
  }

  return {
    push(socket: object, symbol: string, message: QuoteMessage): void {
      const held = symbolWindows(socket);
      const window = held.get(symbol);

      if (window !== undefined) {
        window.pending = message;
        return;
      }

      openWindow(socket, symbol, held);
      options.send(socket, message);
    },

    drop(socket: object, symbol?: string): void {
      const held = windows.get(socket);
      if (held === undefined) return;

      const dropped = symbol === undefined ? [...held.keys()] : [symbol];

      for (const key of dropped) {
        const window = held.get(key);
        if (window === undefined) continue;

        window.pending = null;
        if (window.handle !== null) timers.clearTimeout(window.handle);
        held.delete(key);
      }

      if (held.size === 0) windows.delete(socket);
    },
  };
}
