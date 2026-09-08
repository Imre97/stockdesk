import { positionSchema } from "@stockdesk/shared";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";

import { i18n } from "../../../i18n";
import { toPositionViewModel } from "../mappers";
import { PositionsTable } from "./PositionsTable";

const ROW = toPositionViewModel(
  positionSchema.parse({
    symbol: "AAPL",
    quantity: "10",
    averageCost: "180.2500",
    lastPrice: "182.1000",
    marketValue: "1821.00",
    unrealizedPnl: "18.50",
    unrealizedPnlPct: "1.03",
    dailyChange: "-4.20",
    dailyChangePct: "-0.23",
  }),
  "en-US",
);

const COLUMN_KEYS = [
  "positions.symbol",
  "positions.quantity",
  "positions.averageCost",
  "positions.lastPrice",
  "positions.marketValue",
  "positions.unrealizedPnl",
  "positions.unrealizedPnlPct",
  "positions.dailyChange",
  "positions.dailyChangePct",
];

function renderTable(rows: typeof ROW[]) {
  return render(
    <I18nextProvider i18n={i18n}>
      <PositionsTable rows={rows} />
    </I18nextProvider>,
  );
}

describe("PositionsTable", () => {
  it("renders the empty state when the account has no positions", () => {
    renderTable([]);

    expect(screen.getByText(i18n.t("dashboard:positions.empty"))).toBeInTheDocument();
    expect(screen.queryByRole("row")).not.toBeInTheDocument();
  });

  it("renders the full column set for a fixture row", () => {
    renderTable([ROW]);

    for (const key of COLUMN_KEYS) {
      expect(screen.getByRole("columnheader", { name: i18n.t(`dashboard:${key}`) })).toBeInTheDocument();
    }

    expect(screen.getByRole("cell", { name: "AAPL" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "$1,821.00" })).toBeInTheDocument();
  });

  it("colors the profit and loss cells with the semantic tokens", () => {
    renderTable([ROW]);

    expect(screen.getByRole("cell", { name: "+$18.50" })).toHaveClass("text-gain");
    expect(screen.getByRole("cell", { name: "-$4.20" })).toHaveClass("text-loss");
  });
});
