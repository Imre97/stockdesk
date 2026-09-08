import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";

import { i18n } from "../../../i18n";
import type { SymbolHeaderView } from "../header-mappers";
import { SymbolHeader } from "./SymbolHeader";

const VIEW: SymbolHeaderView = {
  symbol: "TSLA",
  name: "Tesla, Inc.",
  exchange: "NASDAQ",
  priceText: "$251.34",
  changeText: "+$2.44",
  changePctText: "0.98%",
  direction: "gain",
  asOfText: "4:30 PM",
};

function renderHeader(view: SymbolHeaderView | null) {
  return render(
    <I18nextProvider i18n={i18n}>
      <SymbolHeader view={view} />
    </I18nextProvider>,
  );
}

describe("SymbolHeader", () => {
  it("shows the identity, the price and the change of the symbol", () => {
    renderHeader(VIEW);

    expect(screen.getByRole("heading", { name: /TSLA/ })).toBeInTheDocument();
    expect(screen.getByText("Tesla, Inc.")).toBeInTheDocument();
    expect(screen.getByText("NASDAQ")).toBeInTheDocument();
    expect(screen.getByText("$251.34")).toBeInTheDocument();
    expect(screen.getByText("+$2.44")).toHaveClass("text-gain");
  });

  it("colors a falling price with the loss token", () => {
    renderHeader({ ...VIEW, changeText: "-$8.90", changePctText: "-3.58%", direction: "loss" });

    expect(screen.getByText("-$8.90")).toHaveClass("text-loss");
  });

  it("renders a skeleton while the detail is missing", () => {
    const { container } = renderHeader(null);

    expect(container.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);
    expect(screen.queryByText("$251.34")).not.toBeInTheDocument();
  });
});
