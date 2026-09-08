import { Decimal } from "@stockdesk/shared";
import { describe, expect, it } from "vitest";

import type { ProviderLogger, SocketTimers } from "../reconnecting-socket.js";
import type { Trade } from "../types.js";
import {
  ALPACA_MAX_STREAMED_SYMBOLS,
  ALPACA_POLL_INTERVAL_MS,
  createAlpacaSubscriptions,
  type AlpacaSubscriptions,
} from "./subscriptions.js";

function symbolAt(index: number): string {
  return `S${String(index).padStart(2, "0")}`;
}

function symbolRange(count: number): string[] {
  return Array.from({ length: count }, (_unused, index) => symbolAt(index + 1));
}

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function trade(symbol: string, at: string): Trade {
  return { symbol, price: new Decimal("182.1"), size: new Decimal("100"), at: new Date(at) };
}

interface Harness {
  subscriptions: AlpacaSubscriptions;
  streamedCalls: string[][];
  fetchCalls: string[][];
  emitted: Trade[];
  delays: number[];
  messages: string[];
  runNext: () => void;
  pending: () => number;
  respond: (trades: Trade[]) => void;
  reject: (error: Error) => void;
}

function setup(): Harness {
  const streamedCalls: string[][] = [];
  const fetchCalls: string[][] = [];
  const emitted: Trade[] = [];
  const delays: number[] = [];
  const messages: string[] = [];
  const scheduled = new Map<number, () => void>();
  let nextId = 1;
  let nextResult: Trade[] = [];
  let nextError: Error | null = null;

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

  const log: ProviderLogger = {
    info: (message) => messages.push(message),
    warn: (message) => messages.push(message),
    error: (message) => messages.push(message),
  };

  const subscriptions = createAlpacaSubscriptions({
    timers,
    log,
    setStreamedSymbols: (symbols) => streamedCalls.push(symbols),
    fetchLatestTrades: (symbols) => {
      fetchCalls.push(symbols);

      if (nextError !== null) {
        const error = nextError;
        nextError = null;
        return Promise.reject(error);
      }

      return Promise.resolve(nextResult);
    },
    onTrade: (received) => emitted.push(received),
  });

  return {
    subscriptions,
    streamedCalls,
    fetchCalls,
    emitted,
    delays,
    messages,
    pending: () => scheduled.size,
    runNext: () => {
      const entry = scheduled.entries().next();

      if (entry.done === true) throw new Error("No timer is pending.");

      scheduled.delete(entry.value[0]);
      entry.value[1]();
    },
    respond: (trades) => {
      nextResult = trades;
    },
    reject: (error) => {
      nextError = error;
    },
  };
}

describe("createAlpacaSubscriptions", () => {
  it("streams every symbol up to the free plan limit", () => {
    const harness = setup();

    harness.subscriptions.requestSymbols(symbolRange(ALPACA_MAX_STREAMED_SYMBOLS));

    expect(harness.subscriptions.streamedSymbols()).toEqual(symbolRange(30));
    expect(harness.subscriptions.polledSymbols()).toEqual([]);
    expect(harness.streamedCalls.at(-1)).toEqual(symbolRange(30));
  });

  it("moves the least recently requested symbol to polling above the limit", () => {
    const harness = setup();

    harness.subscriptions.requestSymbols(symbolRange(31));

    expect(harness.subscriptions.polledSymbols()).toEqual(["S01"]);
    expect(harness.subscriptions.streamedSymbols()).toHaveLength(30);
    expect(harness.subscriptions.streamedSymbols()).not.toContain("S01");
  });

  it("returns a re-requested symbol to the stream and evicts the next oldest", () => {
    const harness = setup();

    harness.subscriptions.requestSymbols(symbolRange(31));
    harness.subscriptions.requestSymbols(["S01"]);

    expect(harness.subscriptions.streamedSymbols()).toContain("S01");
    expect(harness.subscriptions.streamedSymbols().at(-1)).toBe("S01");
    expect(harness.subscriptions.polledSymbols()).toEqual(["S02"]);
  });

  it("promotes the most recently requested polled symbol when a streamed symbol is released", () => {
    const harness = setup();

    harness.subscriptions.requestSymbols(symbolRange(32));

    expect(harness.subscriptions.polledSymbols()).toEqual(["S01", "S02"]);

    harness.subscriptions.releaseSymbols(["S31"]);

    expect(harness.subscriptions.polledSymbols()).toEqual(["S01"]);
    expect(harness.subscriptions.streamedSymbols()).toContain("S02");
    expect(harness.subscriptions.streamedSymbols()).not.toContain("S31");
  });

  it("drops released symbols entirely", () => {
    const harness = setup();

    harness.subscriptions.requestSymbols(["AAPL", "MSFT"]);
    harness.subscriptions.releaseSymbols(["AAPL"]);

    expect(harness.subscriptions.streamedSymbols()).toEqual(["MSFT"]);
    expect(harness.streamedCalls.at(-1)).toEqual(["MSFT"]);
  });

  it("does not push the streamed set again when it did not change", () => {
    const harness = setup();

    harness.subscriptions.requestSymbols(["AAPL"]);
    harness.subscriptions.requestSymbols(["AAPL"]);

    expect(harness.streamedCalls).toEqual([["AAPL"]]);
  });

  it("polls the polled symbols in one call every five seconds", async () => {
    const harness = setup();

    harness.subscriptions.requestSymbols(symbolRange(32));
    harness.respond([]);
    harness.subscriptions.start();

    expect(harness.delays).toEqual([ALPACA_POLL_INTERVAL_MS]);

    harness.runNext();
    await flush();

    expect(harness.fetchCalls).toEqual([["S01", "S02"]]);
    expect(harness.delays).toEqual([ALPACA_POLL_INTERVAL_MS, ALPACA_POLL_INTERVAL_MS]);
  });

  it("emits a polled trade only when it is newer than the last emitted one", async () => {
    const harness = setup();

    harness.subscriptions.requestSymbols(symbolRange(31));
    harness.subscriptions.start();

    harness.respond([trade("S01", "2026-09-08T14:30:00.000Z")]);
    harness.runNext();
    await flush();

    harness.respond([trade("S01", "2026-09-08T14:30:00.000Z")]);
    harness.runNext();
    await flush();

    harness.respond([trade("S01", "2026-09-08T14:30:05.000Z")]);
    harness.runNext();
    await flush();

    expect(harness.emitted.map((emitted) => emitted.at.toISOString())).toEqual([
      "2026-09-08T14:30:00.000Z",
      "2026-09-08T14:30:05.000Z",
    ]);
  });

  it("skips the call while nothing is polled", async () => {
    const harness = setup();

    harness.subscriptions.requestSymbols(["AAPL"]);
    harness.subscriptions.start();
    harness.runNext();
    await flush();

    expect(harness.fetchCalls).toEqual([]);
    expect(harness.pending()).toBe(1);
  });

  it("logs a failed poll and keeps polling", async () => {
    const harness = setup();

    harness.subscriptions.requestSymbols(symbolRange(31));
    harness.subscriptions.start();
    harness.reject(new Error("gateway timeout"));
    harness.runNext();
    await flush();

    expect(harness.messages.some((message) => message.includes("gateway timeout"))).toBe(true);
    expect(harness.pending()).toBe(1);
  });

  it("stops the poll loop", () => {
    const harness = setup();

    harness.subscriptions.requestSymbols(symbolRange(31));
    harness.subscriptions.start();
    harness.subscriptions.stop();

    expect(harness.pending()).toBe(0);
  });
});
