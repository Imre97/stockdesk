import { Decimal } from "@stockdesk/shared";
import { describe, expect, it } from "vitest";

import { initialOrderFormState, type OrderFormInputs, type OrderFormState } from "./order-form";
import {
  bracketsAllowed,
  estimatedCost,
  isSubmittable,
  opensShort,
  resolvedQuantity,
  toPlaceOrderRequest,
  validate,
} from "./order-form-selectors";

const LAST_PRICE = new Decimal("251.34");

function inputs(overrides: Partial<OrderFormInputs> = {}): OrderFormInputs {
  return {
    symbol: "TSLA",
    lastPrice: LAST_PRICE,
    fractionable: true,
    shortable: true,
    positionQuantity: new Decimal(0),
    ...overrides,
  };
}

function state(overrides: Partial<OrderFormState> = {}): OrderFormState {
  return { ...initialOrderFormState("BUY", "acc-1"), ...overrides };
}

describe("resolvedQuantity", () => {
  it("converts a USD amount to fractional shares on a fractionable symbol", () => {
    const usd = state({ unit: "usd", amountInput: "1000" });

    expect(resolvedQuantity(usd, inputs())?.toString()).toBe("3.978674");
  });

  it("converts a USD amount to whole shares on a non-fractionable symbol", () => {
    const usd = state({ unit: "usd", amountInput: "1000" });

    expect(resolvedQuantity(usd, inputs({ fractionable: false }))?.toString()).toBe("3");
  });

  it("parses a shares input", () => {
    expect(resolvedQuantity(state({ quantityInput: "10" }), inputs())?.toString()).toBe("10");
  });

  it("rejects more than six decimal places", () => {
    expect(resolvedQuantity(state({ quantityInput: "1.1234567" }), inputs())).toBeNull();
  });

  it("rejects a fractional quantity on a non-fractionable symbol", () => {
    expect(resolvedQuantity(state({ quantityInput: "1.5" }), inputs({ fractionable: false }))).toBeNull();
  });

  it("rejects an unparseable input", () => {
    expect(resolvedQuantity(state({ quantityInput: "abc" }), inputs())).toBeNull();
  });
});

describe("estimatedCost", () => {
  it("uses the last price for a market order", () => {
    expect(estimatedCost(state({ quantityInput: "10" }), inputs())?.toString()).toBe("2513.4");
  });

  it("uses the limit price for a limit order", () => {
    const limit = state({ type: "LIMIT", limitPrice: "250.0000", quantityInput: "10" });

    expect(estimatedCost(limit, inputs())?.toString()).toBe("2500");
  });
});

describe("bracketsAllowed", () => {
  it("allows brackets when the order opens a position", () => {
    expect(bracketsAllowed(state({ quantityInput: "10" }), inputs())).toBe(true);
  });

  it("allows brackets when the order increases a long", () => {
    const long = inputs({ positionQuantity: new Decimal(5) });

    expect(bracketsAllowed(state({ quantityInput: "10" }), long)).toBe(true);
  });

  it("forbids brackets when the order reduces a long", () => {
    const long = inputs({ positionQuantity: new Decimal(20) });
    const sell = state({ side: "SELL", quantityInput: "10" });

    expect(bracketsAllowed(sell, long)).toBe(false);
  });

  it("forbids brackets when the order flips the position", () => {
    const long = inputs({ positionQuantity: new Decimal(10) });
    const sell = state({ side: "SELL", quantityInput: "15" });

    expect(bracketsAllowed(sell, long)).toBe(false);
  });
});

describe("opensShort", () => {
  it("is true for a SELL with no position", () => {
    expect(opensShort(state({ side: "SELL", quantityInput: "10" }), inputs())).toBe(true);
  });

  it("is false for a SELL that closes a long", () => {
    const long = inputs({ positionQuantity: new Decimal(10) });

    expect(opensShort(state({ side: "SELL", quantityInput: "10" }), long)).toBe(false);
  });

  it("is false for a BUY", () => {
    expect(opensShort(state({ quantityInput: "10" }), inputs())).toBe(false);
  });
});

