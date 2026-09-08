import type { QuoteMessage } from "@stockdesk/shared";
import { describe, expect, it } from "vitest";
import { createQuoteThrottle, type ThrottleTimers } from "./quote-throttle.js";

const PER_SECOND = 10;
const WINDOW_MS = 100;

interface FakeTimers extends ThrottleTimers {
  advance: (ms: number) => void;
}

interface ScheduledTimer {
  at: number;
  handler: () => void;
}

function fakeTimers(): FakeTimers {
  const scheduled = new Map<number, ScheduledTimer>();
  let clock = 0;
  let nextHandle = 1;

  return {
    setTimeout: (handler: () => void, delayMs: number) => {
      const handle = nextHandle;
      nextHandle += 1;
      scheduled.set(handle, { at: clock + delayMs, handler });
      return handle;
    },
    clearTimeout: (handle: unknown) => {
      scheduled.delete(handle as number);
    },
    advance: (ms: number) => {
      clock += ms;

      for (const [handle, timer] of [...scheduled]) {
        if (timer.at > clock) continue;
        scheduled.delete(handle);
        timer.handler();
      }
    },
  };
}

function quote(symbol: string, price: string): QuoteMessage {
  return { type: "quote", symbol, price, size: "1", at: "2026-09-08T18:00:00.000Z", prevClose: null };
}

interface Sent {
  socket: object;
  message: QuoteMessage;
}

function createHarness() {
  const timers = fakeTimers();
  const sent: Sent[] = [];
  const throttle = createQuoteThrottle({
    perSecond: PER_SECOND,
    timers,
    send: (socket: object, message: QuoteMessage) => sent.push({ socket, message }),
  });

  return { timers, sent, throttle };
}

describe("quote throttle", () => {
  it("sends the first push immediately and only the newest one after the window", () => {
    const { timers, sent, throttle } = createHarness();
    const socket = { name: "client" };

    for (let index = 0; index < PER_SECOND; index += 1) {
      throttle.push(socket, "TSLA", quote("TSLA", `10${index}`));
    }

    expect(sent.map((entry) => entry.message.price)).toEqual(["100"]);

    timers.advance(WINDOW_MS);

    expect(sent.map((entry) => entry.message.price)).toEqual(["100", "109"]);
  });

  it("throttles each symbol of a socket independently", () => {
    const { sent, throttle } = createHarness();
    const socket = { name: "client" };

    throttle.push(socket, "TSLA", quote("TSLA", "100"));
    throttle.push(socket, "AAPL", quote("AAPL", "200"));

    expect(sent.map((entry) => entry.message.symbol)).toEqual(["TSLA", "AAPL"]);
  });

  it("keeps the sockets apart", () => {
    const { sent, throttle } = createHarness();
    const first = { name: "first" };
    const second = { name: "second" };

    throttle.push(first, "TSLA", quote("TSLA", "100"));
    throttle.push(second, "TSLA", quote("TSLA", "100"));

    expect(sent.map((entry) => entry.socket)).toEqual([first, second]);
  });

  it("drops the pending send of a socket", () => {
    const { timers, sent, throttle } = createHarness();
    const socket = { name: "client" };

    throttle.push(socket, "TSLA", quote("TSLA", "100"));
    throttle.push(socket, "TSLA", quote("TSLA", "101"));
    throttle.drop(socket);
    timers.advance(WINDOW_MS);

    expect(sent.map((entry) => entry.message.price)).toEqual(["100"]);
  });

  it("opens a new window after a quiet one", () => {
    const { timers, sent, throttle } = createHarness();
    const socket = { name: "client" };

    throttle.push(socket, "TSLA", quote("TSLA", "100"));
    timers.advance(WINDOW_MS);
    throttle.push(socket, "TSLA", quote("TSLA", "101"));

    expect(sent.map((entry) => entry.message.price)).toEqual(["100", "101"]);
  });
});
