import type { ReactNode } from "react";
import { orderSchema, ordersResponseSchema, tradeSchema, type OrderDto } from "@stockdesk/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  previewOrder: vi.fn(),
  placeOrder: vi.fn(),
  listOrders: vi.fn(),
  listAccountOrders: vi.fn(),
  getOrder: vi.fn(),
  modifyOrder: vi.fn(),
  cancelOrder: vi.fn(),
}));

vi.mock("./api", () => api);

import { HttpError } from "../../lib/http";
import { accountSummaryDto, orderDto, tradeDto } from "../../test/fixtures";
import { resetOrderPanelStores } from "../../test/order-panel";
import {
  ALL_ACCOUNTS,
  selectChildren,
  selectOrders,
  useCancelOrder,
  useModifyOrder,
  useOrderDetail,
  useOrders,
  useReloadOrder,
} from "./list-hooks";
import { useOrdersStore } from "./store";

const MAIN = accountSummaryDto({ id: "acc-1", name: "Main" });
const SAVINGS = accountSummaryDto({ id: "acc-2", name: "Savings", createdAt: "2026-09-08T11:00:00.000Z" });

const OPEN_LIMIT = orderDto({ id: "order-1", createdAt: "2026-09-08T10:00:00.000Z" });
const OPEN_STOP = orderDto({
  id: "order-2",
  accountId: "acc-2",
  symbol: "AAPL",
  type: "STOP",
  limitPrice: null,
  stopPrice: "170.0000",
  createdAt: "2026-09-08T11:00:00.000Z",
});
const FILLED_ENTRY = orderDto({
  id: "order-3",
  status: "FILLED",
  avgFillPrice: "251.3400",
  filledAt: "2026-09-08T12:00:00.000Z",
  createdAt: "2026-09-08T09:00:00.000Z",
});
const STOP_LOSS_CHILD = orderDto({
  id: "order-4",
  role: "STOP_LOSS",
  type: "STOP",
  limitPrice: null,
  stopPrice: "240.0000",
  side: "SELL",
  parentOrderId: "order-3",
  ocoGroupId: "oco-1",
  createdAt: "2026-09-08T12:00:00.000Z",
});
const TAKE_PROFIT_CHILD = orderDto({
  id: "order-5",
  role: "TAKE_PROFIT",
  side: "SELL",
  limitPrice: "275.0000",
  parentOrderId: "order-3",
  ocoGroupId: "oco-1",
  createdAt: "2026-09-08T12:00:00.000Z",
});

function page(orders: OrderDto[], nextCursor: string | null = null) {
  return ordersResponseSchema.parse({ orders, nextCursor });
}

function store(...dtos: OrderDto[]) {
  useOrdersStore.getState().upsertOrders(dtos.map((dto) => orderSchema.parse(dto)));

  return useOrdersStore.getState().ordersById;
}

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
  api.listOrders.mockResolvedValue(page([]));
  api.listAccountOrders.mockResolvedValue(page([]));
});

describe("selectOrders", () => {
  it("keeps open and triggered orders under the active filter, newest first", () => {
    const ordersById = store(
      OPEN_LIMIT,
      OPEN_STOP,
      FILLED_ENTRY,
      orderDto({ id: "order-6", status: "TRIGGERED", createdAt: "2026-09-08T13:00:00.000Z" }),
    );

    const selected = selectOrders(ordersById, {
      status: "active",
      accountId: ALL_ACCOUNTS,
      symbol: "",
    });

    expect(selected.map((order) => order.id)).toEqual(["order-6", "order-2", "order-1"]);
  });

  it("keeps only filled orders under the filled filter", () => {
    const ordersById = store(OPEN_LIMIT, FILLED_ENTRY);

    expect(
      selectOrders(ordersById, { status: "filled", accountId: ALL_ACCOUNTS, symbol: "" }).map(
        (order) => order.id,
      ),
    ).toEqual(["order-3"]);
  });

  it("keeps every state under the all filter", () => {
    const ordersById = store(
      OPEN_LIMIT,
      FILLED_ENTRY,
      orderDto({ id: "order-7", status: "CANCELLED", cancelReason: "USER", createdAt: "2026-09-08T08:00:00.000Z" }),
    );

    expect(
      selectOrders(ordersById, { status: "all", accountId: ALL_ACCOUNTS, symbol: "" }).map((o) => o.id),
    ).toEqual(["order-1", "order-3", "order-7"]);
  });

  it("narrows to one account", () => {
    const ordersById = store(OPEN_LIMIT, OPEN_STOP);

    expect(
      selectOrders(ordersById, { status: "active", accountId: "acc-2", symbol: "" }).map((o) => o.id),
    ).toEqual(["order-2"]);
  });

  it("narrows to a symbol prefix regardless of case", () => {
    const ordersById = store(OPEN_LIMIT, OPEN_STOP);

    expect(
      selectOrders(ordersById, { status: "active", accountId: ALL_ACCOUNTS, symbol: "aa" }).map((o) => o.id),
    ).toEqual(["order-2"]);
  });
});

