import { Decimal } from "@stockdesk/shared";

import { parseJsonWithDecimals } from "../decimal-json.js";
import {
  createReconnectingSocket,
  type ProviderLogger,
  type ProviderSocketFactory,
  type SocketTimers,
} from "../reconnecting-socket.js";
import type { Trade } from "../types.js";

export const FINNHUB_STREAM_BASE_URL = "wss://ws.finnhub.io";

const TRADE_DECIMAL_KEYS: ReadonlySet<string> = new Set(["p", "v"]);

interface RawTrade {
  p?: unknown;
  s?: unknown;
  t?: unknown;
  v?: unknown;
}

interface RawFrame {
  type?: unknown;
  data?: unknown;
}

export interface FinnhubStreamOptions {
  key: string;
  WebSocketImpl: ProviderSocketFactory;
  timers: SocketTimers;
  onTrade: (trade: Trade) => void;
  log?: ProviderLogger;
  baseUrl?: string;
}

export interface FinnhubStream {
  start: () => void;
  stop: () => void;
  setSymbols: (symbols: string[]) => void;
}

function toTrade(raw: RawTrade): Trade | null {
  if (typeof raw.s !== "string" || typeof raw.t !== "number") return null;
  if (!(raw.p instanceof Decimal) || !(raw.v instanceof Decimal)) return null;

  return { symbol: raw.s, price: raw.p, size: raw.v, at: new Date(raw.t) };
}

export function createFinnhubStream(options: FinnhubStreamOptions): FinnhubStream {
  const baseUrl = options.baseUrl ?? FINNHUB_STREAM_BASE_URL;
  let symbols: string[] = [];
  let connected = false;

  const socket = createReconnectingSocket({
    url: `${baseUrl}?token=${encodeURIComponent(options.key)}`,
    WebSocketImpl: options.WebSocketImpl,
    timers: options.timers,
    ...(options.log === undefined ? {} : { log: options.log }),
    onOpen: () => {
      connected = true;
      sendAction("subscribe", symbols);
    },
    onClose: () => {
      connected = false;
    },
    onMessage: (data) => handleMessage(data),
  });

  function sendAction(type: string, list: string[]): void {
    for (const symbol of list) socket.send(JSON.stringify({ type, symbol }));
  }

  function handleMessage(data: unknown): void {
    if (typeof data !== "string") return;

    let payload: unknown;

    try {
      payload = parseJsonWithDecimals(data, TRADE_DECIMAL_KEYS);
    } catch {
      options.log?.warn("Finnhub stream delivered a frame that is not valid JSON.");
      return;
    }

    const frame = payload as RawFrame;

    if (frame.type !== "trade" || !Array.isArray(frame.data)) return;

    for (const entry of frame.data as RawTrade[]) {
      const trade = toTrade(entry);

      if (trade !== null) options.onTrade(trade);
    }
  }

  return {
    start: () => socket.connect(),

    stop: () => {
      connected = false;
      socket.close();
    },

    setSymbols: (next) => {
      const added = next.filter((symbol) => !symbols.includes(symbol));
      const removed = symbols.filter((symbol) => !next.includes(symbol));
      symbols = [...next];

      if (!connected) return;

      sendAction("subscribe", added);
      sendAction("unsubscribe", removed);
    },
  };
}
