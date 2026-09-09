import { describe, expect, it } from "vitest";

import { Decimal } from "./decimal.js";
import {
  TRADES_PAGE_DEFAULT,
  TRADES_PAGE_MAX,
  tradeDtoSchema,
  tradeSchema,
  tradeSideSchema,
  tradesQuerySchema,
  tradesResponseDtoSchema,
  tradesResponseSchema,
} from "./market.js";

const TRADE = {
  id: "clx0000000000000000000001",
  orderId: "clx0000000000000000000002",
  accountId: "clx0000000000000000000003",
  symbol: "TSLA",
  side: "BUY",
  quantity: "10",
  price: "250.0000",
  amount: "-2500.00",
  commission: "0.00",
  realizedPnl: null,
  executedAt: "2026-09-08T14:31:00.000Z",
};

describe("tradeSideSchema", () => {
  it.each([["BUY"], ["SELL"]])("accepts the side %s", (side) => {
    expect(tradeSideSchema.parse(side)).toBe(side);
  });

  it.each([["buy"], ["SHORT"], [""]])("rejects the side %s", (side) => {
    expect(tradeSideSchema.safeParse(side).success).toBe(false);
  });
});

describe("tradeSchema", () => {
  it("keeps the monetary fields as strings in the dto schema", () => {
    const result = tradeDtoSchema.parse(TRADE);

    expect(result.amount).toBe("-2500.00");
    expect(result.realizedPnl).toBeNull();
  });

  it("transforms the monetary fields into Decimal values", () => {
    const result = tradeSchema.parse(TRADE);

    expect(result.quantity).toBeInstanceOf(Decimal);
    expect(result.amount.equals(new Decimal("-2500"))).toBe(true);
    expect(result.commission.equals(new Decimal("0"))).toBe(true);
    expect(result.accountId).toBe(TRADE.accountId);
    expect(result.realizedPnl).toBeNull();
    expect(result.executedAt).toBe(TRADE.executedAt);
  });

  it("transforms a realized profit into a Decimal", () => {
    const result = tradeSchema.parse({ ...TRADE, realizedPnl: "12.50" });

    expect(result.realizedPnl?.equals(new Decimal("12.5"))).toBe(true);
  });

  it.each([
    ["a price sent as a JSON number", { ...TRADE, price: 250 }],
    ["a quantity sent as a JSON number", { ...TRADE, quantity: 10 }],
    ["an unknown side", { ...TRADE, side: "HOLD" }],
    ["a missing order id", { ...TRADE, orderId: undefined }],
    ["a missing account id", { ...TRADE, accountId: undefined }],
    ["a missing commission", { ...TRADE, commission: undefined }],
    ["an executedAt without a time component", { ...TRADE, executedAt: "2026-09-08" }],
  ])("rejects %s", (_label, input) => {
    expect(tradeSchema.safeParse(input).success).toBe(false);
  });
});

describe("tradesQuerySchema", () => {
  it("defaults the limit to fifty", () => {
    expect(tradesQuerySchema.parse({})).toEqual({ limit: TRADES_PAGE_DEFAULT });
    expect(TRADES_PAGE_DEFAULT).toBe(50);
  });

  it("accepts a symbol filter, the maximum limit and a cursor", () => {
    const result = tradesQuerySchema.parse({ symbol: "TSLA", limit: "200", cursor: "clx000" });

    expect(result.symbol).toBe("TSLA");
    expect(result.limit).toBe(TRADES_PAGE_MAX);
    expect(result.cursor).toBe("clx000");
  });

  it.each([
    ["a limit of zero", { limit: "0" }],
    ["a limit of two hundred and one", { limit: "201" }],
    ["a fractional limit", { limit: "2.5" }],
    ["a lowercase symbol", { symbol: "tsla" }],
  ])("rejects %s", (_label, input) => {
    expect(tradesQuerySchema.safeParse(input).success).toBe(false);
  });
});

describe("tradesResponseSchema", () => {
  it("accepts an empty page, the shape returned before the orders module", () => {
    const result = tradesResponseSchema.parse({ trades: [], nextCursor: null });

    expect(result.trades).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it("transforms the trades of a page", () => {
    const result = tradesResponseSchema.parse({ trades: [TRADE], nextCursor: "clx000" });

    expect(result.trades[0]?.price).toBeInstanceOf(Decimal);
    expect(result.nextCursor).toBe("clx000");
  });

  it("keeps the trades as strings in the dto schema", () => {
    const result = tradesResponseDtoSchema.parse({ trades: [TRADE], nextCursor: null });

    expect(result.trades[0]?.price).toBe("250.0000");
  });

  it("rejects a page without the cursor key", () => {
    expect(tradesResponseSchema.safeParse({ trades: [] }).success).toBe(false);
  });
});
