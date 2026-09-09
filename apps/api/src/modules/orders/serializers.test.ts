import { Decimal, orderDtoSchema } from "@stockdesk/shared";
import { describe, expect, it } from "vitest";
import type { OrderRow } from "./repository.js";
import { toOrderDto } from "./serializers.js";

const CREATED_AT = new Date("2026-09-09T19:00:00.000Z");
const EXPIRES_AT = new Date("2026-09-09T20:00:00.000Z");

function row(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: "order-1",
    accountId: "account-1",
    clientOrderId: null,
    symbol: "TSLA",
    side: "BUY",
    type: "LIMIT",
    role: "ENTRY",
    status: "OPEN",
    timeInForce: "GTC",
    quantity: new Decimal("10"),
    limitPrice: new Decimal("250"),
    stopPrice: null,
    stopLossPrice: new Decimal("240"),
    takeProfitPrice: new Decimal("275"),
    reservedCash: new Decimal("2500"),
    avgFillPrice: null,
    commission: new Decimal("0"),
    parentOrderId: null,
    ocoGroupId: null,
    cancelReason: null,
    rejectReason: null,
    version: 1,
    expiresAt: null,
    triggeredAt: null,
    filledAt: null,
    cancelledAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

describe("toOrderDto", () => {
  it("serializes quantities with 6 places, prices with 4 and money with 2", () => {
    const dto = toOrderDto(row());

    expect(dto.quantity).toBe("10.000000");
    expect(dto.limitPrice).toBe("250.0000");
    expect(dto.stopLossPrice).toBe("240.0000");
    expect(dto.takeProfitPrice).toBe("275.0000");
    expect(dto.reservedCash).toBe("2500.00");
    expect(dto.commission).toBe("0.00");
  });

  it("preserves the nulls of the prices the order does not use", () => {
    const dto = toOrderDto(row());

    expect(dto.stopPrice).toBeNull();
    expect(dto.avgFillPrice).toBeNull();
    expect(dto.clientOrderId).toBeNull();
    expect(dto.expiresAt).toBeNull();
    expect(dto.triggeredAt).toBeNull();
    expect(dto.filledAt).toBeNull();
    expect(dto.cancelledAt).toBeNull();
    expect(dto.cancelReason).toBeNull();
  });

  it("serializes the timestamps as ISO strings", () => {
    const dto = toOrderDto(row({ expiresAt: EXPIRES_AT, timeInForce: "DAY" }));

    expect(dto.createdAt).toBe("2026-09-09T19:00:00.000Z");
    expect(dto.updatedAt).toBe("2026-09-09T19:00:00.000Z");
    expect(dto.expiresAt).toBe("2026-09-09T20:00:00.000Z");
  });

  it("produces a payload that satisfies the shared order DTO schema", () => {
    const filled = row({
      status: "FILLED",
      clientOrderId: "idempotency-key",
      avgFillPrice: new Decimal("249.5"),
      filledAt: EXPIRES_AT,
      version: 2,
    });

    expect(orderDtoSchema.safeParse(toOrderDto(filled)).success).toBe(true);
    expect(orderDtoSchema.safeParse(toOrderDto(row())).success).toBe(true);
  });
});
