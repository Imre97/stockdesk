import { symbolDetailSchema, type SymbolDetailDto } from "@stockdesk/shared";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";

import { i18n } from "../../../i18n";
import { KeyStats } from "./KeyStats";

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
    dividendYield: null,
  },
};

function renderStats(detail: SymbolDetailDto) {
  return render(
    <I18nextProvider i18n={i18n}>
      <KeyStats detail={symbolDetailSchema.parse(detail)} />
    </I18nextProvider>,
  );
}

describe("KeyStats", () => {
  it("shows the market cap in compact notation", () => {
    renderStats(BASE);

    expect(screen.getByText(i18n.t("market:stats.marketCap"))).toBeInTheDocument();
    expect(screen.getByText("800B")).toBeInTheDocument();
    expect(screen.getByText("51.23M")).toBeInTheDocument();
  });

  it("shows the day range and the previous close", () => {
    renderStats(BASE);

    expect(screen.getByText("$248.10 – $252.00")).toBeInTheDocument();
    expect(screen.getByText("$248.90")).toBeInTheDocument();
  });

  it("renders the missing marker for every null field", () => {
    renderStats({
      ...BASE,
      quote: null,
      stats: {
        marketCap: null,
        sharesOutstanding: null,
        peRatio: null,
        week52High: null,
        week52Low: null,
        beta: null,
        dividendYield: null,
      },
    });

    expect(screen.getAllByText(i18n.t("market:stats.missing"))).toHaveLength(9);
  });

  it("renders the dividend yield fraction as a percentage", () => {
    renderStats({ ...BASE, stats: { ...BASE.stats, dividendYield: "0.0130" } });

    expect(screen.getByText("1.30%")).toBeInTheDocument();
  });

  it("renders the missing marker only for the dividend yield of a complete symbol", () => {
    renderStats(BASE);

    expect(screen.getAllByText(i18n.t("market:stats.missing"))).toHaveLength(1);
  });
});
