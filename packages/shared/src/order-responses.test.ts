import { describe, expect, it } from "vitest";

import {
  ORDERS_PAGE_DEFAULT,
  ORDERS_PAGE_MAX,
  orderDetailResponseDtoSchema,
  orderDetailResponseSchema,
  orderPreviewDtoSchema,
  orderPreviewResponseSchema,
  orderPreviewSchema,
  ordersQuerySchema,
  ordersResponseDtoSchema,
  ordersResponseSchema,
  placeOrderResponseDtoSchema,
  placeOrderResponseSchema,
} from "./order-responses.js";

const ORDER_DTO = {
  id: "clx0000000000000000000010",
  accountId: "clx0000000000000000000001",
  clientOrderId: null,
  symbol: "TSLA",
  side: "BUY",
  type: "LIMIT",
  role: "ENTRY",
  status: "OPEN",
  timeInForce: "GTC",
  quantity: "10.000000",
  limitPrice: "250.0000",
  stopPrice: null,
  stopLossPrice: "240.0000",
  takeProfitPrice: "275.0000",
  reservedCash: "2500.00",
  avgFillPrice: null,
  commission: "0.00",
  parentOrderId: null,
  ocoGroupId: null,
  cancelReason: null,
  rejectReason: null,
  version: 1,
  expiresAt: null,
  triggeredAt: null,
  filledAt: null,
  cancelledAt: null,
  createdAt: "2026-09-08T14:31:00.000Z",
  updatedAt: "2026-09-08T14:31:00.000Z",
};

const CHILD_DTO = {
  ...ORDER_DTO,
  id: "clx0000000000000000000011",
  side: "SELL",
  type: "STOP",
  role: "STOP_LOSS",
  limitPrice: null,
  stopPrice: "240.0000",
  stopLossPrice: null,
  takeProfitPrice: null,
  reservedCash: "0.00",
  parentOrderId: ORDER_DTO.id,
  ocoGroupId: "clx0000000000000000000012",
};

const TRADE_DTO = {
  id: "clx0000000000000000000020",
  orderId: ORDER_DTO.id,
  symbol: "TSLA",
  side: "BUY",
  quantity: "10.000000",
  price: "250.0000",
  amount: "2500.00",
  realizedPnl: null,
  executedAt: "2026-09-08T14:32:00.000Z",
};

const POSITION_RECORD_DTO = {
  id: "clx0000000000000000000030",
  accountId: ORDER_DTO.accountId,
  symbol: "TSLA",
  quantity: "-5.000000",
  averageCost: "251.3400",
  realizedPnl: "34.46",
  openedAt: "2026-09-08T14:32:00.000Z",
  closedAt: null,
  updatedAt: "2026-09-08T14:32:00.000Z",
};

const ACCOUNT_SUMMARY_DTO = {
  id: ORDER_DTO.accountId,
  name: "Main",
  cash: "97500.00",
  positionsValue: "2500.00",
  equity: "100000.00",
  unrealizedPnl: "0.00",
  unrealizedPnlPct: "0.00",
  dailyPnl: "0.00",
  dailyPnlPct: "0.00",
  createdAt: "2026-09-08T10:00:00.000Z",
};

const PREVIEW_DTO = {
  quantity: "3.978674",
  estimatedPrice: "251.3400",
  estimatedCost: "1000.00",
  reservedCash: "1020.00",
  commission: "0.00",
  positionEffect: "open_long",
  positionAfter: "3.978674",
  buyingPowerBefore: "100000.00",
  buyingPowerAfter: "98980.00",
  expectedExecution: "immediate",
  warnings: ["MARKET_CLOSED"],
};

describe("orderPreviewSchema", () => {
  it("accepts the preview from the module spec", () => {
    const result = orderPreviewDtoSchema.parse(PREVIEW_DTO);

    expect(result.positionEffect).toBe("open_long");
    expect(result.expectedExecution).toBe("immediate");
    expect(result.warnings).toEqual(["MARKET_CLOSED"]);
  });

  it("transforms the decimal fields and keeps the enums", () => {
    const result = orderPreviewSchema.parse(PREVIEW_DTO);

    expect(result.quantity.toString()).toBe("3.978674");
    expect(result.estimatedCost.toString()).toBe("1000");
    expect(result.reservedCash.toString()).toBe("1020");
    expect(result.buyingPowerAfter.toString()).toBe("98980");
  });

  it("accepts a preview without warnings and a negative position after a flip", () => {
    const result = orderPreviewSchema.parse({
      ...PREVIEW_DTO,
      positionEffect: "flip_to_short",
      positionAfter: "-5.000000",
      expectedExecution: "resting",
      warnings: [],
    });

    expect(result.positionAfter.toString()).toBe("-5");
    expect(result.warnings).toEqual([]);
  });

  it("wraps the preview in its response envelope", () => {
    const result = orderPreviewResponseSchema.parse({ preview: PREVIEW_DTO });

    expect(result.preview.commission.toString()).toBe("0");
  });

  it.each([
    ["an unknown warning", { warnings: ["MARKET_HALTED"] }],
    ["an unknown execution expectation", { expectedExecution: "later" }],
    ["an unknown position effect", { positionEffect: "open" }],
    ["a numeric cost", { estimatedCost: 1000 }],
  ])("rejects a preview with %s", (_label, patch) => {
    expect(orderPreviewDtoSchema.safeParse({ ...PREVIEW_DTO, ...patch }).success).toBe(false);
  });
});

