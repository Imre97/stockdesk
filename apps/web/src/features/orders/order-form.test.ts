import { Decimal } from "@stockdesk/shared";
import { describe, expect, it } from "vitest";

import {
  initialOrderFormState,
  orderFormReducer,
  parseDecimalInput,
  visibleFields,
  type OrderFormState,
} from "./order-form";

const LAST_PRICE = new Decimal("251.34");

function state(overrides: Partial<OrderFormState> = {}): OrderFormState {
  return { ...initialOrderFormState("BUY", "acc-1"), ...overrides };
}

describe("parseDecimalInput", () => {
  it("parses a plain decimal string", () => {
    expect(parseDecimalInput(" 251.34 ")?.toString()).toBe("251.34");
  });

  it("rejects a non-numeric string", () => {
    expect(parseDecimalInput("abc")).toBeNull();
  });

  it("rejects a negative value", () => {
    expect(parseDecimalInput("-1")).toBeNull();
  });
});

describe("visibleFields", () => {
  it("hides both price inputs for a market order", () => {
    expect(visibleFields("MARKET")).toEqual({ limitPrice: false, stopPrice: false });
  });

  it("shows the limit price for a limit order", () => {
    expect(visibleFields("LIMIT")).toEqual({ limitPrice: true, stopPrice: false });
  });

  it("shows the stop price for a stop order", () => {
    expect(visibleFields("STOP")).toEqual({ limitPrice: false, stopPrice: true });
  });

  it("shows both price inputs for a stop-limit order", () => {
    expect(visibleFields("STOP_LIMIT")).toEqual({ limitPrice: true, stopPrice: true });
  });
});

describe("orderFormReducer", () => {
  it("prefills the revealed price inputs with the last price", () => {
    const next = orderFormReducer(state(), {
      kind: "setType",
      orderType: "STOP_LIMIT",
      lastPrice: LAST_PRICE,
    });

    expect(next.limitPrice).toBe("251.3400");
    expect(next.stopPrice).toBe("251.3400");
  });

  it("keeps a price the user already typed when the type changes", () => {
    const typed = state({ type: "LIMIT", limitPrice: "240.0000" });

    const next = orderFormReducer(typed, {
      kind: "setType",
      orderType: "STOP_LIMIT",
      lastPrice: LAST_PRICE,
    });

    expect(next.limitPrice).toBe("240.0000");
  });

  it("prefills the buy brackets five percent below and above the entry", () => {
    const withStopLoss = orderFormReducer(state(), {
      kind: "toggleStopLoss",
      enabled: true,
      lastPrice: LAST_PRICE,
    });
    const withBoth = orderFormReducer(withStopLoss, {
      kind: "toggleTakeProfit",
      enabled: true,
      lastPrice: LAST_PRICE,
    });

    expect(withBoth.stopLossPrice).toBe("238.7730");
    expect(withBoth.takeProfitPrice).toBe("263.9070");
  });

  it("mirrors the bracket defaults when the side becomes SELL", () => {
    const buy = orderFormReducer(
      orderFormReducer(state(), { kind: "toggleStopLoss", enabled: true, lastPrice: LAST_PRICE }),
      { kind: "toggleTakeProfit", enabled: true, lastPrice: LAST_PRICE },
    );

    const sell = orderFormReducer(buy, { kind: "setSide", side: "SELL", lastPrice: LAST_PRICE });

    expect(sell.stopLossPrice).toBe("263.9070");
    expect(sell.takeProfitPrice).toBe("238.7730");
  });

  it("clears a bracket price when the checkbox is unchecked", () => {
    const enabled = orderFormReducer(state(), {
      kind: "toggleStopLoss",
      enabled: true,
      lastPrice: LAST_PRICE,
    });

    const disabled = orderFormReducer(enabled, {
      kind: "toggleStopLoss",
      enabled: false,
      lastPrice: LAST_PRICE,
    });

    expect(disabled.stopLossEnabled).toBe(false);
    expect(disabled.stopLossPrice).toBe("");
  });

  it("switches the unit and keeps both inputs", () => {
    const next = orderFormReducer(state({ quantityInput: "10" }), { kind: "setUnit", unit: "usd" });

    expect(next.unit).toBe("usd");
    expect(next.quantityInput).toBe("10");
  });
});
