import { describe, expect, it } from "vitest";

import {
  BAR_SUBSCRIPTION_LIMIT,
  QUOTE_MESSAGE_SYMBOL_CAP,
  QUOTE_SUBSCRIPTION_LIMIT,
  barMessageSchema,
  clientMessageSchema,
  marketStatusMessageSchema,
  quoteMessageSchema,
  serverMessageSchema,
  subscribeBarsMessageSchema,
  subscribeQuotesMessageSchema,
  unsubscribeBarsMessageSchema,
  unsubscribeQuotesMessageSchema,
  wsErrorMessageSchema,
} from "./ws.js";

const BAR = {
  time: "2026-09-08T14:30:00.000Z",
  open: "251.10",
  high: "251.40",
  low: "251.05",
  close: "251.34",
  volume: "1200",
};

const SUBSCRIBE_QUOTES = { type: "subscribe", channel: "quotes", symbols: ["TSLA", "AAPL"] };
const UNSUBSCRIBE_QUOTES = { type: "unsubscribe", channel: "quotes", symbols: ["AAPL"] };
const SUBSCRIBE_BARS = { type: "subscribe", channel: "bars", symbol: "TSLA", timeframe: "1m" };
const UNSUBSCRIBE_BARS = { type: "unsubscribe", channel: "bars", symbol: "TSLA", timeframe: "1m" };

const QUOTE_MESSAGE = {
  type: "quote",
  symbol: "TSLA",
  price: "251.3400",
  size: "100",
  at: "2026-09-08T14:30:01.123Z",
  prevClose: "248.9000",
};

const BAR_MESSAGE = { type: "bar", symbol: "TSLA", timeframe: "1m", bar: BAR, isFinal: false };

const MARKET_STATUS_MESSAGE = {
  type: "market_status",
  status: "open",
  nextOpenAt: null,
  nextCloseAt: "2026-09-08T20:00:00.000Z",
};

describe("subscription limits", () => {
  it("matches the per-socket limits from the module spec", () => {
    expect(QUOTE_SUBSCRIPTION_LIMIT).toBe(50);
    expect(BAR_SUBSCRIPTION_LIMIT).toBe(5);
  });

  it("caps a single quote message at twice the per-socket limit", () => {
    expect(QUOTE_MESSAGE_SYMBOL_CAP).toBe(QUOTE_SUBSCRIPTION_LIMIT * 2);
  });
});

describe("quote subscription messages", () => {
  it.each([
    [subscribeQuotesMessageSchema, SUBSCRIBE_QUOTES],
    [unsubscribeQuotesMessageSchema, UNSUBSCRIBE_QUOTES],
  ])("round-trips the message", (schema, message) => {
    expect(schema.parse(message)).toEqual(message);
  });

  it("accepts the maximum number of symbols", () => {
    const symbols = Array.from({ length: QUOTE_MESSAGE_SYMBOL_CAP }, (_value, index) => `SYM${index}`);

    expect(subscribeQuotesMessageSchema.safeParse({ ...SUBSCRIBE_QUOTES, symbols }).success).toBe(true);
  });

  it("accepts more symbols than the per-socket limit so the socket can refuse the overflow", () => {
    const symbols = Array.from(
      { length: QUOTE_SUBSCRIPTION_LIMIT + 1 },
      (_value, index) => `SYM${index}`,
    );

    expect(subscribeQuotesMessageSchema.safeParse({ ...SUBSCRIBE_QUOTES, symbols }).success).toBe(true);
  });

  it.each([
    ["an empty symbol list", { ...SUBSCRIBE_QUOTES, symbols: [] }],
    ["a lowercase symbol", { ...SUBSCRIBE_QUOTES, symbols: ["tsla"] }],
    ["the wrong verb", { ...SUBSCRIBE_QUOTES, type: "unsubscribe" }],
    ["the wrong channel", { ...SUBSCRIBE_QUOTES, channel: "bars" }],
  ])("rejects %s", (_label, input) => {
    expect(subscribeQuotesMessageSchema.safeParse(input).success).toBe(false);
  });

  it("rejects more symbols than the message cap", () => {
    const symbols = Array.from(
      { length: QUOTE_MESSAGE_SYMBOL_CAP + 1 },
      (_value, index) => `SYM${index}`,
    );

    expect(subscribeQuotesMessageSchema.safeParse({ ...SUBSCRIBE_QUOTES, symbols }).success).toBe(false);
  });
});

