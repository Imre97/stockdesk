export const DEFAULT_MIN_RECONNECT_DELAY_MS = 1000;
export const DEFAULT_MAX_RECONNECT_DELAY_MS = 60_000;

const BACKOFF_FACTOR = 2;
const OPEN_STATE = 1;
const CLOSED_STATE = 3;

export interface ProviderSocket {
  readyState: number;
  send: (data: string) => void;
  close: () => void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
}

export type ProviderSocketFactory = new (url: string) => ProviderSocket;

export type TimerHandle = unknown;

export interface SocketTimers {
  setTimeout: (handler: () => void, delayMs: number) => TimerHandle;
  clearTimeout: (handle: TimerHandle) => void;
}

export interface ProviderLogger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

export interface ReconnectingSocketOptions {
  url: string;
  WebSocketImpl: ProviderSocketFactory;
  timers: SocketTimers;
  onMessage: (data: unknown) => void;
  onOpen?: () => void;
  onClose?: () => void;
  log?: ProviderLogger;
  minDelayMs?: number;
  maxDelayMs?: number;
}

export interface ReconnectingSocket {
  connect: () => void;
  send: (text: string) => boolean;
  close: () => void;
}

export const systemTimers: SocketTimers = {
  setTimeout: (handler, delayMs) => setTimeout(handler, delayMs),
  clearTimeout: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

export function backoffDelay(attempt: number, minDelayMs: number, maxDelayMs: number): number {
  const delay = minDelayMs * BACKOFF_FACTOR ** attempt;

  return delay > maxDelayMs ? maxDelayMs : delay;
}

export function createReconnectingSocket(options: ReconnectingSocketOptions): ReconnectingSocket {
  const minDelayMs = options.minDelayMs ?? DEFAULT_MIN_RECONNECT_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS;

  let socket: ProviderSocket | null = null;
  let reconnectHandle: TimerHandle = null;
  let attempt = 0;
  let stopped = true;

  function detach(current: ProviderSocket): void {
    current.onopen = null;
    current.onclose = null;
    current.onerror = null;
    current.onmessage = null;
  }

  function clearReconnect(): void {
    if (reconnectHandle === null) return;

    options.timers.clearTimeout(reconnectHandle);
    reconnectHandle = null;
  }

  function scheduleReconnect(): void {
    if (stopped || reconnectHandle !== null) return;

    const delayMs = backoffDelay(attempt, minDelayMs, maxDelayMs);
    attempt += 1;
    options.log?.warn(`Provider socket closed. Reconnecting in ${delayMs} ms.`);
    reconnectHandle = options.timers.setTimeout(() => {
      reconnectHandle = null;
      open();
    }, delayMs);
  }

  function handleFailure(current: ProviderSocket): void {
    if (socket !== current) return;

    detach(current);
    socket = null;
    options.onClose?.();
    scheduleReconnect();
  }

  function open(): void {
    const current = new options.WebSocketImpl(options.url);
    socket = current;

    current.onopen = () => {
      attempt = 0;
      options.onOpen?.();
    };
    current.onmessage = (event) => options.onMessage(event.data);
    current.onerror = () => handleFailure(current);
    current.onclose = () => handleFailure(current);
  }

  return {
    connect: () => {
      if (!stopped) return;

      stopped = false;
      attempt = 0;
      open();
    },

    send: (text) => {
      const current = socket;

      if (current === null || current.readyState !== OPEN_STATE) return false;

      current.send(text);

      return true;
    },

    close: () => {
      stopped = true;
      clearReconnect();

      const current = socket;
      socket = null;

      if (current === null) return;

      detach(current);

      if (current.readyState !== CLOSED_STATE) current.close();
    },
  };
}
