import { Decimal, symbolDetailSchema, type SymbolDetailDto } from "@stockdesk/shared";
import { describe, expect, it } from "vitest";

import { toSymbolHeaderView } from "./header-mappers";
import type { QuoteTick } from "./mappers";

const LOCALE = "en-US";

const BASE_QUOTE = {
  last: "251.3400",
  prevClose: "248.9000",
  open: "249.5000",
  high: "252.0000",
  low: "248.1000",
  volume: "51234000",
  change: "2.4400",
  changePct: "0.98",
  at: "2026-09-08T14:30:01.123Z",
};

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
  quote: BASE_QUOTE,
  stats: {
    marketCap: "800000000000.00",
    sharesOutstanding: "3180000000",
    peRatio: "65.20",
    week52High: "299.2900",
    week52Low: "138.8000",
    beta: "2.05",
    dividendYield: null,
  },
};

function detail(overrides: Partial<SymbolDetailDto> = {}) {
  return symbolDetailSchema.parse({ ...BASE, ...overrides });
}

function tick(price: string, prevClose: string | null, at = "2026-09-08T14:35:00.000Z"): QuoteTick {
  return {
    symbol: "TSLA",
    price: new Decimal(price),
    size: new Decimal("100"),
    at: new Date(at),
    prevClose: prevClose === null ? null : new Decimal(prevClose),
  };
}

function expectedTime(at: string): string {
  return new Intl.DateTimeFormat(LOCALE, { timeStyle: "short" }).format(new Date(at));
}

describe("toSymbolHeaderView", () => {
  it("carries the identity of the symbol", () => {
    const view = toSymbolHeaderView(detail(), null, LOCALE);

    expect(view.symbol).toBe("TSLA");
    expect(view.name).toBe("Tesla, Inc.");
    expect(view.exchange).toBe("NASDAQ");
  });

  it("uses the detail quote when no live tick arrived yet", () => {
    const view = toSymbolHeaderView(detail(), null, LOCALE);

    expect(view.priceText).toBe("$251.34");
    expect(view.changeText).toBe("+$2.44");
    expect(view.changePctText).toBe("0.98%");
    expect(view.direction).toBe("gain");
    expect(view.asOfText).toBe(expectedTime("2026-09-08T14:30:01.123Z"));
  });

  it("lets the live quote override the detail price", () => {
    const view = toSymbolHeaderView(detail(), tick("260.0000", "248.9000"), LOCALE);

    expect(view.priceText).toBe("$260.00");
    expect(view.changeText).toBe("+$11.10");
    expect(view.asOfText).toBe(expectedTime("2026-09-08T14:35:00.000Z"));
  });

  it("falls back to the detail previous close when the live tick has none", () => {
    const view = toSymbolHeaderView(detail(), tick("260.0000", null), LOCALE);

    expect(view.changeText).toBe("+$11.10");
    expect(view.direction).toBe("gain");
  });

  it("yields null texts when neither a detail quote nor a live tick exists", () => {
    const view = toSymbolHeaderView(detail({ quote: null }), null, LOCALE);

    expect(view.priceText).toBeNull();
    expect(view.changeText).toBeNull();
    expect(view.changePctText).toBeNull();
    expect(view.asOfText).toBeNull();
    expect(view.direction).toBeNull();
  });

  it("reports a loss direction for a price below the previous close", () => {
    const view = toSymbolHeaderView(detail(), tick("240.0000", "248.9000"), LOCALE);

    expect(view.changeText).toBe("-$8.90");
    expect(view.direction).toBe("loss");
  });

  it("reports a flat direction for a price equal to the previous close", () => {
    const view = toSymbolHeaderView(detail(), tick("248.9000", "248.9000"), LOCALE);

    expect(view.direction).toBe("flat");
  });

  it("has no direction when the previous close is unknown", () => {
    const view = toSymbolHeaderView(detail({ quote: { ...BASE_QUOTE, prevClose: null } }), null, LOCALE);

    expect(view.priceText).toBe("$251.34");
    expect(view.changeText).toBeNull();
    expect(view.direction).toBeNull();
  });
});
