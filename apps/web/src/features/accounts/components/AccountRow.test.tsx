import { accountSummarySchema } from "@stockdesk/shared";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import { i18n } from "../../../i18n";
import { accountSummaryDto } from "../../../test/fixtures";
import { toAccountViewModel } from "../mappers";
import { AccountRow } from "./AccountRow";

const ACCOUNT = toAccountViewModel(
  accountSummarySchema.parse(
    accountSummaryDto({ dailyPnl: "125.40", dailyPnlPct: "0.13", buyingPower: "97436.33" }),
  ),
  "en-US",
);

const DEFICIT_ACCOUNT = toAccountViewModel(
  accountSummarySchema.parse(
    accountSummaryDto({ buyingPower: "0.00", shortValue: "5000.00", marginDeficit: true }),
  ),
  "en-US",
);

function renderDeficitRow() {
  return render(
    <I18nextProvider i18n={i18n}>
      <AccountRow account={DEFICIT_ACCOUNT} active={false} expanded onSelect={vi.fn()} onToggle={vi.fn()} />
    </I18nextProvider>,
  );
}

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

  it("shows the buying power of the account", () => {
    renderRow(false);

    expect(screen.getByText(i18n.t("accounts:row.buyingPower"))).toBeInTheDocument();
    expect(screen.getByText("$97,436.33")).toBeInTheDocument();
  });

  it("warns with a badge when the account is in a margin deficit", () => {
    renderDeficitRow();

    expect(screen.getByText(i18n.t("accounts:row.marginDeficit"))).toBeInTheDocument();
  });

  it("shows no margin warning on a healthy account", () => {
    renderRow(false);

    expect(screen.queryByText(i18n.t("accounts:row.marginDeficit"))).not.toBeInTheDocument();
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
