import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

interface LinkProps {
  to: string;
  children: ReactNode;
  className?: string;
  activeProps?: { className?: string };
}

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className, activeProps }: LinkProps) => (
    <a className={className} data-active-class={activeProps?.className ?? ""} href={to}>
      {children}
    </a>
  ),
}));

import { i18n } from "../../../i18n";
import { NavTabs } from "./NavTabs";

function renderTabs() {
  return render(
    <I18nextProvider i18n={i18n}>
      <NavTabs />
    </I18nextProvider>,
  );
}

describe("NavTabs", () => {
  it("links to the portfolio, reports and deposit routes", () => {
    renderTabs();

    expect(screen.getByRole("link", { name: i18n.t("shell:nav.portfolio") })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: i18n.t("shell:nav.reports") })).toHaveAttribute("href", "/reports");
    expect(screen.getByRole("link", { name: i18n.t("shell:nav.deposit") })).toHaveAttribute("href", "/deposit");
  });

  it("renders exactly three tabs", () => {
    renderTabs();

    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("hands every tab the active styling", () => {
    renderTabs();

    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("data-active-class")).toContain("border-foreground");
    }
  });
});
