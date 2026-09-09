import type { ReactNode } from "react";
import { symbolDetailSchema } from "@stockdesk/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ordersApi = vi.hoisted(() => ({ previewOrder: vi.fn(), placeOrder: vi.fn() }));

const marketApi = vi.hoisted(() => ({
  searchSymbols: vi.fn(),
  getSymbol: vi.fn(),
  getBars: vi.fn(),
  getMarketStatus: vi.fn(),
  getTrades: vi.fn(),
}));

const subscriptions = vi.hoisted(() => ({
  subscribeQuote: vi.fn(() => () => undefined),
  subscribeBars: vi.fn(() => () => undefined),
}));

interface LinkProps {
  to: string;
  children: ReactNode;
  className?: string;
}

vi.mock("../../orders/api", () => ordersApi);
vi.mock("../api", () => marketApi);
vi.mock("../subscriptions", () => subscriptions);
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className }: LinkProps) => (
    <a className={className} href={to}>
      {children}
    </a>
  ),
}));

import { i18n } from "../../../i18n";
import { accountSummaryDto, orderPreviewDto, symbolDetailDto } from "../../../test/fixtures";
import { MARKET_OPEN, resetOrderPanelStores } from "../../../test/order-panel";
import { SidePanel } from "./SidePanel";

const DETAIL = symbolDetailDto();

let queryClient: QueryClient;

function renderPanel() {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <SidePanel detail={symbolDetailSchema.parse(DETAIL)} symbol="TSLA" />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

function click(name: string): void {
  fireEvent.click(screen.getByRole("button", { name }));
}

function orderSlot(): HTMLElement {
  return screen.getByRole("region", { name: i18n.t("market:orderSlot.title") });
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  resetOrderPanelStores([accountSummaryDto()]);
  marketApi.getSymbol.mockResolvedValue(symbolDetailSchema.parse(DETAIL));
  marketApi.getMarketStatus.mockResolvedValue(MARKET_OPEN);
  ordersApi.previewOrder.mockResolvedValue(orderPreviewDto());
});

describe("SidePanel", () => {
  it("shows the key statistics by default", () => {
    renderPanel();

    expect(screen.getByText(i18n.t("market:stats.title"))).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: i18n.t("market:orderSlot.title") })).not.toBeInTheDocument();
  });

  it("opens the order slot with the buy side and returns to the key statistics", () => {
    renderPanel();

    click(i18n.t("market:side.buy"));

    expect(
      within(orderSlot()).getByRole("button", { name: i18n.t("market:trades.side.BUY") }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(i18n.t("market:stats.title"))).not.toBeInTheDocument();

    click(i18n.t("market:side.back"));

    expect(screen.getByText(i18n.t("market:stats.title"))).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: i18n.t("market:orderSlot.title") })).not.toBeInTheDocument();
  });

  it("opens the order slot with the sell side", () => {
    renderPanel();

    click(i18n.t("market:side.sell"));

    expect(
      within(orderSlot()).getByRole("button", { name: i18n.t("market:trades.side.SELL") }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
