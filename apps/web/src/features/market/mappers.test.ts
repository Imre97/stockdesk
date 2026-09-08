import { Decimal, barsResponseSchema, quoteMessageSchema } from "@stockdesk/shared";
import { describe, expect, it } from "vitest";

import {
  changeFrom,
  formatChange,
  formatChangePercent,
  formatPrice,
  formatSessionTime,
  formatYield,
  toCandlestickData,
  toChartBar,
  toLineData,
  toQuoteTick,
  toVolumeData,
} from "./mappers";

const GAIN_COLOR = "var(--gain)";
const LOSS_COLOR = "var(--loss)";

const QUOTE_MESSAGE = quoteMessageSchema.parse({
  type: "quote",
  symbol: "TSLA",
  price: "251.3400",
  size: "100",
  at: "2026-09-08T14:30:01.123Z",
  prevClose: "248.9000",
});

const BARS = barsResponseSchema.parse({
  symbol: "TSLA",
  timeframe: "1m",
  bars: [
    {
      time: "2026-09-08T14:30:00.000Z",
      open: "251.10",
      high: "251.40",
      low: "251.05",
      close: "251.34",
      volume: "1200",
    },
    {
      time: "2026-09-08T14:31:00.000Z",
      open: "251.34",
      high: "251.50",
      low: "251.00",
      close: "251.05",
      volume: "900",
    },
  ],
  hasMore: false,
});

const FIRST_BAR_SECONDS = 1_788_877_800;
const SECOND_BAR_SECONDS = 1_788_877_860;

describe("toQuoteTick", () => {
  it("parses the decimal strings of a quote message into Decimal values", () => {
    const tick = toQuoteTick(QUOTE_MESSAGE);

    expect(tick.price).toBeInstanceOf(Decimal);
    expect(tick.price.equals(new Decimal("251.34"))).toBe(true);
    expect(tick.size.equals(new Decimal("100"))).toBe(true);
    expect(tick.prevClose?.equals(new Decimal("248.90"))).toBe(true);
    expect(tick.at.toISOString()).toBe("2026-09-08T14:30:01.123Z");
    expect(tick.symbol).toBe("TSLA");
  });

  it("keeps a missing previous close null", () => {
    const tick = toQuoteTick({ ...QUOTE_MESSAGE, prevClose: null });

    expect(tick.prevClose).toBeNull();
  });
});

describe("toChartBar", () => {
  it("turns a bar payload into Decimal values with a Date timestamp", () => {
    const bar = toChartBar(
      {
        time: "2026-09-08T14:30:00.000Z",
        open: "251.10",
        high: "251.40",
        low: "251.05",
        close: "251.34",
        volume: "1200",
      },
      false,
    );

    expect(bar.open).toBeInstanceOf(Decimal);
    expect(bar.close.equals(new Decimal("251.34"))).toBe(true);
    expect(bar.time.toISOString()).toBe("2026-09-08T14:30:00.000Z");
    expect(bar.isFinal).toBe(false);
  });

  it("accepts an already parsed bar and defaults to a final bar", () => {
    const [first] = BARS.bars;

    if (first === undefined) throw new Error("fixture is empty");

    const bar = toChartBar(first);

    expect(bar.high.equals(new Decimal("251.40"))).toBe(true);
    expect(bar.isFinal).toBe(true);
  });
});

describe("chart series mappers", () => {
  const bars = BARS.bars.map((bar) => toChartBar(bar));

  it("maps bars to candlestick data with UTC second timestamps", () => {
    expect(toCandlestickData(bars)).toEqual([
      { time: FIRST_BAR_SECONDS, open: 251.1, high: 251.4, low: 251.05, close: 251.34 },
      { time: SECOND_BAR_SECONDS, open: 251.34, high: 251.5, low: 251, close: 251.05 },
    ]);
  });

  it("maps bars to line data on the closing price", () => {
    expect(toLineData(bars)).toEqual([
      { time: FIRST_BAR_SECONDS, value: 251.34 },
      { time: SECOND_BAR_SECONDS, value: 251.05 },
    ]);
  });

  it("colors volume bars by the direction of the candle", () => {
    expect(toVolumeData(bars, GAIN_COLOR, LOSS_COLOR)).toEqual([
      { time: FIRST_BAR_SECONDS, value: 1200, color: GAIN_COLOR },
      { time: SECOND_BAR_SECONDS, value: 900, color: LOSS_COLOR },
    ]);
  });
});

describe("changeFrom", () => {
  it("returns the absolute change and the percentage rounded to two decimals", () => {
    const result = changeFrom(new Decimal("251.34"), new Decimal("248.90"));

    expect(result?.change.equals(new Decimal("2.44"))).toBe(true);
    expect(result?.changePct.equals(new Decimal("0.98"))).toBe(true);
  });

  it("rounds the percentage half to even", () => {
    const result = changeFrom(new Decimal("100.125"), new Decimal("100"));

    expect(result?.changePct.equals(new Decimal("0.12"))).toBe(true);
  });

  it("returns null without a previous close", () => {
    expect(changeFrom(new Decimal("251.34"), null)).toBeNull();
  });

  it("returns null when the previous close is zero", () => {
    expect(changeFrom(new Decimal("251.34"), new Decimal("0"))).toBeNull();
  });
});

describe("format helpers", () => {
  it("formats a price with the active locale", () => {
    expect(formatPrice(new Decimal("1234.5"), "en-US")).toBe("$1,234.50");
  });

  it("formats a change with an explicit sign", () => {
    expect(formatChange(new Decimal("2.44"), "en-US")).toBe("+$2.44");
  });

  it("formats a percentage change", () => {
    expect(formatChangePercent(new Decimal("0.98"), "en-US")).toBe("0.98%");
  });

  it("renders a dividend yield fraction as a percentage", () => {
    expect(formatYield(new Decimal("0.0130"), "en-US")).toBe("1.30%");
  });

  it("renders a dividend yield fraction with the Hungarian locale", () => {
    expect(formatYield(new Decimal("0.0130"), "hu-HU")).toBe(
      new Intl.NumberFormat("hu-HU", {
        style: "percent",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(0.013),
    );
  });

  it("formats a session time in the active locale", () => {
    expect(formatSessionTime("2026-09-08T14:30:00.000Z", "en-US")).toMatch(/\d/);
  });
});
