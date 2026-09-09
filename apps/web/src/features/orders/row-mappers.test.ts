import { orderSchema } from "@stockdesk/shared";
import { describe, expect, it } from "vitest";

import { orderDto } from "../../test/fixtures";
import {
  initialModifyForm,
  modifiableFields,
  modifyErrors,
  toModifyRequest,
  toOrderRow,
  type ModifyFormState,
} from "./row-mappers";

const LOCALE = "en-US";
const CONTEXT = { accountName: "Main", childCount: 0 };

function order(overrides: Parameters<typeof orderDto>[0] = {}) {
  return orderSchema.parse(orderDto(overrides));
}

function timestamp(at: string): string {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: "short", timeStyle: "short" }).format(new Date(at));
}

function changed(state: ModifyFormState, values: Partial<ModifyFormState["values"]>): ModifyFormState {
  return { ...state, values: { ...state.values, ...values } };
}

describe("toOrderRow", () => {
  it("maps an open limit entry to the table row of the spec", () => {
    expect(toOrderRow(order(), LOCALE, CONTEXT)).toEqual({
      id: "order-1",
      accountId: "acc-1",
      accountName: "Main",
      createdAt: timestamp("2026-09-08T10:00:00.000Z"),
      symbol: "TSLA",
      side: "BUY",
      sideKey: "orders:side.BUY",
      typeKey: "orders:type.LIMIT",
      quantity: "10",
      limitPrice: "$250.00",
      stopPrice: null,
      statusKey: "orders:status.OPEN",
      status: "OPEN",
      filledPrice: null,
      filledAt: null,
      timeInForceKey: "orders:timeInForce.GTC",
      roleBadgeKey: null,
      parentOrderId: null,
      version: 1,
      isActive: true,
      isEntryWithChildren: false,
    });
  });

  it("marks a triggered order as active", () => {
    const row = toOrderRow(order({ type: "STOP", limitPrice: null, stopPrice: "260.0000", status: "TRIGGERED" }), LOCALE, CONTEXT);

    expect(row.isActive).toBe(true);
    expect(row.statusKey).toBe("orders:status.TRIGGERED");
    expect(row.stopPrice).toBe("$260.00");
    expect(row.limitPrice).toBeNull();
  });

  it("formats the fill of a filled entry and counts its children", () => {
    const row = toOrderRow(
      order({
        status: "FILLED",
        avgFillPrice: "251.3400",
        filledAt: "2026-09-08T14:31:00.000Z",
      }),
      LOCALE,
      { accountName: "Main", childCount: 2 },
    );

    expect(row.isActive).toBe(false);
    expect(row.filledPrice).toBe("$251.34");
    expect(row.filledAt).toBe(timestamp("2026-09-08T14:31:00.000Z"));
    expect(row.isEntryWithChildren).toBe(true);
  });

  it("badges a stop-loss child and keeps the parent link", () => {
    const row = toOrderRow(
      order({ id: "order-2", role: "STOP_LOSS", type: "STOP", limitPrice: null, stopPrice: "240.0000", parentOrderId: "order-1" }),
      LOCALE,
      CONTEXT,
    );

    expect(row.roleBadgeKey).toBe("orders:roleBadge.STOP_LOSS");
    expect(row.parentOrderId).toBe("order-1");
    expect(row.isEntryWithChildren).toBe(false);
  });

  it("badges a take-profit child", () => {
    const row = toOrderRow(order({ role: "TAKE_PROFIT", parentOrderId: "order-1" }), LOCALE, CONTEXT);

    expect(row.roleBadgeKey).toBe("orders:roleBadge.TAKE_PROFIT");
  });

  it("leaves the account name null when the lookup misses", () => {
    expect(toOrderRow(order(), LOCALE, { accountName: null, childCount: 0 }).accountName).toBeNull();
  });
});

