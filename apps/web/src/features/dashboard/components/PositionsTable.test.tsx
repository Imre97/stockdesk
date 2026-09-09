import { positionSchema } from "@stockdesk/shared";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";

import { i18n } from "../../../i18n";
import { positionDto } from "../../../test/fixtures";
import { toPositionViewModel } from "../mappers";
import { PositionsTable } from "./PositionsTable";

const ROW = toPositionViewModel(positionSchema.parse(positionDto()), "en-US");

const SHORT_ROW = toPositionViewModel(
  positionSchema.parse(
    positionDto({
      symbol: "TSLA",
      quantity: "-10.000000",
      averageCost: "250.0000",
      lastPrice: "240.0000",
      marketValue: "-2400.00",
      unrealizedPnl: "100.00",
      unrealizedPnlPct: "4.00",
      dailyChange: "50.00",
      dailyChangePct: "2.04",
    }),
  ),
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

  it("marks a short row with the badge and the signed quantity", () => {
    renderTable([SHORT_ROW]);

    expect(screen.getByText(i18n.t("dashboard:positions.short"))).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "-10" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "-$2,400.00" })).toBeInTheDocument();
  });

  it("shows no short badge on a long row", () => {
    renderTable([ROW]);

    expect(screen.queryByText(i18n.t("dashboard:positions.short"))).not.toBeInTheDocument();
  });

  it("colors the profit and loss cells with the semantic tokens", () => {
    renderTable([ROW]);

    expect(screen.getByRole("cell", { name: "+$18.50" })).toHaveClass("text-gain");
    expect(screen.getByRole("cell", { name: "-$4.20" })).toHaveClass("text-loss");
  });
});
