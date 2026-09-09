import type { ReactNode } from "react";
import { QUOTE_SUBSCRIPTION_LIMIT, positionsResponseSchema } from "@stockdesk/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const accountsApi = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  createAccount: vi.fn(),
  renameAccount: vi.fn(),
  getEquity: vi.fn(),
  getPositions: vi.fn(),
}));

const subscriptions = vi.hoisted(() => {
  const live = new Set<string>();

  return {
    live,
    subscribeQuote: vi.fn((symbol: string) => {
      live.add(symbol);

      return () => live.delete(symbol);
    }),
    subscribeBars: vi.fn(() => () => undefined),
  };
});

vi.mock("../accounts/api", () => accountsApi);
vi.mock("../market/subscriptions", () => subscriptions);

import { positionDto, positionRecordDto } from "../../test/fixtures";
import { useAuthStore } from "../auth/store";
import { useMarketStore } from "../market/store";
import {
  usePosition,
  usePositionQuantity,
  usePositionRows,
  usePositions,
  usePositionsQuoteSubscription,
} from "./hooks";
import { usePositionsStore } from "./store";

const USER = {
  id: "user-1",
  email: "trader@example.com",
  displayName: "Ada Trader",
  createdAt: "2026-09-08T10:00:00.000Z",
};

const POSITIONS = positionsResponseSchema.parse({
  positions: [
    positionDto({ symbol: "TSLA", quantity: "10.000000", averageCost: "240.0000" }),
    positionDto({ symbol: "AAPL", quantity: "5.000000", averageCost: "180.0000" }),
  ],
});

const OTHER_POSITIONS = positionsResponseSchema.parse({
  positions: [positionDto({ symbol: "MSFT", quantity: "2.000000", averageCost: "400.0000" })],
});

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function positionUpdate(overrides: Parameters<typeof positionRecordDto>[0]) {
  return { type: "position_update" as const, position: positionRecordDto(overrides) };
}

beforeEach(() => {
  vi.clearAllMocks();
  subscriptions.live.clear();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useAuthStore.setState({ user: USER, accessToken: "token-1", status: "authenticated" });
  usePositionsStore.getState().reset();
  useMarketStore.getState().reset();
  accountsApi.getPositions.mockImplementation((accountId: string) =>
    Promise.resolve(accountId === "acc-2" ? OTHER_POSITIONS : POSITIONS),
  );
});

describe("usePositions", () => {
  it("loads the positions of an account once and stores them", async () => {
    const { rerender } = renderHook(({ accountId }: { accountId: string }) => usePositions(accountId), {
      initialProps: { accountId: "acc-1" },
      wrapper,
    });

    await waitFor(() => {
      expect(usePositionsStore.getState().statusByAccount["acc-1"]).toBe("loaded");
    });

    rerender({ accountId: "acc-1" });

    expect(accountsApi.getPositions).toHaveBeenCalledTimes(1);
    expect(accountsApi.getPositions).toHaveBeenCalledWith("acc-1");
  });

  it("loads the next account it is asked for", async () => {
    const { rerender } = renderHook(({ accountId }: { accountId: string }) => usePositions(accountId), {
      initialProps: { accountId: "acc-1" },
      wrapper,
    });

    await waitFor(() => {
      expect(usePositionsStore.getState().statusByAccount["acc-1"]).toBe("loaded");
    });

    rerender({ accountId: "acc-2" });

    await waitFor(() => {
      expect(usePositionsStore.getState().statusByAccount["acc-2"]).toBe("loaded");
    });

    expect(accountsApi.getPositions).toHaveBeenCalledTimes(2);
    expect(Object.keys(usePositionsStore.getState().positionsByAccount["acc-2"] ?? {})).toEqual(["MSFT"]);
  });

  it("does not call the api without an account", () => {
    renderHook(() => usePositions(null), { wrapper });

    expect(accountsApi.getPositions).not.toHaveBeenCalled();
  });
});

