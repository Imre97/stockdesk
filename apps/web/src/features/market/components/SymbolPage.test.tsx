import type { ReactNode } from "react";
import { barsResponseSchema, ordersResponseSchema, symbolDetailSchema, type SymbolDetailDto } from "@stockdesk/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const lightweightCharts = vi.hoisted(() => {
  function makeSeries() {
    return { setData: vi.fn(), update: vi.fn(), applyOptions: vi.fn() };
  }

  return {
    CandlestickSeries: { seriesType: "Candlestick" },
    LineSeries: { seriesType: "Line" },
    HistogramSeries: { seriesType: "Histogram" },
    ColorType: { Solid: "solid" },
    createChart: vi.fn(() => ({
      addSeries: vi.fn(() => makeSeries()),
      removeSeries: vi.fn(),
      applyOptions: vi.fn(),
      priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
      timeScale: vi.fn(() => ({
        fitContent: vi.fn(),
        subscribeVisibleLogicalRangeChange: vi.fn(),
        unsubscribeVisibleLogicalRangeChange: vi.fn(),
      })),
      remove: vi.fn(),
    })),
  };
});

const api = vi.hoisted(() => ({
  searchSymbols: vi.fn(),
  getSymbol: vi.fn(),
  getBars: vi.fn(),
  getMarketStatus: vi.fn(),
  getTrades: vi.fn(),
}));

const accountsApi = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  createAccount: vi.fn(),
  renameAccount: vi.fn(),
  getEquity: vi.fn(),
  getPositions: vi.fn(),
}));

const subscriptions = vi.hoisted(() => ({
  subscribeQuote: vi.fn(() => () => undefined),
  subscribeBars: vi.fn(() => () => undefined),
}));

const ordersApi = vi.hoisted(() => ({
  previewOrder: vi.fn(),
  placeOrder: vi.fn(),
  listOrders: vi.fn(),
  listAccountOrders: vi.fn(),
  getOrder: vi.fn(),
  modifyOrder: vi.fn(),
  cancelOrder: vi.fn(),
}));

vi.mock("lightweight-charts", () => lightweightCharts);
vi.mock("../api", () => api);
vi.mock("../../accounts/api", () => accountsApi);
vi.mock("../subscriptions", () => subscriptions);
vi.mock("../../orders/api", () => ordersApi);

import { i18n } from "../../../i18n";
import { accountSummaryDto, orderDto } from "../../../test/fixtures";
import { useAccountsStore } from "../../accounts/store";
import { useAuthStore } from "../../auth/store";
import { useOrdersStore } from "../../orders/store";
import { useMarketStore } from "../store";
import { SymbolPage } from "./SymbolPage";

const USER = {
  id: "user-1",
  email: "trader@example.com",
  displayName: "Ada Trader",
  createdAt: "2026-09-08T10:00:00.000Z",
};

const ACCOUNT = accountSummaryDto({
  id: "account-1",
  cash: "1000.00",
  equity: "1000.00",
  createdAt: "2026-09-01T10:00:00.000Z",
});

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

const SAVINGS = accountSummaryDto({
  id: "account-2",
  name: "Savings",
  createdAt: "2026-09-02T10:00:00.000Z",
});

const MAIN_ORDER = orderDto({ id: "order-1", accountId: "account-1", symbol: "TSLA" });
const SAVINGS_ORDER = orderDto({ id: "order-2", accountId: "account-2", symbol: "TSLA" });

function ordersPage(orders: ReturnType<typeof orderDto>[]) {
  return ordersResponseSchema.parse({ orders, nextCursor: null });
}

function orderRow(orderId: string): Element | null {
  return document.querySelector(`[data-order-id="${orderId}"]`);
}

const EMPTY_BARS = barsResponseSchema.parse({
  symbol: "TSLA",
  timeframe: "1D",
  bars: [],
  hasMore: false,
});

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </I18nextProvider>
  );
}

