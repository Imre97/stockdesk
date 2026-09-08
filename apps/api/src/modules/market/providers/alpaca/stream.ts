import { Decimal } from "@stockdesk/shared";

import { parseJsonWithDecimals } from "../decimal-json.js";
import {
  createReconnectingSocket,
  type ProviderLogger,
  type ProviderSocketFactory,
  type SocketTimers,
} from "../reconnecting-socket.js";
import type { Trade } from "../types.js";
import type { AlpacaFeed } from "./client.js";
import { alpacaTimestampToDate } from "./timestamps.js";

export const ALPACA_STREAM_BASE_URL = "wss://stream.data.alpaca.markets/v2";

const TRADE_DECIMAL_KEYS: ReadonlySet<string> = new Set(["p", "s"]);

interface RawMessage {
  T?: unknown;
  msg?: unknown;
  S?: unknown;
  p?: unknown;
  s?: unknown;
  t?: unknown;
  code?: unknown;
}

export interface AlpacaStreamOptions {
  key: string;
  secret: string;
  feed: AlpacaFeed;
  WebSocketImpl: ProviderSocketFactory;
  timers: SocketTimers;
  onTrade: (trade: Trade) => void;
  log?: ProviderLogger;
  baseUrl?: string;
}

export interface AlpacaStream {
  start: () => void;
  stop: () => void;
  setSymbols: (symbols: string[]) => void;
}

function isDecimal(value: unknown): value is Decimal {
  return value instanceof Decimal;
}

function toTrade(message: RawMessage): Trade | null {
  if (typeof message.S !== "string" || typeof message.t !== "string") return null;
  if (!isDecimal(message.p) || !isDecimal(message.s)) return null;

  return {
    symbol: message.S,
    price: message.p,
    size: message.s,
    at: alpacaTimestampToDate(message.t),
  };
}

export function createAlpacaStream(options: AlpacaStreamOptions): AlpacaStream {
  const baseUrl = options.baseUrl ?? ALPACA_STREAM_BASE_URL;
  let symbols: string[] = [];
  let authenticated = false;

  const socket = createReconnectingSocket({
    url: `${baseUrl}/${options.feed}`,
    WebSocketImpl: options.WebSocketImpl,
    timers: options.timers,
    ...(options.log === undefined ? {} : { log: options.log }),
    onClose: () => {
      authenticated = false;
    },
    onMessage: (data) => handleMessage(data),
  });

  function sendAction(action: string, trades: string[]): void {
    if (trades.length === 0) return;

    socket.send(JSON.stringify({ action, trades }));
  }

  function handleFrame(message: RawMessage): void {
    if (message.T === "success" && message.msg === "connected") {
      socket.send(JSON.stringify({ action: "auth", key: options.key, secret: options.secret }));
      return;
    }

    if (message.T === "success" && message.msg === "authenticated") {
      authenticated = true;
      sendAction("subscribe", symbols);
      return;
    }

    if (message.T === "error") {
      options.log?.error(`Alpaca stream error ${String(message.code)}: ${String(message.msg)}`);
      return;
    }

    if (message.T !== "t") return;

    const trade = toTrade(message);

    if (trade !== null) options.onTrade(trade);
  }

  function handleMessage(data: unknown): void {
    if (typeof data !== "string") return;

    let payload: unknown;

    try {
      payload = parseJsonWithDecimals(data, TRADE_DECIMAL_KEYS);
    } catch {
      options.log?.warn("Alpaca stream delivered a frame that is not valid JSON.");
      return;
    }

    if (!Array.isArray(payload)) return;

    for (const message of payload as RawMessage[]) handleFrame(message);
  }

  return {
    start: () => socket.connect(),

    stop: () => {
      authenticated = false;
      socket.close();
    },

    setSymbols: (next) => {
      const added = next.filter((symbol) => !symbols.includes(symbol));
      const removed = symbols.filter((symbol) => !next.includes(symbol));
      symbols = [...next];

      if (!authenticated) return;

      sendAction("subscribe", added);
      sendAction("unsubscribe", removed);
    },
  };
}
