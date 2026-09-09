import { symbolDetailSchema, tradeSchema, type SymbolDetailDto, type TradeDto } from "@stockdesk/shared";
import { describe, expect, it } from "vitest";

import { tradeDto } from "../../test/fixtures";
import { toKeyStatRows, toTradeRow } from "./panel-mappers";

const LOCALE = "en-US";

const BASE: SymbolDetailDto = {
  symbol: "TSLA",
  name: "Tesla, Inc.",
  exchange: "NASDAQ",
  currency: "USD",
  shortable: true,
  fractionable: true,
  industry: "Automobiles",
  logoUrl: null,
  websiteUrl: null,
  quote: {
    last: "251.3400",
    prevClose: "248.9000",
    open: "249.5000",
    high: "252.0000",
    low: "248.1000",
    volume: "51234000",
    change: "2.4400",
    changePct: "0.98",
    at: "2026-09-08T14:30:01.123Z",
  },
  stats: {
    marketCap: "800000000000.00",
    sharesOutstanding: "3180000000",
    peRatio: "65.20",
    week52High: "299.2900",
    week52Low: "138.8000",
    beta: "2.05",
    dividendYield: "0.0130",
  },
};

const EMPTY_STATS: SymbolDetailDto["stats"] = {
  marketCap: null,
  sharesOutstanding: null,
  peRatio: null,
  week52High: null,
  week52Low: null,
  beta: null,
  dividendYield: null,
};

const TRADE: TradeDto = tradeDto();

function rowValue(rows: ReturnType<typeof toKeyStatRows>, labelKey: string): string | null {
  const row = rows.find((entry) => entry.labelKey === labelKey);

  if (row === undefined) throw new Error(`missing row ${labelKey}`);

  return row.value;
}

describe("toKeyStatRows", () => {
  it("lists the nine statistics of the spec in order", () => {
    const rows = toKeyStatRows(symbolDetailSchema.parse(BASE), LOCALE);

    expect(rows.map((row) => row.labelKey)).toEqual([
      "stats.prevClose",
      "stats.open",
      "stats.dayRange",
      "stats.volume",
      "stats.marketCap",
      "stats.peRatio",
      "stats.week52Range",
      "stats.beta",
      "stats.dividendYield",
    ]);
  });

  it("formats prices, ranges, compact numbers and the yield", () => {
    const rows = toKeyStatRows(symbolDetailSchema.parse(BASE), LOCALE);

    expect(rowValue(rows, "stats.prevClose")).toBe("$248.90");
    expect(rowValue(rows, "stats.open")).toBe("$249.50");
    expect(rowValue(rows, "stats.dayRange")).toBe("$248.10 – $252.00");
    expect(rowValue(rows, "stats.volume")).toBe("51.23M");
    expect(rowValue(rows, "stats.marketCap")).toBe("800B");
    expect(rowValue(rows, "stats.week52Range")).toBe("$138.80 – $299.29");
    expect(rowValue(rows, "stats.dividendYield")).toBe("1.30%");
  });

  it("renders the yield fraction with the Hungarian locale", () => {
    const rows = toKeyStatRows(symbolDetailSchema.parse(BASE), "hu-HU");

    expect(rowValue(rows, "stats.dividendYield")).toBe(
      new Intl.NumberFormat("hu-HU", {
        style: "percent",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(0.013),
    );
  });

  it("leaves every value null when the quote and the stats are missing", () => {
    const rows = toKeyStatRows(symbolDetailSchema.parse({ ...BASE, quote: null, stats: EMPTY_STATS }), LOCALE);

    expect(rows.every((row) => row.value === null)).toBe(true);
  });

  it("leaves a range null when only one of its two bounds is known", () => {
    const rows = toKeyStatRows(
      symbolDetailSchema.parse({ ...BASE, stats: { ...EMPTY_STATS, week52High: "299.2900" } }),
      LOCALE,
    );

    expect(rowValue(rows, "stats.week52Range")).toBeNull();
  });
});

describe("toTradeRow", () => {
  it("formats a buy trade for the history table", () => {
    const row = toTradeRow(tradeSchema.parse(TRADE), LOCALE);

    expect(row.id).toBe("trade-1");
    expect(row.sideKey).toBe("trades.side.BUY");
    expect(row.quantity).toBe("10");
    expect(row.price).toBe("$250.00");
    expect(row.amount).toBe("-$2,500.00");
    expect(row.amountTone).toBe("loss");
    expect(row.realizedPnl).toBeNull();
    expect(row.executedAt).toBe(
      new Intl.DateTimeFormat(LOCALE, { dateStyle: "short", timeStyle: "short" }).format(
        new Date("2026-09-08T14:31:00.000Z"),
      ),
    );
  });

  it("shows a sell amount as a positive cash movement", () => {
    const row = toTradeRow(tradeSchema.parse({ ...TRADE, side: "SELL" }), LOCALE);

    expect(row.amount).toBe("+$2,500.00");
    expect(row.amountTone).toBe("gain");
  });

  it("tones a realized profit as a gain", () => {
    const row = toTradeRow(tradeSchema.parse({ ...TRADE, side: "SELL", realizedPnl: "120.50" }), LOCALE);

    expect(row.sideKey).toBe("trades.side.SELL");
    expect(row.realizedPnl).toBe("+$120.50");
    expect(row.realizedTone).toBe("gain");
  });

  it("tones a realized loss as a loss", () => {
    const row = toTradeRow(tradeSchema.parse({ ...TRADE, side: "SELL", realizedPnl: "-40.00" }), LOCALE);

    expect(row.realizedPnl).toBe("-$40.00");
    expect(row.realizedTone).toBe("loss");
  });
});
