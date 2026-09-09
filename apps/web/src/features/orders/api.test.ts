import { beforeEach, describe, expect, it, vi } from "vitest";

const httpModule = vi.hoisted(() => ({ http: vi.fn() }));

vi.mock("../../lib/http", () => httpModule);

import { orderDto, tradeDto } from "../../test/fixtures";
import * as api from "./api";

interface RecordedCall {
  path: string;
  method: string | undefined;
  json: unknown;
}

const calls: RecordedCall[] = [];

interface HttpOptions {
  method?: string;
  json?: unknown;
  parse?: (json: unknown) => unknown;
}

function respondWith(payload: unknown): void {
  httpModule.http.mockImplementation((path: string, options: HttpOptions) => {
    calls.push({ path, method: options.method, json: options.json });

    return Promise.resolve(options.parse === undefined ? payload : options.parse(payload));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
});

describe("listOrders", () => {
  it("requests the global order list with the filters in the query string", async () => {
    respondWith({ orders: [orderDto()], nextCursor: "cursor-2" });

    const page = await api.listOrders({ status: "active", accountId: "acc-1", limit: 50 });

    expect(calls[0]?.path).toBe("/api/v1/orders?status=active&accountId=acc-1&limit=50");
    expect(calls[0]?.method).toBe("GET");
    expect(page.nextCursor).toBe("cursor-2");
    expect(page.orders[0]?.quantity.toString()).toBe("10");
  });

  it("omits the filters that are not set", async () => {
    respondWith({ orders: [], nextCursor: null });

    await api.listOrders({ status: "all" });

    expect(calls[0]?.path).toBe("/api/v1/orders?status=all");
  });

  it("uppercases the symbol filter and forwards the cursor", async () => {
    respondWith({ orders: [], nextCursor: null });

    await api.listOrders({ status: "filled", symbol: "tsla", cursor: "cursor-1" });

    expect(calls[0]?.path).toBe("/api/v1/orders?status=filled&symbol=TSLA&cursor=cursor-1");
  });
});

describe("listAccountOrders", () => {
  it("requests the order list of one account", async () => {
    respondWith({ orders: [], nextCursor: null });

    await api.listAccountOrders("acc-2", { status: "active", symbol: "TSLA" });

    expect(calls[0]?.path).toBe("/api/v1/accounts/acc-2/orders?status=active&symbol=TSLA");
  });
});

describe("getOrder", () => {
  it("requests one order with its children and trades", async () => {
    respondWith({
      order: orderDto({ status: "FILLED", avgFillPrice: "251.3400" }),
      children: [orderDto({ id: "order-2", role: "STOP_LOSS", parentOrderId: "order-1" })],
      trades: [tradeDto()],
    });

    const detail = await api.getOrder("acc-1", "order-1");

    expect(calls[0]?.path).toBe("/api/v1/accounts/acc-1/orders/order-1");
    expect(calls[0]?.method).toBe("GET");
    expect(detail.children[0]?.role).toBe("STOP_LOSS");
    expect(detail.trades[0]?.price.toString()).toBe("250");
  });
});

describe("modifyOrder", () => {
  it("sends the edited fields with the version and returns the stored order", async () => {
    respondWith({ order: orderDto({ limitPrice: "245.0000", version: 2 }) });

    const order = await api.modifyOrder("acc-1", "order-1", { limitPrice: "245.0000", version: 1 });

    expect(calls[0]?.path).toBe("/api/v1/accounts/acc-1/orders/order-1");
    expect(calls[0]?.method).toBe("PATCH");
    expect(calls[0]?.json).toEqual({ limitPrice: "245.0000", version: 1 });
    expect(order.version).toBe(2);
    expect(order.limitPrice?.toString()).toBe("245");
  });
});

describe("cancelOrder", () => {
  it("sends the version in the delete body and returns the cancelled order", async () => {
    respondWith({ order: orderDto({ status: "CANCELLED", cancelReason: "USER", version: 2 }) });

    const order = await api.cancelOrder("acc-1", "order-1", 1);

    expect(calls[0]?.path).toBe("/api/v1/accounts/acc-1/orders/order-1");
    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.json).toEqual({ version: 1 });
    expect(order.status).toBe("CANCELLED");
    expect(order.cancelReason).toBe("USER");
  });
});