describe("usePositionRows", () => {
  it("values the stored positions through the market store quotes", () => {
    act(() => {
      usePositionsStore.getState().setPositions("acc-1", POSITIONS.positions);
      useMarketStore.getState().applyQuote({
        type: "quote",
        symbol: "TSLA",
        price: "251.3400",
        size: "100",
        at: "2026-09-08T14:30:01.123Z",
        prevClose: "248.9000",
      });
    });

    const { result } = renderHook(() => usePositionRows("acc-1"), { wrapper });

    expect(result.current.map((row) => row.symbol)).toEqual(["AAPL", "TSLA"]);
    expect(result.current[1]?.lastPrice).toBe("$251.34");
    expect(result.current[1]?.marketValue).toBe("$2,513.40");
    expect(result.current[1]?.unrealizedPnl).toBe("+$113.40");
  });

  it("re-values a row when a new tick arrives", () => {
    act(() => usePositionsStore.getState().setPositions("acc-1", POSITIONS.positions));

    const { result } = renderHook(() => usePositionRows("acc-1"), { wrapper });

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

    expect(result.current[1]?.lastPrice).toBe("$260.00");
  });

  it("returns no rows without an account", () => {
    const { result } = renderHook(() => usePositionRows(null), { wrapper });

    expect(result.current).toEqual([]);
  });
});

describe("usePosition", () => {
  it("returns the row of one symbol and null for a symbol the account does not hold", () => {
    act(() => usePositionsStore.getState().setPositions("acc-1", POSITIONS.positions));

    const held = renderHook(() => usePosition("acc-1", "tsla"), { wrapper });
    const missing = renderHook(() => usePosition("acc-1", "MSFT"), { wrapper });

    expect(held.result.current?.symbol).toBe("TSLA");
    expect(missing.result.current).toBeNull();
  });
});

describe("usePositionQuantity", () => {
  it("returns the signed quantity of the held symbol and zero for an unheld one", () => {
    act(() => usePositionsStore.getState().setPositions("acc-1", POSITIONS.positions));

    const held = renderHook(() => usePositionQuantity("acc-1", "tsla"), { wrapper });
    const missing = renderHook(() => usePositionQuantity("acc-1", "MSFT"), { wrapper });

    expect(held.result.current.toString()).toBe("10");
    expect(missing.result.current.toString()).toBe("0");
  });

  it("returns zero without an account", () => {
    const { result } = renderHook(() => usePositionQuantity(null, "TSLA"), { wrapper });

    expect(result.current.toString()).toBe("0");
  });
});

describe("usePositionsQuoteSubscription", () => {
  it("subscribes the quote of every open position and follows a close", () => {
    act(() => usePositionsStore.getState().setPositions("acc-1", POSITIONS.positions));

    const { unmount } = renderHook(() => usePositionsQuoteSubscription("acc-1"), { wrapper });

    expect([...subscriptions.live].sort()).toEqual(["AAPL", "TSLA"]);

    act(() =>
      usePositionsStore
        .getState()
        .applyPositionUpdate(
          positionUpdate({ accountId: "acc-1", symbol: "TSLA", quantity: "0.000000", closedAt: "2026-09-08T15:00:00.000Z" }),
        ),
    );

    expect([...subscriptions.live]).toEqual(["AAPL"]);

    unmount();

    expect([...subscriptions.live]).toEqual([]);
  });

  it("never subscribes more symbols than the quote subscription limit", () => {
    const many = Array.from({ length: QUOTE_SUBSCRIPTION_LIMIT + 5 }, (_value, index) =>
      positionDto({ symbol: `SYM${String(index).padStart(3, "0")}`, quantity: "1.000000" }),
    );

    act(() =>
      usePositionsStore.getState().setPositions("acc-1", positionsResponseSchema.parse({ positions: many }).positions),
    );

    renderHook(() => usePositionsQuoteSubscription("acc-1"), { wrapper });

    expect(subscriptions.live.size).toBe(QUOTE_SUBSCRIPTION_LIMIT);
  });
});