describe("bar subscription messages", () => {
  it.each([
    [subscribeBarsMessageSchema, SUBSCRIBE_BARS],
    [unsubscribeBarsMessageSchema, UNSUBSCRIBE_BARS],
  ])("round-trips the message", (schema, message) => {
    expect(schema.parse(message)).toEqual(message);
  });

  it.each([
    ["an unknown timeframe", { ...SUBSCRIBE_BARS, timeframe: "2m" }],
    ["a missing timeframe", { ...SUBSCRIBE_BARS, timeframe: undefined }],
    ["a symbol list instead of one symbol", { type: "subscribe", channel: "bars", symbols: ["TSLA"] }],
  ])("rejects %s", (_label, input) => {
    expect(subscribeBarsMessageSchema.safeParse(input).success).toBe(false);
  });
});

describe("clientMessageSchema", () => {
  it("still accepts the auth handshake", () => {
    const result = clientMessageSchema.parse({ type: "auth", token: "header.payload.signature" });

    if (result.type !== "auth") throw new Error("expected an auth message");

    expect(result.token).toBe("header.payload.signature");
  });

  it("narrows a quotes subscribe by type and then channel", () => {
    const result = clientMessageSchema.parse(SUBSCRIBE_QUOTES);

    if (result.type !== "subscribe") throw new Error("expected a subscribe message");
    if (result.channel !== "quotes") throw new Error("expected the quotes channel");

    expect(result.symbols).toEqual(["TSLA", "AAPL"]);
  });

  it("narrows a bars subscribe by type and then channel", () => {
    const result = clientMessageSchema.parse(SUBSCRIBE_BARS);

    if (result.type !== "subscribe") throw new Error("expected a subscribe message");
    if (result.channel !== "bars") throw new Error("expected the bars channel");

    expect(result.symbol).toBe("TSLA");
    expect(result.timeframe).toBe("1m");
  });

  it("narrows a quotes unsubscribe by type and then channel", () => {
    const result = clientMessageSchema.parse(UNSUBSCRIBE_QUOTES);

    if (result.type !== "unsubscribe") throw new Error("expected an unsubscribe message");
    if (result.channel !== "quotes") throw new Error("expected the quotes channel");

    expect(result.symbols).toEqual(["AAPL"]);
  });

  it("narrows a bars unsubscribe by type and then channel", () => {
    const result = clientMessageSchema.parse(UNSUBSCRIBE_BARS);

    if (result.type !== "unsubscribe") throw new Error("expected an unsubscribe message");
    if (result.channel !== "bars") throw new Error("expected the bars channel");

    expect(result.timeframe).toBe("1m");
  });

  it.each([
    ["an unknown channel", { type: "subscribe", channel: "news", symbols: ["TSLA"] }],
    ["a missing channel", { type: "subscribe", symbols: ["TSLA"] }],
    ["a bars subscribe with an unknown timeframe", { ...SUBSCRIBE_BARS, timeframe: "2m" }],
    ["a quotes subscribe with no symbols", { ...SUBSCRIBE_QUOTES, symbols: [] }],
    ["a server message", QUOTE_MESSAGE],
    ["an unknown verb", { type: "resubscribe", channel: "quotes", symbols: ["TSLA"] }],
  ])("rejects %s", (_label, input) => {
    expect(clientMessageSchema.safeParse(input).success).toBe(false);
  });
});

