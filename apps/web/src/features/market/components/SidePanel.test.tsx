import { symbolDetailSchema, type SymbolDetailDto } from "@stockdesk/shared";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";

import { i18n } from "../../../i18n";
import { SidePanel } from "./SidePanel";

const DETAIL: SymbolDetailDto = {
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

function renderPanel() {
  return render(
    <I18nextProvider i18n={i18n}>
      <SidePanel detail={symbolDetailSchema.parse(DETAIL)} symbol="TSLA" />
    </I18nextProvider>,
  );
}

function click(name: string): void {
  fireEvent.click(screen.getByRole("button", { name }));
}

function orderSlot(): HTMLElement {
  return screen.getByRole("region", { name: i18n.t("market:orderSlot.title") });
}

describe("SidePanel", () => {
  it("shows the key statistics by default", () => {
    renderPanel();

    expect(screen.getByText(i18n.t("market:stats.title"))).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: i18n.t("market:orderSlot.title") })).not.toBeInTheDocument();
  });

  it("opens the order slot with the buy side and returns to the key statistics", () => {
    renderPanel();

    click(i18n.t("market:side.buy"));

    expect(within(orderSlot()).getByText(i18n.t("market:orderSlot.placeholder"))).toBeInTheDocument();
    expect(within(orderSlot()).getByText(i18n.t("market:trades.side.BUY"))).toBeInTheDocument();
    expect(screen.queryByText(i18n.t("market:stats.title"))).not.toBeInTheDocument();

    click(i18n.t("market:side.back"));

    expect(screen.getByText(i18n.t("market:stats.title"))).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: i18n.t("market:orderSlot.title") })).not.toBeInTheDocument();
  });

  it("opens the order slot with the sell side", () => {
    renderPanel();

    click(i18n.t("market:side.sell"));

    expect(within(orderSlot()).getByText(i18n.t("market:trades.side.SELL"))).toBeInTheDocument();
  });
});
