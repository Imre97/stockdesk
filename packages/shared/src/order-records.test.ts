import { describe, expect, it } from "vitest";

import { insufficientBuyingPowerDetailsSchema, orderDtoSchema, orderSchema, positionRecordSchema } from "./orders.js";

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

describe("orderDtoSchema", () => {
  it("accepts the Order response from the module spec with every timestamp of the model", () => {
    const result = orderDtoSchema.parse(ORDER_DTO);

    expect(result.quantity).toBe("10.000000");
    expect(result.reservedCash).toBe("2500.00");
    expect(result.cancelledAt).toBeNull();
    expect(result.role).toBe("ENTRY");
  });

  it("keeps every monetary and quantity field a string on the wire", () => {
    const result = orderDtoSchema.parse(ORDER_DTO);

    for (const field of ["quantity", "limitPrice", "reservedCash", "commission"] as const) {
      expect(typeof result[field]).toBe("string");
    }
  });

  it("accepts a filled order with its fill fields", () => {
    const filled = {
      ...ORDER_DTO,
      status: "FILLED",
      avgFillPrice: "249.9900",
      commission: "0.50",
      filledAt: "2026-09-08T14:32:00.000Z",
    };

    expect(orderDtoSchema.parse(filled).avgFillPrice).toBe("249.9900");
  });

  it("accepts a cancelled child with its reason and timestamps", () => {
    const cancelled = {
      ...CHILD_DTO,
      status: "CANCELLED",
      cancelReason: "OCO_SIBLING_FILLED",
      cancelledAt: "2026-09-08T15:00:00.000Z",
      triggeredAt: "2026-09-08T14:59:00.000Z",
    };

    const result = orderDtoSchema.parse(cancelled);

    expect(result.cancelReason).toBe("OCO_SIBLING_FILLED");
    expect(result.cancelledAt).toBe("2026-09-08T15:00:00.000Z");
  });

  it.each([
    ["a quantity number", { quantity: 10 }],
    ["a malformed decimal string", { reservedCash: "1e5" }],
    ["an unknown cancel reason", { cancelReason: "TIMEOUT" }],
    ["a version below one", { version: 0 }],
    ["a non-ISO timestamp", { createdAt: "2026-09-08 14:31:00" }],
    ["a missing cancelledAt", { cancelledAt: undefined }],
  ])("rejects an order with %s", (_label, patch) => {
    expect(orderDtoSchema.safeParse({ ...ORDER_DTO, ...patch }).success).toBe(false);
  });
});

describe("orderSchema", () => {
  it("transforms every monetary and quantity field into a Decimal", () => {
    const result = orderSchema.parse(ORDER_DTO);

    expect(result.quantity.toString()).toBe("10");
    expect(result.limitPrice?.toString()).toBe("250");
    expect(result.reservedCash.toString()).toBe("2500");
    expect(result.avgFillPrice).toBeNull();
  });
});

describe("positionRecordSchema", () => {
  it("carries the signed quantity of a short position", () => {
    const result = positionRecordSchema.parse(POSITION_RECORD_DTO);

    expect(result.quantity.toString()).toBe("-5");
    expect(result.averageCost.toString()).toBe("251.34");
    expect(result.realizedPnl.toString()).toBe("34.46");
    expect(result.closedAt).toBeNull();
  });

  it("accepts a closed position", () => {
    const closed = { ...POSITION_RECORD_DTO, quantity: "0.000000", closedAt: "2026-09-08T16:00:00.000Z" };

    expect(positionRecordSchema.parse(closed).closedAt).toBe("2026-09-08T16:00:00.000Z");
  });

  it.each([
    ["a missing average cost", { averageCost: undefined }],
    ["a symbol in lower case", { symbol: "tsla" }],
    ["a numeric realized result", { realizedPnl: 34.46 }],
  ])("rejects a position with %s", (_label, patch) => {
    expect(positionRecordSchema.safeParse({ ...POSITION_RECORD_DTO, ...patch }).success).toBe(false);
  });
});

describe("insufficientBuyingPowerDetailsSchema", () => {
  it("carries the required and available amounts as decimal strings", () => {
    const result = insufficientBuyingPowerDetailsSchema.parse({ required: "1020.00", available: "500.00" });

    expect(result).toEqual({ required: "1020.00", available: "500.00" });
  });

  it.each([
    ["a numeric requirement", { required: 1020 }],
    ["a missing availability", { available: undefined }],
    ["a malformed decimal string", { available: "1e5" }],
  ])("rejects details with %s", (_label, patch) => {
    expect(
      insufficientBuyingPowerDetailsSchema.safeParse({ required: "1020.00", available: "500.00", ...patch }).success,
    ).toBe(false);
  });
});