describe("quoteMessageSchema", () => {
  it("round-trips a quote message", () => {
    expect(quoteMessageSchema.parse(QUOTE_MESSAGE)).toEqual(QUOTE_MESSAGE);
  });

  it("accepts a quote without a previous close", () => {
    expect(quoteMessageSchema.parse({ ...QUOTE_MESSAGE, prevClose: null }).prevClose).toBeNull();
  });

  it.each([
    ["a numeric price", { ...QUOTE_MESSAGE, price: 251.34 }],
    ["a numeric size", { ...QUOTE_MESSAGE, size: 100 }],
    ["a malformed price", { ...QUOTE_MESSAGE, price: "2.5e2" }],
    ["a missing previous close key", { ...QUOTE_MESSAGE, prevClose: undefined }],
    ["a lowercase symbol", { ...QUOTE_MESSAGE, symbol: "tsla" }],
  ])("rejects %s", (_label, input) => {
    expect(quoteMessageSchema.safeParse(input).success).toBe(false);
  });
});

describe("barMessageSchema", () => {
  it("round-trips a bar message", () => {
    expect(barMessageSchema.parse(BAR_MESSAGE)).toEqual(BAR_MESSAGE);
  });

  it("keeps the bar prices as strings", () => {
    const result = barMessageSchema.parse({ ...BAR_MESSAGE, isFinal: true });

    expect(result.bar.close).toBe("251.34");
    expect(result.isFinal).toBe(true);
  });

  it.each([
    ["an unknown timeframe", { ...BAR_MESSAGE, timeframe: "2m" }],
    ["a numeric close", { ...BAR_MESSAGE, bar: { ...BAR, close: 251.34 } }],
    ["a missing final flag", { ...BAR_MESSAGE, isFinal: undefined }],
  ])("rejects %s", (_label, input) => {
    expect(barMessageSchema.safeParse(input).success).toBe(false);
  });
});

describe("marketStatusMessageSchema", () => {
  it("round-trips a market status message", () => {
    expect(marketStatusMessageSchema.parse(MARKET_STATUS_MESSAGE)).toEqual(MARKET_STATUS_MESSAGE);
  });

  it("rejects an unknown status", () => {
    expect(marketStatusMessageSchema.safeParse({ ...MARKET_STATUS_MESSAGE, status: "holiday" }).success).toBe(false);
  });
});

describe("wsErrorMessageSchema", () => {
  it("round-trips an error with a symbol", () => {
    const message = { type: "error", code: "SYMBOL_NOT_FOUND", symbol: "XXXX" };

    expect(wsErrorMessageSchema.parse(message)).toEqual(message);
  });

  it("round-trips an error without a symbol", () => {
    const message = { type: "error", code: "SUBSCRIPTION_LIMIT" };

    expect(wsErrorMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a code outside the market error codes", () => {
    expect(wsErrorMessageSchema.safeParse({ type: "error", code: "UNAUTHORIZED" }).success).toBe(false);
  });
});

describe("serverMessageSchema", () => {
  it("discriminates a quote message", () => {
    const result = serverMessageSchema.parse(QUOTE_MESSAGE);

    if (result.type !== "quote") throw new Error("expected a quote message");

    expect(result.price).toBe("251.3400");
  });

  it("discriminates a bar message", () => {
    const result = serverMessageSchema.parse(BAR_MESSAGE);

    if (result.type !== "bar") throw new Error("expected a bar message");

    expect(result.bar.volume).toBe("1200");
  });

  it("discriminates a market status message", () => {
    const result = serverMessageSchema.parse(MARKET_STATUS_MESSAGE);

    if (result.type !== "market_status") throw new Error("expected a market_status message");

    expect(result.status).toBe("open");
  });

  it("discriminates an error message", () => {
    const result = serverMessageSchema.parse({ type: "error", code: "INVALID_TIMEFRAME" });

    if (result.type !== "error") throw new Error("expected an error message");

    expect(result.code).toBe("INVALID_TIMEFRAME");
  });

  it.each([
    ["a quote with a numeric price", { ...QUOTE_MESSAGE, price: 251.34 }],
    ["a client subscribe message", SUBSCRIBE_QUOTES],
    ["an unknown type", { type: "news", headline: "x" }],
  ])("rejects %s", (_label, input) => {
    expect(serverMessageSchema.safeParse(input).success).toBe(false);
  });
});