function renderPage() {
  return render(<SymbolPage symbol="TSLA" />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useAuthStore.setState({ user: USER, accessToken: "token-1", status: "authenticated" });
  useAccountsStore.getState().reset();
  useAccountsStore.getState().setAccounts([ACCOUNT]);
  useMarketStore.getState().reset();
  api.getSymbol.mockResolvedValue(symbolDetailSchema.parse(DETAIL));
  api.getBars.mockResolvedValue(EMPTY_BARS);
  api.getMarketStatus.mockResolvedValue({ status: "open", nextOpenAt: null, nextCloseAt: null });
  api.getTrades.mockResolvedValue({ trades: [], nextCursor: null });
  accountsApi.getPositions.mockResolvedValue({ positions: [] });
  useOrdersStore.getState().reset();
  ordersApi.listAccountOrders.mockResolvedValue(ordersPage([]));
  ordersApi.listOrders.mockResolvedValue(ordersPage([]));
});

describe("SymbolPage", () => {
  it("renders the header price of the symbol", async () => {
    renderPage();

    expect(await screen.findByText("$251.34")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /TSLA/ })).toBeInTheDocument();
    expect(screen.getByText("Tesla, Inc.")).toBeInTheDocument();
    expect(screen.getByText("+$2.44")).toBeInTheDocument();
  });

  it("renders the interval selector with the stored default pressed", async () => {
    renderPage();

    await screen.findByText("$251.34");

    expect(screen.getByRole("button", { name: i18n.t("market:interval.1D") })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: i18n.t("market:interval.1m") })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: i18n.t("market:chartType.candle") })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("renders the key statistics of the symbol", async () => {
    renderPage();

    expect(await screen.findByText("800B")).toBeInTheDocument();
    expect(screen.getByText("51.23M")).toBeInTheDocument();
    expect(screen.getByText("$248.10 – $252.00")).toBeInTheDocument();
  });

  it("renders the empty position and trade history states", async () => {
    renderPage();

    expect(await screen.findByText(i18n.t("market:position.empty"))).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: i18n.t("market:tabs.trades") }));

    await waitFor(() => {
      expect(screen.getByText(i18n.t("market:trades.empty"))).toBeInTheDocument();
    });
  });

  it("reloads the bars when another interval is chosen", async () => {
    renderPage();

    await screen.findByText("$251.34");

    fireEvent.click(screen.getByRole("button", { name: i18n.t("market:interval.5m") }));

    await waitFor(() => {
      expect(api.getBars).toHaveBeenCalledWith("TSLA", "5m", {});
    });

    expect(subscriptions.subscribeBars).toHaveBeenCalledWith("TSLA", "5m");
  });

  it("lists this symbol's orders for the active account in the orders tab", async () => {
    ordersApi.listAccountOrders.mockResolvedValue(ordersPage([MAIN_ORDER]));

    renderPage();

    await screen.findByText("$251.34");

    fireEvent.mouseDown(screen.getByRole("tab", { name: i18n.t("market:tabs.orders") }));

    await waitFor(() => {
      expect(ordersApi.listAccountOrders).toHaveBeenCalledWith("account-1", {
        status: "all",
        symbol: "TSLA",
      });
    });

    await waitFor(() => {
      expect(orderRow("order-1")).not.toBeNull();
    });

    const row = orderRow("order-1");

    expect(row?.textContent).toContain(i18n.t("orders:status.OPEN"));
    expect(row?.textContent).toContain("TSLA");
  });

  it("changes the order rows when the active account changes", async () => {
    useAccountsStore.getState().setAccounts([ACCOUNT, SAVINGS]);
    ordersApi.listAccountOrders.mockImplementation((accountId: string) =>
      Promise.resolve(ordersPage(accountId === "account-1" ? [MAIN_ORDER] : [SAVINGS_ORDER])),
    );

    renderPage();

    await screen.findByText("$251.34");

    fireEvent.mouseDown(screen.getByRole("tab", { name: i18n.t("market:tabs.orders") }));

    await waitFor(() => {
      expect(orderRow("order-1")).not.toBeNull();
    });

    act(() => useAccountsStore.getState().setActiveAccount("account-2"));

    await waitFor(() => {
      expect(orderRow("order-2")).not.toBeNull();
    });

    expect(orderRow("order-1")).toBeNull();
  });

  it("names the browser tab after the symbol", async () => {
    renderPage();

    await screen.findByText("$251.34");

    expect(document.title).toBe(i18n.t("market:page.title", { symbol: "TSLA" }));
  });
});
