import { Decimal, barMessageSchema, marketStatusMessageSchema, quoteMessageSchema } from "@stockdesk/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { toChartBar } from "./mappers";
import { barsKey, useMarketStore } from "./store";

function quote(price: string, at = "2026-09-08T14:30:01.123Z") {
  return quoteMessageSchema.parse({
    type: "quote",
    symbol: "TSLA",
    price,
    size: "100",
    at,
    prevClose: "248.9000",
  });
}

function barMessage(time: string, close: string, isFinal: boolean) {
  return barMessageSchema.parse({
    type: "bar",
    symbol: "TSLA",
    timeframe: "1m",
    bar: { time, open: "251.10", high: "251.40", low: "251.05", close, volume: "1200" },
    isFinal,
  });
}

const MARKET_STATUS = marketStatusMessageSchema.parse({
  type: "market_status",
  status: "open",
  nextOpenAt: null,
  nextCloseAt: "2026-09-08T20:00:00.000Z",
});

const FIRST_MINUTE = "2026-09-08T14:30:00.000Z";
const SECOND_MINUTE = "2026-09-08T14:31:00.000Z";
const SERIES = barsKey("TSLA", "1m");

function series() {
  return useMarketStore.getState().bars[SERIES] ?? [];
}

beforeEach(() => {
  useMarketStore.getState().reset();
});

describe("applyQuote", () => {
  it("stores the last tick of a symbol with Decimal values", () => {
    useMarketStore.getState().applyQuote(quote("251.3400"));

    const tick = useMarketStore.getState().quotes.TSLA;

    expect(tick?.price).toBeInstanceOf(Decimal);
    expect(tick?.price.equals(new Decimal("251.34"))).toBe(true);
    expect(tick?.prevClose?.equals(new Decimal("248.90"))).toBe(true);
  });

  it("replaces the previous tick of the same symbol", () => {
    useMarketStore.getState().applyQuote(quote("251.3400"));
    useMarketStore.getState().applyQuote(quote("252.0000", "2026-09-08T14:30:02.000Z"));

    expect(useMarketStore.getState().quotes.TSLA?.price.equals(new Decimal("252"))).toBe(true);
  });
});

describe("applyBar", () => {
  it("appends a bar that is newer than the last one", () => {
    useMarketStore.getState().applyBar(barMessage(FIRST_MINUTE, "251.34", true));
    useMarketStore.getState().applyBar(barMessage(SECOND_MINUTE, "251.05", false));

    expect(series()).toHaveLength(2);
    expect(series()[1]?.close.equals(new Decimal("251.05"))).toBe(true);
  });

  it("replaces the last bar when the bucket time is the same", () => {
    useMarketStore.getState().applyBar(barMessage(SECOND_MINUTE, "251.05", false));
    useMarketStore.getState().applyBar(barMessage(SECOND_MINUTE, "251.44", true));

    expect(series()).toHaveLength(1);
    expect(series()[0]?.close.equals(new Decimal("251.44"))).toBe(true);
    expect(series()[0]?.isFinal).toBe(true);
  });

  it("ignores a bar that is older than the last one", () => {
    useMarketStore.getState().applyBar(barMessage(SECOND_MINUTE, "251.05", true));
    useMarketStore.getState().applyBar(barMessage(FIRST_MINUTE, "999.99", true));

    expect(series()).toHaveLength(1);
    expect(series()[0]?.close.equals(new Decimal("251.05"))).toBe(true);
  });
});

describe("bar pages", () => {
  it("replaces the series with setBars and prepends an older page", () => {
    useMarketStore.getState().setBars("TSLA", "1m", [toChartBar(barMessage(SECOND_MINUTE, "251.05", true).bar)]);
    useMarketStore.getState().prependBars("TSLA", "1m", [toChartBar(barMessage(FIRST_MINUTE, "251.34", true).bar)]);

    expect(series().map((bar) => bar.time.toISOString())).toEqual([FIRST_MINUTE, SECOND_MINUTE]);
  });

  it("drops a single series with clearBars", () => {
    useMarketStore.getState().setBars("TSLA", "1m", [toChartBar(barMessage(FIRST_MINUTE, "251.34", true).bar)]);
    useMarketStore.getState().clearBars("TSLA", "1m");

    expect(useMarketStore.getState().bars[SERIES]).toBeUndefined();
  });
});

describe("applyMarketStatus", () => {
  it("stores the pushed market status", () => {
    useMarketStore.getState().applyMarketStatus(MARKET_STATUS);

    expect(useMarketStore.getState().marketStatus?.status).toBe("open");
    expect(useMarketStore.getState().marketStatus?.nextCloseAt).toBe("2026-09-08T20:00:00.000Z");
  });
});

describe("reset", () => {
  it("empties quotes, bars and the market status", () => {
    useMarketStore.getState().applyQuote(quote("251.3400"));
    useMarketStore.getState().applyBar(barMessage(FIRST_MINUTE, "251.34", true));
    useMarketStore.getState().applyMarketStatus(MARKET_STATUS);

    useMarketStore.getState().reset();

    expect(useMarketStore.getState().quotes).toEqual({});
    expect(useMarketStore.getState().bars).toEqual({});
    expect(useMarketStore.getState().marketStatus).toBeNull();
  });
});
