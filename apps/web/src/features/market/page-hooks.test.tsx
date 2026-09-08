import type { ReactNode } from "react";
import { positionsResponseSchema, symbolDetailSchema, type SymbolDetailDto } from "@stockdesk/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const marketApi = vi.hoisted(() => ({
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

vi.mock("./api", () => marketApi);
vi.mock("../accounts/api", () => accountsApi);
vi.mock("./subscriptions", () => subscriptions);

import { useAccountsStore } from "../accounts/store";
import { useAuthStore } from "../auth/store";
import { CHART_PREFS_STORAGE_KEY } from "./chart-prefs";
import { useChartPrefs, useSidePanel, useSymbolPage, useSymbolPosition } from "./page-hooks";
import { useMarketStore } from "./store";

const USER = {
  id: "user-1",
  email: "trader@example.com",
  displayName: "Ada Trader",
  createdAt: "2026-09-08T10:00:00.000Z",
};

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

const POSITIONS = positionsResponseSchema.parse({
  positions: [
    {
      symbol: "TSLA",
      quantity: "10",
      averageCost: "240.0000",
      lastPrice: "251.3400",
      marketValue: "2513.40",
      unrealizedPnl: "113.40",
      unrealizedPnlPct: "4.73",
      dailyChange: "24.40",
      dailyChangePct: "0.98",
    },
    {
      symbol: "AAPL",
      quantity: "5",
      averageCost: "180.0000",
      lastPrice: "190.0000",
      marketValue: "950.00",
      unrealizedPnl: "50.00",
      unrealizedPnlPct: "5.56",
      dailyChange: "5.00",
      dailyChangePct: "0.53",
    },
  ],
});

const ACCOUNT = {
  id: "account-1",
  name: "Main",
  cash: "1000.00",
  positionsValue: "0.00",
  equity: "1000.00",
  unrealizedPnl: "0.00",
  unrealizedPnlPct: "0.00",
  dailyPnl: "0.00",
  dailyPnlPct: "0.00",
  createdAt: "2026-09-01T10:00:00.000Z",
};

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useAuthStore.setState({ user: USER, accessToken: "token-1", status: "authenticated" });
  useAccountsStore.getState().reset();
  useMarketStore.getState().reset();
  marketApi.getSymbol.mockResolvedValue(symbolDetailSchema.parse(DETAIL));
  marketApi.getMarketStatus.mockResolvedValue({ status: "open", nextOpenAt: null, nextCloseAt: null });
  accountsApi.getPositions.mockResolvedValue(POSITIONS);
});

describe("useSymbolPage", () => {
  it("builds the header from the loaded detail", async () => {
    const { result } = renderHook(() => useSymbolPage("TSLA"), { wrapper });

    await waitFor(() => {
      expect(result.current.header).not.toBeNull();
    });

    expect(result.current.header?.priceText).toBe("$251.34");
    expect(result.current.header?.direction).toBe("gain");
    expect(result.current.isLoading).toBe(false);
  });

  it("has no header while the detail is still loading", () => {
    const { result } = renderHook(() => useSymbolPage("TSLA"), { wrapper });

    expect(result.current.header).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it("lets a live quote override the detail price", async () => {
    const { result } = renderHook(() => useSymbolPage("TSLA"), { wrapper });

    await waitFor(() => {
      expect(result.current.header).not.toBeNull();
    });

    act(() => {
      useMarketStore.getState().applyQuote({
        type: "quote",
        symbol: "TSLA",
        price: "260.0000",
        size: "100",
        at: "2026-09-08T14:35:00.000Z",
        prevClose: "248.9000",
      });
    });

    expect(result.current.header?.priceText).toBe("$260.00");
  });

  it("exposes the market status of the page", async () => {
    const { result } = renderHook(() => useSymbolPage("TSLA"), { wrapper });

    await waitFor(() => {
      expect(result.current.marketStatus?.status).toBe("open");
    });
  });
});

describe("useChartPrefs", () => {
  it("starts from the stored device preference", () => {
    window.localStorage.setItem(
      CHART_PREFS_STORAGE_KEY,
      JSON.stringify({ interval: "5m", chartType: "line" }),
    );

    const { result } = renderHook(() => useChartPrefs());

    expect(result.current.interval).toBe("5m");
    expect(result.current.chartType).toBe("line");
  });

  it("persists a new interval and chart type", () => {
    const { result } = renderHook(() => useChartPrefs());

    act(() => {
      result.current.setInterval("1h");
    });
    act(() => {
      result.current.setChartType("line");
    });

    expect(result.current.interval).toBe("1h");
    expect(window.localStorage.getItem(CHART_PREFS_STORAGE_KEY)).toBe(
      JSON.stringify({ interval: "1h", chartType: "line" }),
    );
  });
});

describe("useSidePanel", () => {
  it("starts on the key statistics", () => {
    const { result } = renderHook(() => useSidePanel());

    expect(result.current.mode).toBe("stats");
    expect(result.current.side).toBeNull();
  });

  it("opens the order slot with the chosen side and returns on back", () => {
    const { result } = renderHook(() => useSidePanel());

    act(() => {
      result.current.openOrder("SELL");
    });

    expect(result.current.mode).toBe("order");
    expect(result.current.side).toBe("SELL");

    act(() => {
      result.current.back();
    });

    expect(result.current.mode).toBe("stats");
    expect(result.current.side).toBeNull();
  });
});

describe("useSymbolPosition", () => {
  beforeEach(() => {
    useAccountsStore.getState().setAccounts([ACCOUNT]);
  });

  it("returns the active account position of this symbol", async () => {
    const { result } = renderHook(() => useSymbolPosition("TSLA"), { wrapper });

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    expect(result.current?.symbol).toBe("TSLA");
    expect(result.current?.marketValue).toBe("$2,513.40");
  });

  it("returns null for a symbol the account does not hold", async () => {
    const { result } = renderHook(() => useSymbolPosition("MSFT"), { wrapper });

    await waitFor(() => {
      expect(accountsApi.getPositions).toHaveBeenCalled();
    });

    expect(result.current).toBeNull();
  });
});
