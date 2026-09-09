import { describe, expect, it } from "vitest";

import {
  accountSummaryMessageSchema,
  authOkMessageSchema,
  clientAuthMessageSchema,
  orderUpdateMessageSchema,
  positionUpdateMessageSchema,
  serverMessageSchema,
  tradeMessageSchema,
} from "./ws.js";

const ACCOUNT_SUMMARY = {
  id: "clx0000000000000000000001",
  name: "Main",
  cash: "100000.00",
  positionsValue: "0.00",
  equity: "100000.00",
  unrealizedPnl: "0.00",
  unrealizedPnlPct: "0.00",
  dailyPnl: "0.00",
  dailyPnlPct: "0.00",
  createdAt: "2026-09-08T10:00:00.000Z",
};

const AUTH_OK = { type: "auth_ok", userId: "clx0000000000000000000000" };
const ACCOUNT_SUMMARY_MESSAGE = { type: "account_summary", accounts: [ACCOUNT_SUMMARY] };

const ORDER = {
  id: "clx0000000000000000000010",
  accountId: ACCOUNT_SUMMARY.id,
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
  stopLossPrice: null,
  takeProfitPrice: null,
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

const TRADE = {
  id: "clx0000000000000000000020",
  orderId: ORDER.id,
  symbol: "TSLA",
  side: "BUY",
  quantity: "10.000000",
  price: "250.0000",
  amount: "2500.00",
  realizedPnl: null,
  executedAt: "2026-09-08T14:32:00.000Z",
};

const POSITION = {
  id: "clx0000000000000000000030",
  accountId: ACCOUNT_SUMMARY.id,
  symbol: "TSLA",
  quantity: "10.000000",
  averageCost: "250.0000",
  realizedPnl: "0.00",
  openedAt: "2026-09-08T14:32:00.000Z",
  closedAt: null,
  updatedAt: "2026-09-08T14:32:00.000Z",
};

const ORDER_UPDATE_MESSAGE = { type: "order_update", order: ORDER };
const TRADE_MESSAGE = { type: "trade", trade: TRADE };
const POSITION_UPDATE_MESSAGE = { type: "position_update", position: POSITION };

describe("clientAuthMessageSchema", () => {
  it("accepts the handshake message", () => {
    expect(clientAuthMessageSchema.parse({ type: "auth", token: "header.payload.signature" })).toEqual({
      type: "auth",
      token: "header.payload.signature",
    });
  });

  it("rejects an empty token", () => {
    expect(clientAuthMessageSchema.safeParse({ type: "auth", token: "" }).success).toBe(false);
  });

  it("rejects another message type", () => {
    expect(clientAuthMessageSchema.safeParse({ type: "auth_ok", token: "t" }).success).toBe(false);
  });
});

describe("authOkMessageSchema", () => {
  it("accepts the handshake acknowledgement", () => {
    expect(authOkMessageSchema.parse(AUTH_OK)).toEqual(AUTH_OK);
  });

  it("rejects an acknowledgement without a user id", () => {
    expect(authOkMessageSchema.safeParse({ type: "auth_ok" }).success).toBe(false);
  });
});

describe("accountSummaryMessageSchema", () => {
  it("keeps the monetary fields as strings on the wire", () => {
    const result = accountSummaryMessageSchema.parse(ACCOUNT_SUMMARY_MESSAGE);

    expect(result.accounts[0]?.equity).toBe("100000.00");
    expect(typeof result.accounts[0]?.cash).toBe("string");
  });

  it("accepts a message with no accounts", () => {
    expect(accountSummaryMessageSchema.parse({ type: "account_summary", accounts: [] }).accounts).toEqual([]);
  });

  it("rejects an account with a malformed decimal string", () => {
    const result = accountSummaryMessageSchema.safeParse({
      type: "account_summary",
      accounts: [{ ...ACCOUNT_SUMMARY, cash: "1e5" }],
    });

    expect(result.success).toBe(false);
  });
});

describe("orderUpdateMessageSchema", () => {
  it("keeps the order fields as wire strings", () => {
    const result = orderUpdateMessageSchema.parse(ORDER_UPDATE_MESSAGE);

    expect(result.order.quantity).toBe("10.000000");
    expect(result.order.reservedCash).toBe("2500.00");
    expect(result.order.status).toBe("OPEN");
  });

  it("carries a cancelled bracket child", () => {
    const child = {
      type: "order_update",
      order: {
        ...ORDER,
        id: "clx0000000000000000000011",
        role: "STOP_LOSS",
        status: "CANCELLED",
        cancelReason: "OCO_SIBLING_FILLED",
        cancelledAt: "2026-09-08T15:00:00.000Z",
        parentOrderId: ORDER.id,
        ocoGroupId: "clx0000000000000000000012",
      },
    };

    expect(orderUpdateMessageSchema.parse(child).order.cancelReason).toBe("OCO_SIBLING_FILLED");
  });

  it.each([
    ["a missing order", { type: "order_update" }],
    ["an unknown status", { type: "order_update", order: { ...ORDER, status: "PARTIAL" } }],
    ["a numeric quantity", { type: "order_update", order: { ...ORDER, quantity: 10 } }],
  ])("rejects %s", (_label, input) => {
    expect(orderUpdateMessageSchema.safeParse(input).success).toBe(false);
  });
});

describe("tradeMessageSchema", () => {
  it("keeps the trade fields as wire strings", () => {
    const result = tradeMessageSchema.parse(TRADE_MESSAGE);

    expect(result.trade.price).toBe("250.0000");
    expect(result.trade.realizedPnl).toBeNull();
  });

  it("rejects a trade with a malformed decimal string", () => {
    expect(tradeMessageSchema.safeParse({ type: "trade", trade: { ...TRADE, amount: "1e5" } }).success).toBe(false);
  });
});

describe("positionUpdateMessageSchema", () => {
  it("keeps the position fields as wire strings", () => {
    const result = positionUpdateMessageSchema.parse(POSITION_UPDATE_MESSAGE);

    expect(result.position.quantity).toBe("10.000000");
    expect(result.position.averageCost).toBe("250.0000");
  });

  it("carries a short position with a signed quantity", () => {
    const short = { type: "position_update", position: { ...POSITION, quantity: "-5.000000" } };

    expect(positionUpdateMessageSchema.parse(short).position.quantity).toBe("-5.000000");
  });

  it("rejects a position without an account id", () => {
    const patched = { type: "position_update", position: { ...POSITION, accountId: undefined } };

    expect(positionUpdateMessageSchema.safeParse(patched).success).toBe(false);
  });
});

describe("serverMessageSchema", () => {
  it("discriminates the handshake acknowledgement", () => {
    const result = serverMessageSchema.parse(AUTH_OK);

    if (result.type !== "auth_ok") throw new Error("expected an auth_ok message");

    expect(result.userId).toBe(AUTH_OK.userId);
  });

  it("discriminates the account summary message", () => {
    const result = serverMessageSchema.parse(ACCOUNT_SUMMARY_MESSAGE);

    if (result.type !== "account_summary") throw new Error("expected an account_summary message");

    expect(result.accounts).toHaveLength(1);
  });

  it("discriminates the order update message", () => {
    const result = serverMessageSchema.parse(ORDER_UPDATE_MESSAGE);

    if (result.type !== "order_update") throw new Error("expected an order_update message");

    expect(result.order.id).toBe(ORDER.id);
  });

  it("discriminates the trade message", () => {
    const result = serverMessageSchema.parse(TRADE_MESSAGE);

    if (result.type !== "trade") throw new Error("expected a trade message");

    expect(result.trade.orderId).toBe(ORDER.id);
  });

  it("discriminates the position update message", () => {
    const result = serverMessageSchema.parse(POSITION_UPDATE_MESSAGE);

    if (result.type !== "position_update") throw new Error("expected a position_update message");

    expect(result.position.symbol).toBe("TSLA");
  });

  it.each([
    ["an unknown type", { type: "quote", symbol: "AAPL" }],
    ["an order update without an order", { type: "order_update" }],
    ["a trade message carrying an order", { type: "trade", order: ORDER }],
    ["a missing type", { accounts: [] }],
    ["a client message", { type: "auth", token: "t" }],
    ["a string body", "boom"],
    ["null", null],
  ])("rejects %s", (_label, input) => {
    expect(serverMessageSchema.safeParse(input).success).toBe(false);
  });
});