describe("selectChildren", () => {
  it("lists the bracket children of one entry in creation order", () => {
    const ordersById = store(FILLED_ENTRY, TAKE_PROFIT_CHILD, STOP_LOSS_CHILD, OPEN_LIMIT);

    expect(selectChildren(ordersById, "order-3").map((child) => child.role)).toEqual([
      "STOP_LOSS",
      "TAKE_PROFIT",
    ]);
  });

  it("returns nothing for an order without children", () => {
    expect(selectChildren(store(OPEN_LIMIT), "order-1")).toEqual([]);
  });
});

describe("useOrders", () => {
  it("loads the global list and renders the rows from the store", async () => {
    api.listOrders.mockResolvedValue(page([OPEN_LIMIT, OPEN_STOP]));

    const { result } = renderHook(
      () => useOrders({ status: "active", accountId: ALL_ACCOUNTS, symbol: "" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.orders).toHaveLength(2);
    });

    expect(api.listOrders).toHaveBeenCalledWith({ status: "active", accountId: undefined, symbol: undefined });
    expect(Object.keys(useOrdersStore.getState().ordersById).sort()).toEqual(["order-1", "order-2"]);
  });

  it("asks the account endpoint when one account is selected", async () => {
    const { result } = renderHook(
      () => useOrders({ status: "active", accountId: "acc-2", symbol: "" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(api.listAccountOrders).toHaveBeenCalledWith("acc-2", { status: "active", symbol: undefined });
    expect(api.listOrders).not.toHaveBeenCalled();
  });

  it("uppercases a symbol filter that parses as a ticker", async () => {
    const { result } = renderHook(
      () => useOrders({ status: "active", accountId: ALL_ACCOUNTS, symbol: "ts" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(api.listOrders).toHaveBeenCalledWith({ status: "active", accountId: undefined, symbol: "TS" });
  });

  it("keeps a symbol filter the api would reject out of the query", async () => {
    const { result } = renderHook(
      () => useOrders({ status: "active", accountId: ALL_ACCOUNTS, symbol: "tsla motors" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(api.listOrders).toHaveBeenCalledWith({
      status: "active",
      accountId: undefined,
      symbol: undefined,
    });
  });

  it("flips a loaded row to filled from an order_update frame without refetching", async () => {
    api.listOrders.mockResolvedValue(page([OPEN_LIMIT]));

    const { result } = renderHook(
      () => useOrders({ status: "active", accountId: ALL_ACCOUNTS, symbol: "" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.orders).toHaveLength(1);
    });

    act(() => {
      useOrdersStore.getState().applyOrderUpdate({
        type: "order_update",
        order: orderDto({
          id: "order-1",
          status: "FILLED",
          avgFillPrice: "250.0000",
          filledAt: "2026-09-08T14:31:00.000Z",
          version: 2,
          createdAt: "2026-09-08T10:00:00.000Z",
        }),
      });
    });

    await waitFor(() => {
      expect(result.current.orders).toHaveLength(0);
    });

    expect(useOrdersStore.getState().ordersById["order-1"]?.status).toBe("FILLED");
    expect(api.listOrders).toHaveBeenCalledTimes(1);
  });

  it("loads the next page with the cursor of the last page", async () => {
    api.listOrders.mockResolvedValueOnce(page([OPEN_LIMIT], "cursor-2"));
    api.listOrders.mockResolvedValueOnce(page([OPEN_STOP]));

    const { result } = renderHook(
      () => useOrders({ status: "active", accountId: ALL_ACCOUNTS, symbol: "" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.hasMore).toBe(true);
    });

    act(() => result.current.loadMore());

    await waitFor(() => {
      expect(result.current.orders).toHaveLength(2);
    });

    expect(api.listOrders).toHaveBeenLastCalledWith({
      status: "active",
      accountId: undefined,
      symbol: undefined,
      cursor: "cursor-2",
    });
    expect(result.current.hasMore).toBe(false);
  });
});

describe("useModifyOrder", () => {
  it("sends the request and upserts the returned order", async () => {
    api.modifyOrder.mockResolvedValue(orderSchema.parse(orderDto({ limitPrice: "245.0000", version: 2 })));

    const { result } = renderHook(() => useModifyOrder(), { wrapper });

    act(() =>
      result.current.mutate({
        accountId: "acc-1",
        orderId: "order-1",
        request: { limitPrice: "245.0000", version: 1 },
      }),
    );

    await waitFor(() => {
      expect(useOrdersStore.getState().ordersById["order-1"]?.version).toBe(2);
    });

    expect(api.modifyOrder).toHaveBeenCalledWith("acc-1", "order-1", {
      limitPrice: "245.0000",
      version: 1,
    });
    expect(result.current.versionConflict).toBe(false);
  });

  it("raises the version conflict flag and the message key on a 409", async () => {
    api.modifyOrder.mockRejectedValue(
      new HttpError(409, "ORDER_VERSION_CONFLICT", "the order changed meanwhile"),
    );

    const { result } = renderHook(() => useModifyOrder(), { wrapper });

    act(() =>
      result.current.mutate({
        accountId: "acc-1",
        orderId: "order-1",
        request: { limitPrice: "245.0000", version: 1 },
      }),
    );

    await waitFor(() => {
      expect(result.current.versionConflict).toBe(true);
    });

    expect(result.current.errorKey).toBe("orders:errors.ORDER_VERSION_CONFLICT");
  });

  it("maps a not modifiable order to its own message key", async () => {
    api.modifyOrder.mockRejectedValue(new HttpError(422, "ORDER_NOT_MODIFIABLE", "final state"));

    const { result } = renderHook(() => useModifyOrder(), { wrapper });

    act(() =>
      result.current.mutate({
        accountId: "acc-1",
        orderId: "order-1",
        request: { version: 1 },
      }),
    );

    await waitFor(() => {
      expect(result.current.errorKey).toBe("orders:errors.ORDER_NOT_MODIFIABLE");
    });

    expect(result.current.versionConflict).toBe(false);
  });
});

describe("useCancelOrder", () => {
  it("sends the version and upserts the cancelled order", async () => {
    api.cancelOrder.mockResolvedValue(
      orderSchema.parse(orderDto({ status: "CANCELLED", cancelReason: "USER", version: 2 })),
    );

    const { result } = renderHook(() => useCancelOrder(), { wrapper });

    act(() => result.current.mutate({ accountId: "acc-1", orderId: "order-1", version: 1 }));

    await waitFor(() => {
      expect(useOrdersStore.getState().ordersById["order-1"]?.status).toBe("CANCELLED");
    });

    expect(api.cancelOrder).toHaveBeenCalledWith("acc-1", "order-1", 1);
  });
});

describe("useReloadOrder", () => {
  it("refetches the single order with its children and upserts all of them", async () => {
    api.getOrder.mockResolvedValue({
      order: orderSchema.parse(orderDto({ id: "order-3", status: "FILLED", version: 3 })),
      children: [orderSchema.parse(orderDto(STOP_LOSS_CHILD))],
      trades: [],
    });

    const { result } = renderHook(() => useReloadOrder(), { wrapper });

    act(() => result.current.mutate({ accountId: "acc-1", orderId: "order-3" }));

    await waitFor(() => {
      expect(useOrdersStore.getState().ordersById["order-3"]?.version).toBe(3);
    });

    expect(api.getOrder).toHaveBeenCalledWith("acc-1", "order-3");
    expect(useOrdersStore.getState().ordersById["order-4"]?.role).toBe("STOP_LOSS");
  });
});

describe("useOrderDetail", () => {
  it("loads the order, its children and its trades when a reference is given", async () => {
    api.getOrder.mockResolvedValue({
      order: orderSchema.parse(orderDto({ id: "order-3", status: "FILLED" })),
      children: [orderSchema.parse(orderDto(STOP_LOSS_CHILD))],
      trades: [tradeSchema.parse(tradeDto({ id: "trade-9" }))],
    });

    const { result } = renderHook(() => useOrderDetail({ accountId: "acc-1", orderId: "order-3" }), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.detail?.trades).toHaveLength(1);
    });

    expect(result.current.detail?.children[0]?.id).toBe("order-4");
  });

  it("stays idle without a reference", async () => {
    const { result } = renderHook(() => useOrderDetail(null), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(api.getOrder).not.toHaveBeenCalled();
  });
});
