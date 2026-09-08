import { BAR_SUBSCRIPTION_LIMIT, QUOTE_SUBSCRIPTION_LIMIT } from "@stockdesk/shared";
import { describe, expect, it } from "vitest";
import { createMarketSubscriptions } from "./market-subscriptions.js";

function socket(name: string): object {
  return { name };
}

function symbols(count: number, prefix = "S"): string[] {
  return Array.from({ length: count }, (_value, index) => `${prefix}${index}`);
}

describe("market subscriptions", () => {
  it("adds quote symbols and reports the first subscriber of a symbol", () => {
    const subscriptions = createMarketSubscriptions();
    const first = socket("first");
    const second = socket("second");

    expect(subscriptions.subscribeQuotes(first, ["TSLA"])).toEqual([
      { symbol: "TSLA", outcome: "added", first: true },
    ]);
    expect(subscriptions.subscribeQuotes(second, ["TSLA"])).toEqual([
      { symbol: "TSLA", outcome: "added", first: false },
    ]);
    expect(subscriptions.quoteSockets("TSLA")).toEqual([first, second]);
  });

  it("reports an already held quote subscription without adding it twice", () => {
    const subscriptions = createMarketSubscriptions();
    const client = socket("client");

    subscriptions.subscribeQuotes(client, ["TSLA"]);

    expect(subscriptions.subscribeQuotes(client, ["TSLA"])).toEqual([
      { symbol: "TSLA", outcome: "already", first: false },
    ]);
    expect(subscriptions.quoteSockets("TSLA")).toEqual([client]);
  });

  it("adds what fits under the quote limit and refuses the rest", () => {
    const subscriptions = createMarketSubscriptions();
    const client = socket("client");

    subscriptions.subscribeQuotes(client, symbols(QUOTE_SUBSCRIPTION_LIMIT - 1));

    const results = subscriptions.subscribeQuotes(client, ["AAA", "BBB"]);

    expect(results.map((result) => result.outcome)).toEqual(["added", "limit"]);
    expect(subscriptions.quoteCount(client)).toBe(QUOTE_SUBSCRIPTION_LIMIT);
    expect(subscriptions.quoteSockets("BBB")).toEqual([]);
  });

  it("refuses a bar subscription above the per-socket limit", () => {
    const subscriptions = createMarketSubscriptions();
    const client = socket("client");
    const timeframes = ["1m", "5m", "15m", "1h", "1D", "1W"] as const;

    const outcomes = timeframes.map(
      (timeframe) => subscriptions.subscribeBar(client, "TSLA", timeframe).outcome,
    );

    expect(outcomes).toEqual([
      ...Array.from({ length: BAR_SUBSCRIPTION_LIMIT }, () => "added"),
      "limit",
    ]);
    expect(subscriptions.barCount(client)).toBe(BAR_SUBSCRIPTION_LIMIT);
  });

  it("reports the first and last subscriber of a bar key", () => {
    const subscriptions = createMarketSubscriptions();
    const first = socket("first");
    const second = socket("second");

    expect(subscriptions.subscribeBar(first, "TSLA", "1m")).toEqual({ outcome: "added", first: true });
    expect(subscriptions.subscribeBar(second, "TSLA", "1m")).toEqual({ outcome: "added", first: false });
    expect(subscriptions.unsubscribeBar(first, "TSLA", "1m")).toEqual({ removed: true, last: false });
    expect(subscriptions.unsubscribeBar(second, "TSLA", "1m")).toEqual({ removed: true, last: true });
    expect(subscriptions.unsubscribeBar(second, "TSLA", "1m")).toEqual({ removed: false, last: false });
    expect(subscriptions.barSockets("TSLA", "1m")).toEqual([]);
  });

  it("reports the quote symbols whose last subscriber unsubscribed", () => {
    const subscriptions = createMarketSubscriptions();
    const first = socket("first");
    const second = socket("second");

    subscriptions.subscribeQuotes(first, ["TSLA", "AAPL"]);
    subscriptions.subscribeQuotes(second, ["TSLA"]);

    expect(subscriptions.unsubscribeQuotes(first, ["TSLA", "AAPL", "MSFT"])).toEqual(["AAPL"]);
    expect(subscriptions.quoteCount(first)).toBe(0);
    expect(subscriptions.quoteSockets("TSLA")).toEqual([second]);
  });

  it("returns the orphaned symbols and bar keys when a socket is removed", () => {
    const subscriptions = createMarketSubscriptions();
    const leaving = socket("leaving");
    const staying = socket("staying");

    subscriptions.subscribeQuotes(leaving, ["TSLA", "AAPL"]);
    subscriptions.subscribeQuotes(staying, ["AAPL"]);
    subscriptions.subscribeBar(leaving, "TSLA", "1m");
    subscriptions.subscribeBar(leaving, "AAPL", "1D");
    subscriptions.subscribeBar(staying, "AAPL", "1D");

    expect(subscriptions.removeSocket(leaving)).toEqual({
      symbols: ["TSLA"],
      bars: [{ symbol: "TSLA", timeframe: "1m" }],
    });
    expect(subscriptions.quoteCount(leaving)).toBe(0);
    expect(subscriptions.barCount(leaving)).toBe(0);
    expect(subscriptions.quoteSockets("AAPL")).toEqual([staying]);
    expect(subscriptions.barSockets("AAPL", "1D")).toEqual([staying]);
  });
});
