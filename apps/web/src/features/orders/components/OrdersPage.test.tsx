import type { ReactNode } from "react";
import { orderSchema, ordersResponseSchema, tradeSchema, type OrderDto } from "@stockdesk/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
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

interface LinkProps {
  to: string;
  children: ReactNode;
  className?: string;
}

vi.mock("../api", () => api);
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className }: LinkProps) => (
    <a className={className} href={to}>
      {children}
    </a>
  ),
}));

import { i18n } from "../../../i18n";
import { HttpError } from "../../../lib/http";
import { accountSummaryDto, orderDto, tradeDto } from "../../../test/fixtures";
import { resetOrderPanelStores } from "../../../test/order-panel";
import { useOrdersStore } from "../store";
import { OrdersPage } from "./OrdersPage";

const MAIN = accountSummaryDto({ id: "acc-1", name: "Main" });
const SAVINGS = accountSummaryDto({ id: "acc-2", name: "Savings", createdAt: "2026-09-08T11:00:00.000Z" });

const MAIN_LIMIT = orderDto({ id: "order-1", createdAt: "2026-09-08T10:00:00.000Z" });
const SAVINGS_STOP = orderDto({
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
  type: "MARKET",
  limitPrice: null,
  avgFillPrice: "251.3400",
  filledAt: "2026-09-08T12:00:00.000Z",
  createdAt: "2026-09-08T09:00:00.000Z",
});
const STOP_LOSS_CHILD = orderDto({
  id: "order-4",
  role: "STOP_LOSS",
  type: "STOP",
  side: "SELL",
  limitPrice: null,
  stopPrice: "240.0000",
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

let queryClient: QueryClient;

function page(orders: OrderDto[], nextCursor: string | null = null) {
  return ordersResponseSchema.parse({ orders, nextCursor });
}

function label(key: string, values?: Record<string, string>): string {
  return i18n.t(key, values ?? {});
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </I18nextProvider>
  );
}

function renderPage() {
  return render(<OrdersPage />, { wrapper });
}

function row(orderId: string): HTMLElement {
  const found = document.querySelector(`[data-order-id="${orderId}"]`);

  if (found === null) throw new Error(`row ${orderId} is not rendered`);

  return found as HTMLElement;
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

describe("OrdersPage", () => {
  it("lists the active orders of every account newest first with the account names", async () => {
    api.listOrders.mockResolvedValue(page([MAIN_LIMIT, SAVINGS_STOP]));

    renderPage();

    await waitFor(() => {
      expect(row("order-1")).toBeInTheDocument();
    });

    const rendered = [...document.querySelectorAll("[data-order-id]")].map((element) =>
      element.getAttribute("data-order-id"),
    );

    expect(rendered).toEqual(["order-2", "order-1"]);
    expect(within(row("order-2")).getByText("Savings")).toBeInTheDocument();
    expect(within(row("order-1")).getByText("Main")).toBeInTheDocument();
    expect(within(row("order-1")).getByText(label("orders:status.OPEN"))).toBeInTheDocument();
  });

  it("expands a filled bracket entry to its stop loss and take profit children", async () => {
    api.listOrders.mockResolvedValue(page([FILLED_ENTRY, STOP_LOSS_CHILD, TAKE_PROFIT_CHILD]));

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: label("orders:filters.status.all") }));

    await waitFor(() => {
      expect(row("order-3")).toBeInTheDocument();
    });

    expect(document.querySelector('[data-order-id="order-4"]')).toBeNull();

    const chevron = within(row("order-3")).getByRole("button", {
      name: label("orders:table.expand", { symbol: "TSLA" }),
    });

    expect(chevron).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(chevron);

    expect(within(row("order-4")).getByText(label("orders:roleBadge.STOP_LOSS"))).toBeInTheDocument();
    expect(within(row("order-5")).getByText(label("orders:roleBadge.TAKE_PROFIT"))).toBeInTheDocument();
    expect(
      within(row("order-3")).getByRole("button", {
        name: label("orders:table.collapse", { symbol: "TSLA" }),
      }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("lists an active child of a filled entry as its own row under the active filter", async () => {
    api.listOrders.mockResolvedValue(page([STOP_LOSS_CHILD]));

    renderPage();

    await waitFor(() => {
      expect(row("order-4")).toBeInTheDocument();
    });

    expect(within(row("order-4")).getByText(label("orders:roleBadge.STOP_LOSS"))).toBeInTheDocument();
    expect(
      within(row("order-4")).getByRole("button", { name: label("orders:table.parentLink") }),
    ).toBeInTheDocument();
  });

  it("drops a row from the active filter when an order_update fills it", async () => {
    api.listOrders.mockResolvedValue(page([MAIN_LIMIT]));

    renderPage();

    await waitFor(() => {
      expect(row("order-1")).toBeInTheDocument();
    });

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

    await waitFor(() => {
      expect(document.querySelector('[data-order-id="order-1"]')).toBeNull();
    });

    expect(screen.getByText(label("orders:table.empty"))).toBeInTheDocument();
    expect(api.listOrders).toHaveBeenCalledTimes(1);
  });

  it("sends the new limit price with the version and offers a reload on a version conflict", async () => {
    api.listOrders.mockResolvedValue(page([MAIN_LIMIT]));
    api.modifyOrder.mockRejectedValue(
      new HttpError(409, "ORDER_VERSION_CONFLICT", "the order changed meanwhile"),
    );
    api.getOrder.mockResolvedValue({
      order: orderSchema.parse(orderDto({ id: "order-1", limitPrice: "252.0000", version: 4 })),
      children: [],
      trades: [],
    });

    renderPage();

    await waitFor(() => {
      expect(row("order-1")).toBeInTheDocument();
    });

    fireEvent.click(within(row("order-1")).getByRole("button", { name: label("orders:actions.modify") }));

    const limitInput = await screen.findByLabelText(label("orders:modify.limitPriceLabel"));

    expect(limitInput).toHaveValue("250.0000");

    fireEvent.change(limitInput, { target: { value: "245.0000" } });
    fireEvent.click(screen.getByRole("button", { name: label("orders:modify.submit") }));

    await waitFor(() => {
      expect(api.modifyOrder).toHaveBeenCalledWith("acc-1", "order-1", {
        limitPrice: "245.0000",
        version: 1,
      });
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      label("orders:errors.ORDER_VERSION_CONFLICT"),
    );

    fireEvent.click(screen.getByRole("button", { name: label("orders:modify.reload") }));

    await waitFor(() => {
      expect(api.getOrder).toHaveBeenCalledWith("acc-1", "order-1");
    });

    await waitFor(() => {
      expect(screen.getByLabelText(label("orders:modify.limitPriceLabel"))).toHaveValue("252.0000");
    });
  });

  it("cancels an order with its version after the confirmation", async () => {
    api.listOrders.mockResolvedValue(page([MAIN_LIMIT]));
    api.cancelOrder.mockResolvedValue(
      orderSchema.parse(orderDto({ status: "CANCELLED", cancelReason: "USER", version: 2 })),
    );

    renderPage();

    await waitFor(() => {
      expect(row("order-1")).toBeInTheDocument();
    });

    fireEvent.click(within(row("order-1")).getByRole("button", { name: label("orders:actions.cancel") }));

    expect(await screen.findByText(label("orders:cancelDialog.title"))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: label("orders:cancelDialog.confirm") }));

    await waitFor(() => {
      expect(api.cancelOrder).toHaveBeenCalledWith("acc-1", "order-1", 1);
    });

    await waitFor(() => {
      expect(document.querySelector('[data-order-id="order-1"]')).toBeNull();
    });
  });

  it("shows the trades and the children of a filled order in the details drawer", async () => {
    api.listOrders.mockResolvedValue(page([FILLED_ENTRY]));
    api.getOrder.mockResolvedValue({
      order: orderSchema.parse(FILLED_ENTRY),
      children: [orderSchema.parse(STOP_LOSS_CHILD), orderSchema.parse(TAKE_PROFIT_CHILD)],
      trades: [
        tradeSchema.parse(
          tradeDto({ id: "trade-9", orderId: "order-3", price: "251.3400", amount: "2513.40" }),
        ),
      ],
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: label("orders:filters.status.filled") }));

    await waitFor(() => {
      expect(row("order-3")).toBeInTheDocument();
    });

    fireEvent.click(within(row("order-3")).getByRole("button", { name: label("orders:actions.details") }));

    expect(await screen.findByText(label("orders:details.title"))).toBeInTheDocument();

    await waitFor(() => {
      expect(api.getOrder).toHaveBeenCalledWith("acc-1", "order-3");
    });

    const drawer = screen.getByRole("dialog");

    expect(await within(drawer).findByText("-$2,513.40")).toBeInTheDocument();
    expect(within(drawer).getByText(label("orders:details.tradeColumns.amount"))).toBeInTheDocument();
    expect(within(drawer).getAllByText("$251.34")).toHaveLength(2);
    expect(within(drawer).getByText(label("orders:roleBadge.STOP_LOSS"))).toBeInTheDocument();
    expect(within(drawer).getByText(label("orders:roleBadge.TAKE_PROFIT"))).toBeInTheDocument();
  });

  it("narrows the list to one account and to a symbol", async () => {
    api.listOrders.mockResolvedValue(page([MAIN_LIMIT, SAVINGS_STOP]));
    api.listAccountOrders.mockResolvedValue(page([SAVINGS_STOP]));

    renderPage();

    await waitFor(() => {
      expect(row("order-1")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(label("orders:filters.symbolLabel")), {
      target: { value: "aa" },
    });

    await waitFor(() => {
      expect(document.querySelector('[data-order-id="order-1"]')).toBeNull();
    });

    expect(row("order-2")).toBeInTheDocument();
  });

  it("loads the next page from the cursor", async () => {
    api.listOrders.mockResolvedValueOnce(page([MAIN_LIMIT], "cursor-2"));
    api.listOrders.mockResolvedValueOnce(page([SAVINGS_STOP]));

    renderPage();

    const loadMore = await screen.findByRole("button", { name: label("orders:table.loadMore") });

    fireEvent.click(loadMore);

    await waitFor(() => {
      expect(row("order-2")).toBeInTheDocument();
    });

    expect(api.listOrders).toHaveBeenLastCalledWith({
      status: "active",
      accountId: undefined,
      symbol: undefined,
      cursor: "cursor-2",
    });
  });
});
