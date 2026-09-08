import { serverMessageSchema, type ServerMessage } from "@stockdesk/shared";

export const WS_BACKOFF_START_MS = 1000;
export const WS_BACKOFF_MAX_MS = 30_000;

const BACKOFF_FACTOR = 2;
const CLOSED_STATE = 3;

export interface WsTimers {
  setTimeout: (handler: () => void, delay: number) => number;
  clearTimeout: (id: number) => void;
}

export interface WsSocket {
  readyState: number;
  send: (data: string) => void;
  close: () => void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
}

export type WsSocketFactory = new (url: string) => WsSocket;

export interface WsClientOptions {
  url: string;
  getAccessToken: () => string | null;
  onMessage: (message: ServerMessage) => void;
  WebSocketImpl?: WsSocketFactory;
  timers?: WsTimers;
}

export interface WsClient {
  connect: () => void;
  disconnect: () => void;
}

export function resolveWsUrl(url: string): string {
  if (!url.startsWith("/")) return url;

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

  return `${protocol}//${window.location.host}${url}`;
}

function defaultTimers(): WsTimers {
  return {
    setTimeout: (handler, delay) => window.setTimeout(handler, delay),
    clearTimeout: (id) => window.clearTimeout(id),
  };
}

function parseMessage(data: unknown): ServerMessage | null {
  if (typeof data !== "string") return null;

  let payload: unknown;

  try {
    payload = JSON.parse(data);
  } catch {
    return null;
  }

  const parsed = serverMessageSchema.safeParse(payload);

  return parsed.success ? parsed.data : null;
}

export function backoffDelay(attempt: number): number {
  const delay = WS_BACKOFF_START_MS * BACKOFF_FACTOR ** attempt;

  return delay > WS_BACKOFF_MAX_MS ? WS_BACKOFF_MAX_MS : delay;
}

export function createWsClient(options: WsClientOptions): WsClient {
  const timers = options.timers ?? defaultTimers();
  const target = resolveWsUrl(options.url);

  let socket: WsSocket | null = null;
  let reconnectTimer: number | null = null;
  let attempt = 0;
  let stopped = true;

  function clearReconnect(): void {
    if (reconnectTimer === null) return;

    timers.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function scheduleReconnect(): void {
    if (stopped || reconnectTimer !== null) return;

    const delay = backoffDelay(attempt);
    attempt += 1;
    reconnectTimer = timers.setTimeout(() => {
      reconnectTimer = null;
      open();
    }, delay);
  }

  function detach(current: WsSocket): void {
    current.onopen = null;
    current.onclose = null;
    current.onerror = null;
    current.onmessage = null;
  }

  function handleOpen(current: WsSocket): void {
    const token = options.getAccessToken();

    if (token === null || token === "") {
      current.close();
      return;
    }

    current.send(JSON.stringify({ type: "auth", token }));
  }

  function handleMessage(data: unknown): void {
    const message = parseMessage(data);

    if (message === null) return;

    if (message.type === "auth_ok") attempt = 0;

    options.onMessage(message);
  }

  function open(): void {
    const Impl = options.WebSocketImpl ?? (globalThis.WebSocket as unknown as WsSocketFactory);
    const current = new Impl(target);
    socket = current;

    current.onopen = () => handleOpen(current);
    current.onmessage = (event) => handleMessage(event.data);
    current.onerror = () => undefined;
    current.onclose = () => {
      detach(current);
      if (socket === current) socket = null;
      scheduleReconnect();
    };
  }

  return {
    connect: () => {
      if (!stopped) return;

      stopped = false;
      attempt = 0;
      open();
    },

    disconnect: () => {
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