describe("modifiableFields", () => {
  it("opens quantity, limit price, time in force and the bracket prices on an open limit entry", () => {
    expect(modifiableFields(order())).toEqual({
      quantity: true,
      limitPrice: true,
      stopPrice: false,
      timeInForce: true,
      stopLossPrice: true,
      takeProfitPrice: true,
    });
  });

  it("opens the stop price of an open stop-limit order", () => {
    const fields = modifiableFields(order({ type: "STOP_LIMIT", stopPrice: "260.0000" }));

    expect(fields.stopPrice).toBe(true);
    expect(fields.limitPrice).toBe(true);
  });

  it("opens the limit price only on a triggered stop-limit order", () => {
    expect(modifiableFields(order({ type: "STOP_LIMIT", stopPrice: "260.0000", status: "TRIGGERED" }))).toEqual({
      quantity: false,
      limitPrice: true,
      stopPrice: false,
      timeInForce: false,
      stopLossPrice: false,
      takeProfitPrice: false,
    });
  });

  it("closes the bracket prices on a bracket child", () => {
    const fields = modifiableFields(order({ role: "TAKE_PROFIT", parentOrderId: "order-1" }));

    expect(fields.stopLossPrice).toBe(false);
    expect(fields.takeProfitPrice).toBe(false);
    expect(fields.quantity).toBe(true);
  });

  it("closes every field on a final order", () => {
    expect(modifiableFields(order({ status: "FILLED" }))).toEqual({
      quantity: false,
      limitPrice: false,
      stopPrice: false,
      timeInForce: false,
      stopLossPrice: false,
      takeProfitPrice: false,
    });
  });
});

describe("toModifyRequest", () => {
  it("sends only the changed field with the version", () => {
    const state = changed(initialModifyForm(order()), { limitPrice: "245.0000" });

    expect(toModifyRequest(state, 1)).toEqual({ limitPrice: "245.0000", version: 1 });
  });

  it("sends nothing but the version when no field changed", () => {
    expect(toModifyRequest(initialModifyForm(order()), 3)).toEqual({ version: 3 });
  });

  it("sends the quantity and the time in force when both changed", () => {
    const state = changed(initialModifyForm(order()), { quantity: "5", timeInForce: "DAY" });

    expect(toModifyRequest(state, 2)).toEqual({ quantity: "5.000000", timeInForce: "DAY", version: 2 });
  });

  it("sends a bracket price added on an unfilled entry", () => {
    const state = changed(initialModifyForm(order()), { stopLossPrice: "240" });

    expect(toModifyRequest(state, 1)).toEqual({ stopLossPrice: "240.0000", version: 1 });
  });

  it("sends null for a bracket price cleared on an unfilled entry", () => {
    const state = changed(initialModifyForm(order({ stopLossPrice: "240.0000" })), { stopLossPrice: "" });

    expect(toModifyRequest(state, 1)).toEqual({ stopLossPrice: null, version: 1 });
  });

  it("skips a field the order state does not open", () => {
    const state = changed(initialModifyForm(order({ type: "STOP_LIMIT", stopPrice: "260.0000", status: "TRIGGERED" })), {
      quantity: "5",
      limitPrice: "245.0000",
    });

    expect(toModifyRequest(state, 1)).toEqual({ limitPrice: "245.0000", version: 1 });
  });
});

describe("modifyErrors", () => {
  it("reports an emptied limit price", () => {
    const state = changed(initialModifyForm(order()), { limitPrice: "" });

    expect(modifyErrors(state)).toEqual({ limitPrice: "orders:errors.field.limitPrice" });
  });

  it("reports a quantity with more than six decimal places", () => {
    const state = changed(initialModifyForm(order()), { quantity: "1.0000001" });

    expect(modifyErrors(state)).toEqual({ quantity: "orders:errors.field.quantity" });
  });

  it("reports a bracket price with more than four decimal places", () => {
    const state = changed(initialModifyForm(order()), { takeProfitPrice: "275.00001" });

    expect(modifyErrors(state)).toEqual({ takeProfitPrice: "orders:errors.field.takeProfitPrice" });
  });

  it("accepts an untouched form", () => {
    expect(modifyErrors(initialModifyForm(order()))).toEqual({});
  });
});

describe("initialModifyForm", () => {
  it("fills the inputs from the order and records the editable fields", () => {
    const state = initialModifyForm(order({ stopLossPrice: "240.0000", takeProfitPrice: "275.0000" }));

    expect(state.values).toEqual({
      quantity: "10.000000",
      limitPrice: "250.0000",
      stopPrice: "",
      timeInForce: "GTC",
      stopLossPrice: "240.0000",
      takeProfitPrice: "275.0000",
    });
    expect(state.initial).toEqual(state.values);
    expect(state.editable.limitPrice).toBe(true);
  });
});