describe("ordersQuerySchema", () => {
  it("defaults to the active orders and the default page size", () => {
    expect(ordersQuerySchema.parse({})).toEqual({ status: "active", limit: ORDERS_PAGE_DEFAULT });
    expect(ORDERS_PAGE_DEFAULT).toBe(50);
    expect(ORDERS_PAGE_MAX).toBe(200);
  });

  it("accepts every status filter with the optional filters", () => {
    const result = ordersQuerySchema.parse({
      status: "all",
      symbol: "TSLA",
      accountId: "clx0000000000000000000001",
      limit: "200",
      cursor: "clx0000000000000000000010",
    });

    expect(result).toEqual({
      status: "all",
      symbol: "TSLA",
      accountId: "clx0000000000000000000001",
      limit: 200,
      cursor: "clx0000000000000000000010",
    });
    expect(ordersQuerySchema.parse({ status: "filled" }).status).toBe("filled");
  });

  it.each([["open"], ["ACTIVE"], [""]])("rejects the status %s", (status) => {
    expect(ordersQuerySchema.safeParse({ status }).success).toBe(false);
  });

  it.each([["0"], ["201"], ["10.5"], ["many"]])("rejects the limit %s", (limit) => {
    expect(ordersQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  it("rejects a symbol in lower case and an empty cursor", () => {
    expect(ordersQuerySchema.safeParse({ symbol: "tsla" }).success).toBe(false);
    expect(ordersQuerySchema.safeParse({ cursor: "" }).success).toBe(false);
  });
});

describe("ordersResponseSchema", () => {
  it("carries a page of orders and the next cursor", () => {
    const page = { orders: [ORDER_DTO, CHILD_DTO], nextCursor: CHILD_DTO.id };

    expect(ordersResponseDtoSchema.parse(page).orders).toHaveLength(2);
    expect(ordersResponseSchema.parse(page).orders[1]?.stopPrice?.toString()).toBe("240");
    expect(ordersResponseSchema.parse(page).nextCursor).toBe(CHILD_DTO.id);
  });

  it("accepts an empty last page", () => {
    expect(ordersResponseSchema.parse({ orders: [], nextCursor: null }).orders).toEqual([]);
  });
});

describe("orderDetailResponseSchema", () => {
  it("carries the order, its children and its trades", () => {
    const detail = { order: ORDER_DTO, children: [CHILD_DTO], trades: [TRADE_DTO] };

    expect(orderDetailResponseDtoSchema.parse(detail).trades[0]?.amount).toBe("2500.00");

    const result = orderDetailResponseSchema.parse(detail);

    expect(result.order.quantity.toString()).toBe("10");
    expect(result.children[0]?.role).toBe("STOP_LOSS");
    expect(result.trades[0]?.price.toString()).toBe("250");
  });

  it("accepts an order without children or trades", () => {
    const result = orderDetailResponseSchema.parse({ order: ORDER_DTO, children: [], trades: [] });

    expect(result.children).toEqual([]);
  });
});

describe("placeOrderResponseSchema", () => {
  it("carries only the order and the account when the order rests", () => {
    const result = placeOrderResponseSchema.parse({ order: ORDER_DTO, account: ACCOUNT_SUMMARY_DTO });

    expect(result.order.status).toBe("OPEN");
    expect(result.account.cash.toString()).toBe("97500");
    expect(result.trade).toBeUndefined();
    expect(result.position).toBeUndefined();
  });

  it("carries the trade and the position when the order fills at once", () => {
    const filled = {
      order: { ...ORDER_DTO, status: "FILLED", avgFillPrice: "250.0000", filledAt: TRADE_DTO.executedAt },
      trade: TRADE_DTO,
      position: POSITION_RECORD_DTO,
      account: ACCOUNT_SUMMARY_DTO,
    };

    expect(placeOrderResponseDtoSchema.parse(filled).position?.quantity).toBe("-5.000000");

    const result = placeOrderResponseSchema.parse(filled);

    expect(result.trade?.quantity.toString()).toBe("10");
    expect(result.position?.averageCost.toString()).toBe("251.34");
  });

  it("rejects a response without an account summary", () => {
    expect(placeOrderResponseSchema.safeParse({ order: ORDER_DTO }).success).toBe(false);
  });
});
