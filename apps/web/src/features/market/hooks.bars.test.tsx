import type { ReactNode } from "react";
import { barsResponseSchema } from "@stockdesk/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  searchSymbols: vi.fn(),
  getSymbol: vi.fn(),
  getBars: vi.fn(),
  getMarketStatus: vi.fn(),
  getTrades: vi.fn(),
}));

vi.mock("./api", () => api);

import { useAuthStore } from "../auth/store";
import { useBars, useSymbolTrades } from "./hooks";
import { useMarketStore } from "./store";

const USER = {
  id: "user-1",
  email: "trader@example.com",
  displayName: "Ada Trader",
  createdAt: "2026-09-08T10:00:00.000Z",
};

const FIRST_PAGE = barsResponseSchema.parse({
  symbol: "TSLA",
  timeframe: "1m",
  bars: [
    {
      time: "2026-09-08T14:31:00.000Z",
      open: "251.10",
      high: "251.40",
      low: "251.05",
      close: "251.34",
      volume: "1200",
    },
  ],
  hasMore: true,
});

const OLDER_PAGE = barsResponseSchema.parse({
  symbol: "TSLA",
  timeframe: "1m",
  bars: [
    {
      time: "2026-09-08T14:30:00.000Z",
      open: "250.10",
      high: "250.40",
      low: "250.05",
      close: "250.34",
      volume: "800",
    },
  ],
  hasMore: false,
});

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useAuthStore.setState({ user: USER, accessToken: "token-1", status: "authenticated" });
  useMarketStore.getState().reset();
  api.getBars.mockResolvedValue(FIRST_PAGE);
  api.getTrades.mockResolvedValue({ trades: [], nextCursor: null });
});

describe("useBars", () => {
  it("puts the first page into the store and reports that older bars exist", async () => {
    const { result, unmount } = renderHook(() => useBars("TSLA", "1m"), { wrapper });

    await waitFor(() => {
      expect(result.current.bars).toHaveLength(1);
    });

    expect(result.current.hasMore).toBe(true);
    expect(api.getBars).toHaveBeenCalledWith("TSLA", "1m", {});

    unmount();
  });

  it("prepends the page before the oldest bar when loadOlder runs", async () => {
    const { result, unmount } = renderHook(() => useBars("TSLA", "1m"), { wrapper });

    await waitFor(() => {
      expect(result.current.bars).toHaveLength(1);
    });

    api.getBars.mockResolvedValue(OLDER_PAGE);

    await act(async () => {
      result.current.loadOlder();
    });

    await waitFor(() => {
      expect(result.current.bars.map((bar) => bar.time.toISOString())).toEqual([
        "2026-09-08T14:30:00.000Z",
        "2026-09-08T14:31:00.000Z",
      ]);
    });

    expect(api.getBars).toHaveBeenLastCalledWith("TSLA", "1m", { end: "2026-09-08T14:31:00.000Z" });
    expect(result.current.hasMore).toBe(false);

    unmount();
  });
});

describe("useSymbolTrades", () => {
  it("returns the empty trade page of the account and symbol", async () => {
    const { result } = renderHook(() => useSymbolTrades("acc-1", "TSLA"), { wrapper });

    await waitFor(() => {
      expect(result.current.trades).toEqual([]);
    });

    expect(api.getTrades).toHaveBeenCalledWith("acc-1", { symbol: "TSLA" });
    expect(result.current.nextCursor).toBeNull();
  });

  it("asks for the next page with the returned cursor", async () => {
    api.getTrades.mockResolvedValueOnce({ trades: [], nextCursor: "cur-2" });

    const { result } = renderHook(() => useSymbolTrades("acc-1", "TSLA"), { wrapper });

    await waitFor(() => {
      expect(result.current.nextCursor).toBe("cur-2");
    });

    await act(async () => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(api.getTrades).toHaveBeenLastCalledWith("acc-1", { symbol: "TSLA", cursor: "cur-2" });
    });
  });
});