describe("toPlaceOrderRequest", () => {
  it("sends shares, and null for the prices the type does not use", () => {
    const usd = state({ unit: "usd", amountInput: "1000" });

    expect(toPlaceOrderRequest(usd, inputs())).toEqual({
      symbol: "TSLA",
      side: "BUY",
      type: "MARKET",
      quantity: "3.978674",
      limitPrice: null,
      stopPrice: null,
      timeInForce: "GTC",
      stopLossPrice: null,
      takeProfitPrice: null,
    });
  });

  it("sends the stop and limit prices of a stop-limit order", () => {
    const stopLimit = state({
      type: "STOP_LIMIT",
      quantityInput: "10",
      limitPrice: "252.0000",
      stopPrice: "251.0000",
      timeInForce: "DAY",
    });

    expect(toPlaceOrderRequest(stopLimit, inputs())).toMatchObject({
      type: "STOP_LIMIT",
      quantity: "10.000000",
      limitPrice: "252.0000",
      stopPrice: "251.0000",
      timeInForce: "DAY",
    });
  });

  it("sends null for an unchecked bracket even when a price is left over", () => {
    const leftover = state({ quantityInput: "10", stopLossPrice: "238.7730", stopLossEnabled: false });

    expect(toPlaceOrderRequest(leftover, inputs())).toMatchObject({ stopLossPrice: null });
  });

  it("sends the checked bracket prices", () => {
    const brackets = state({
      quantityInput: "10",
      stopLossEnabled: true,
      stopLossPrice: "238.7730",
      takeProfitEnabled: true,
      takeProfitPrice: "263.9070",
    });

    expect(toPlaceOrderRequest(brackets, inputs())).toMatchObject({
      stopLossPrice: "238.7730",
      takeProfitPrice: "263.9070",
    });
  });

  it("returns null without a resolvable quantity", () => {
    expect(toPlaceOrderRequest(state(), inputs())).toBeNull();
  });
});

describe("validate", () => {
  it("reports no error for a valid market order", () => {
    expect(validate(state({ quantityInput: "10" }), inputs())).toEqual({});
  });

  it("reports the quantity field for a seven decimal quantity", () => {
    expect(validate(state({ quantityInput: "1.1234567" }), inputs())).toEqual({
      quantity: "orders:errors.field.quantity",
    });
  });

  it("reports the amount field for an unparseable USD amount", () => {
    const usd = state({ unit: "usd", amountInput: "abc" });

    expect(validate(usd, inputs())).toEqual({ amount: "orders:errors.field.amount" });
  });

  it("reports a missing limit price", () => {
    expect(validate(state({ type: "LIMIT", quantityInput: "10" }), inputs())).toEqual({
      limitPrice: "orders:errors.field.limitPrice",
    });
  });

  it("reports the stop-limit relation on the limit price", () => {
    const stopLimit = state({
      type: "STOP_LIMIT",
      quantityInput: "10",
      limitPrice: "250.0000",
      stopPrice: "251.0000",
    });

    expect(validate(stopLimit, inputs())).toEqual({
      limitPrice: "orders:errors.INVALID_STOP_LIMIT_PRICES",
    });
  });

  it("reports a buy stop loss above the entry", () => {
    const bad = state({ quantityInput: "10", stopLossEnabled: true, stopLossPrice: "260.0000" });

    expect(validate(bad, inputs())).toEqual({ stopLossPrice: "orders:errors.INVALID_BRACKET_PRICE" });
  });

  it("reports a sell take profit above the entry", () => {
    const bad = state({
      side: "SELL",
      quantityInput: "10",
      takeProfitEnabled: true,
      takeProfitPrice: "260.0000",
    });

    expect(validate(bad, inputs())).toEqual({ takeProfitPrice: "orders:errors.INVALID_BRACKET_PRICE" });
  });

  it("reports brackets that are not allowed for the position effect", () => {
    const long = inputs({ positionQuantity: new Decimal(20) });
    const reducing = state({
      side: "SELL",
      quantityInput: "10",
      stopLossEnabled: true,
      stopLossPrice: "260.0000",
    });

    expect(validate(reducing, long)).toEqual({ stopLossPrice: "orders:errors.BRACKET_NOT_ALLOWED" });
  });

  it("reports a short on a non-shortable symbol", () => {
    const sell = state({ side: "SELL", quantityInput: "10" });

    expect(validate(sell, inputs({ shortable: false }))).toEqual({
      side: "orders:errors.SYMBOL_NOT_SHORTABLE",
    });
  });

  it("reports a fractional short quantity", () => {
    const sell = state({ side: "SELL", quantityInput: "10.5" });

    expect(validate(sell, inputs())).toEqual({
      quantity: "orders:errors.FRACTIONAL_SHORT_NOT_ALLOWED",
    });
  });

  it("reports a fractional quantity on a non-fractionable symbol", () => {
    expect(validate(state({ quantityInput: "1.5" }), inputs({ fractionable: false }))).toEqual({
      quantity: "orders:errors.FRACTIONAL_NOT_ALLOWED",
    });
  });
});

describe("isSubmittable", () => {
  it("is true for a valid order with an account", () => {
    expect(isSubmittable(state({ quantityInput: "10" }), inputs())).toBe(true);
  });

  it("is false without a quantity", () => {
    expect(isSubmittable(state(), inputs())).toBe(false);
  });

  it("is false without an account", () => {
    expect(isSubmittable(state({ accountId: null, quantityInput: "10" }), inputs())).toBe(false);
  });

  it("is false while a field error stands", () => {
    expect(isSubmittable(state({ type: "LIMIT", quantityInput: "10" }), inputs())).toBe(false);
  });
});
