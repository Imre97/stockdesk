import { beforeEach, describe, expect, it, vi } from "vitest";

const wsSession = vi.hoisted(() => ({ subscribe: vi.fn(() => () => undefined) }));

vi.mock("../../lib/ws-session", () => ({ wsSession }));

import { subscribeBars, subscribeQuote } from "./subscriptions";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("subscribeQuote", () => {
  it("reference counts the quotes channel of one symbol", () => {
    subscribeQuote("TSLA");

    expect(wsSession.subscribe).toHaveBeenCalledWith(
      "quotes:TSLA",
      { type: "subscribe", channel: "quotes", symbols: ["TSLA"] },
      { type: "unsubscribe", channel: "quotes", symbols: ["TSLA"] },
    );
  });

  it("returns the release function of the session", () => {
    const release = vi.fn();
    wsSession.subscribe.mockReturnValueOnce(release);

    subscribeQuote("TSLA")();

    expect(release).toHaveBeenCalled();
  });
});

describe("subscribeBars", () => {
  it("reference counts one symbol and timeframe pair", () => {
    subscribeBars("TSLA", "1m");

    expect(wsSession.subscribe).toHaveBeenCalledWith(
      "bars:TSLA:1m",
      { type: "subscribe", channel: "bars", symbol: "TSLA", timeframe: "1m" },
      { type: "unsubscribe", channel: "bars", symbol: "TSLA", timeframe: "1m" },
    );
  });
});
