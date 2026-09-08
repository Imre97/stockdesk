import { accountSummarySchema } from "@stockdesk/shared";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import { i18n } from "../../../i18n";
import { toAccountViewModel } from "../mappers";
import { AccountRow } from "./AccountRow";

const ACCOUNT = toAccountViewModel(
  accountSummarySchema.parse({
    id: "acc-1",
    name: "Main",
    cash: "100000.00",
    positionsValue: "0.00",
    equity: "100000.00",
    unrealizedPnl: "0.00",
    unrealizedPnlPct: "0.00",
    dailyPnl: "125.40",
    dailyPnlPct: "0.13",
    createdAt: "2026-09-08T10:00:00.000Z",
  }),
  "en-US",
);

function renderRow(active: boolean) {
  return render(
    <I18nextProvider i18n={i18n}>
      <AccountRow account={ACCOUNT} active={active} expanded onSelect={vi.fn()} onToggle={vi.fn()} />
    </I18nextProvider>,
  );
}

describe("AccountRow", () => {
  it("renders the account name and the formatted figures", () => {
    renderRow(false);

    expect(screen.getByText("Main")).toBeInTheDocument();
    expect(screen.getByText("$100,000.00")).toBeInTheDocument();
    expect(screen.getByText("+$125.40")).toBeInTheDocument();
    expect(screen.getByText(i18n.t("accounts:row.equity"))).toBeInTheDocument();
  });

  it("colors the daily result with the semantic gain token", () => {
    renderRow(false);

    expect(screen.getByText("+$125.40")).toHaveClass("text-gain");
  });

  it("marks the selected row as the current account", () => {
    renderRow(true);

    expect(screen.getByRole("button", { name: /Main/ })).toHaveAttribute("aria-current", "true");
  });

  it("leaves an inactive row without the current marker", () => {
    renderRow(false);

    expect(screen.getByRole("button", { name: /Main/ })).toHaveAttribute("aria-current", "false");
  });
});
