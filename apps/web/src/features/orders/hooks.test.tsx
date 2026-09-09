import type { ReactNode } from "react";
import { placeOrderResponseSchema, symbolDetailSchema } from "@stockdesk/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ previewOrder: vi.fn(), placeOrder: vi.fn() }));

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

vi.mock("./api", () => api);
vi.mock("../market/api", () => marketApi);
vi.mock("../market/subscriptions", () => subscriptions);

import {
  accountSummaryDto,
  orderPreviewDto,
  placeOrderResponseDto,
  positionRecordDto,
  symbolDetailDto,
  tradeDto,
} from "../../test/fixtures";
import { MARKET_OPEN, resetOrderPanelStores } from "../../test/order-panel";
import { useActiveAccountId } from "../accounts/hooks";
import { useAccountsStore } from "../accounts/store";
import { usePositionsStore } from "../positions/store";
import { useOrderForm, usePlaceOrder, usePreviewOrder } from "./hooks";
import { useOrdersStore } from "./store";

const MAIN = accountSummaryDto({ id: "acc-1", name: "Main" });
const SAVINGS = accountSummaryDto({ id: "acc-2", name: "Savings", createdAt: "2026-09-08T11:00:00.000Z" });
const DETAIL = symbolDetailSchema.parse(symbolDetailDto());

const MARKET_BUY_REQUEST = {
  symbol: "TSLA",
  side: "BUY" as const,
  type: "MARKET" as const,
  quantity: "3.978674",
  limitPrice: null,
  stopPrice: null,
  timeInForce: "GTC" as const,
  stopLossPrice: null,
  takeProfitPrice: null,
};

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  resetOrderPanelStores([MAIN, SAVINGS]);
  marketApi.getSymbol.mockResolvedValue(DETAIL);
  marketApi.getMarketStatus.mockResolvedValue(MARKET_OPEN);
  api.previewOrder.mockResolvedValue(orderPreviewDto());
});

describe("useOrderForm", () => {
  it("resolves the USD amount to shares against the symbol last price", async () => {
    const { result } = renderHook(() => useOrderForm("TSLA", "BUY"), { wrapper });

    await waitFor(() => {
      expect(result.current.inputs.lastPrice?.toString()).toBe("251.34");
    });

    act(() => result.current.setUnit("usd"));
    act(() => result.current.setAmountInput("1000"));

    expect(result.current.quantity?.toString()).toBe("3.978674");
    expect(result.current.request).toEqual(MARKET_BUY_REQUEST);
  });

  it("reads the shortable and fractionable flags from the symbol detail", async () => {
    marketApi.getSymbol.mockResolvedValue({ ...DETAIL, shortable: false, fractionable: false });

    const { result } = renderHook(() => useOrderForm("TSLA", "SELL"), { wrapper });

    await waitFor(() => {
      expect(result.current.inputs.fractionable).toBe(false);
    });

    expect(result.current.inputs.shortable).toBe(false);
  });

  it("reads the position quantity of the active account", async () => {
    usePositionsStore.getState().applyPositionUpdate({
      type: "position_update",
      position: positionRecordDto({ accountId: "acc-1", symbol: "TSLA", quantity: "10.000000" }),
    });

    const { result } = renderHook(() => useOrderForm("TSLA", "SELL"), { wrapper });

    await waitFor(() => {
      expect(result.current.inputs.positionQuantity.toString()).toBe("10");
    });
  });

  it("moves the global active account when the panel selects another one", async () => {
    const { result } = renderHook(
      () => ({ form: useOrderForm("TSLA", "BUY"), activeAccountId: useActiveAccountId() }),
      { wrapper },
    );

    expect(result.current.activeAccountId).toBe("acc-1");

    act(() => result.current.form.selectAccount("acc-2"));

    await waitFor(() => {
      expect(result.current.activeAccountId).toBe("acc-2");
    });

    expect(result.current.form.state.accountId).toBe("acc-2");
  });
});

describe("usePreviewOrder", () => {
  it("previews once after the debounce with the resolved shares and null brackets", async () => {
    const { result } = renderHook(() => usePreviewOrder("acc-1", MARKET_BUY_REQUEST), { wrapper });

    await waitFor(() => {
      expect(result.current.data?.quantity.toString()).toBe("3.978674");
    });

    expect(api.previewOrder).toHaveBeenCalledTimes(1);
    expect(api.previewOrder).toHaveBeenCalledWith("acc-1", MARKET_BUY_REQUEST);
  });

  it("stays disabled while the request is invalid", async () => {
    const { result } = renderHook(() => usePreviewOrder("acc-1", null), { wrapper });

    await waitFor(() => {
      expect(result.current.fetchStatus).toBe("idle");
    });

    expect(api.previewOrder).not.toHaveBeenCalled();
  });

  it("stays disabled without an account", async () => {
    const { result } = renderHook(() => usePreviewOrder(null, MARKET_BUY_REQUEST), { wrapper });

    await waitFor(() => {
      expect(result.current.fetchStatus).toBe("idle");
    });

    expect(api.previewOrder).not.toHaveBeenCalled();
  });
});

describe("usePlaceOrder", () => {
  it("sends the request and stores the order, trade, position and account", async () => {
    const response = placeOrderResponseDto({
      order: {
        ...placeOrderResponseDto().order,
        status: "FILLED",
        avgFillPrice: "251.3400",
        filledAt: "2026-09-08T14:31:00.000Z",
      },
      trade: tradeDto({ id: "trade-9", price: "251.3400", amount: "2513.40" }),
      position: positionRecordDto({ symbol: "TSLA", quantity: "10.000000" }),
      account: accountSummaryDto({ id: "acc-1", name: "Main", cash: "97486.60" }),
    });

    api.placeOrder.mockResolvedValue(placeOrderResponseSchema.parse(response));

    const { result } = renderHook(() => usePlaceOrder(), { wrapper });

    act(() => result.current.mutate({ accountId: "acc-1", request: MARKET_BUY_REQUEST }));

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(api.placeOrder).toHaveBeenCalledWith("acc-1", MARKET_BUY_REQUEST);
    expect(Object.keys(useOrdersStore.getState().ordersById)).toEqual(["order-1"]);
    expect(useOrdersStore.getState().tradesByAccountSymbol["acc-1:TSLA"]?.[0]?.id).toBe("trade-9");
    expect(
      usePositionsStore.getState().positionsByAccount["acc-1"]?.["TSLA"]?.quantity.toString(),
    ).toBe("10");
    expect(useAccountsStore.getState().accounts[0]?.cash.toString()).toBe("97486.6");
  });

  it("stores only the order when nothing filled", async () => {
    api.placeOrder.mockResolvedValue(placeOrderResponseSchema.parse(placeOrderResponseDto()));

    const { result } = renderHook(() => usePlaceOrder(), { wrapper });

    act(() => result.current.mutate({ accountId: "acc-1", request: MARKET_BUY_REQUEST }));

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(useOrdersStore.getState().tradesByAccountSymbol).toEqual({});
    expect(usePositionsStore.getState().positionsByAccount).toEqual({});
  });
});
