import { Decimal, placeOrderSchema, type PlaceOrderInput } from "@stockdesk/shared";
import { describe, expect, it } from "vitest";
import { AppError } from "../../lib/errors.js";
import { availableQuantity, validatePlacement, type OrderValidationInput } from "./validation.js";

const LAST = new Decimal("200");
const RATES = { shortMarginRate: new Decimal("0.5"), marketOrderBuffer: new Decimal("0.02") };

function parse(overrides: Record<string, unknown> = {}): PlaceOrderInput {
  return placeOrderSchema.parse({
    symbol: "TSLA",
    side: "SELL",
    type: "MARKET",
    quantity: "10",
    timeInForce: "GTC",
    ...overrides,
  });
}

function input(overrides: Partial<OrderValidationInput> = {}): OrderValidationInput {
  return {
    request: parse(),
    symbol: { shortable: true, fractionable: true },
    positionQuantity: new Decimal("0"),
    openOrders: [],
    lastPrice: LAST,
    marketOpen: true,
    rates: RATES,
    commission: new Decimal("0"),
    ...overrides,
  };
}

function codeOf(candidate: OrderValidationInput): string {
  try {
    validatePlacement(candidate);
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }

  return "NO_ERROR";
}

describe("availableQuantity", () => {
  it("nets a long position against the account's open closing sells", () => {
    const netted = availableQuantity(new Decimal("10"), [
      { side: "SELL", quantity: new Decimal("10") },
    ]);

    expect(netted.toString()).toBe("0");
  });

  it("nets a short position against the account's open covering buys", () => {
    const netted = availableQuantity(new Decimal("-10"), [
      { side: "BUY", quantity: new Decimal("4") },
    ]);

    expect(netted.toString()).toBe("-6");
  });

  it("ignores open orders that move the position further from zero", () => {
    const netted = availableQuantity(new Decimal("10"), [
      { side: "BUY", quantity: new Decimal("5") },
    ]);

    expect(netted.toString()).toBe("10");
  });

  it("never lets the open closing orders push the available quantity past zero", () => {
    const netted = availableQuantity(new Decimal("10"), [
      { side: "SELL", quantity: new Decimal("25") },
    ]);

    expect(netted.toString()).toBe("0");
  });
});

describe("validatePlacement", () => {
  it("classifies a sell against the quantity left after the open closing orders", () => {
    const result = validatePlacement(
      input({
        positionQuantity: new Decimal("10"),
        openOrders: [{ side: "SELL", quantity: new Decimal("10") }],
      }),
    );

    expect(result.positionEffect).toBe("open_short");
    expect(result.reservation.toString()).toBe("1020");
  });

  it("rejects a short on a symbol that is not shortable", () => {
    expect(codeOf(input({ symbol: { shortable: false, fractionable: true } }))).toBe(
      "SYMBOL_NOT_SHORTABLE",
    );
  });

  it("rejects a fractional quantity on a symbol that is not fractionable", () => {
    expect(
      codeOf(
        input({
          request: parse({ side: "BUY", quantity: "0.5" }),
          symbol: { shortable: true, fractionable: false },
        }),
      ),
    ).toBe("FRACTIONAL_NOT_ALLOWED");
  });

  it("rejects a fractional short-opening quantity", () => {
    expect(codeOf(input({ request: parse({ quantity: "1.5" }) }))).toBe(
      "FRACTIONAL_SHORT_NOT_ALLOWED",
    );
  });

  it("rejects a market order without a last price", () => {
    expect(codeOf(input({ request: parse({ side: "BUY" }), lastPrice: null }))).toBe(
      "PRICE_UNAVAILABLE",
    );
  });

  it("rejects a bracket on an order that closes a position", () => {
    expect(
      codeOf(
        input({
          request: parse({ stopLossPrice: "210.0000" }),
          positionQuantity: new Decimal("10"),
        }),
      ),
    ).toBe("BRACKET_NOT_ALLOWED");
  });

  it("rejects a bracket whose stop loss sits on the wrong side of the entry", () => {
    expect(codeOf(input({ request: parse({ stopLossPrice: "190.0000" }) }))).toBe(
      "INVALID_BRACKET_PRICE",
    );
  });

  it("reports a resting limit order that the market cannot fill yet", () => {
    const result = validatePlacement(
      input({ request: parse({ side: "BUY", type: "LIMIT", limitPrice: "180.0000" }) }),
    );

    expect(result.expectedExecution).toBe("resting");
    expect(result.warnings).toEqual([]);
    expect(result.reservation.toString()).toBe("1800");
  });

  it("warns about a marketable limit order that fills at once", () => {
    const result = validatePlacement(
      input({ request: parse({ side: "BUY", type: "LIMIT", limitPrice: "220.0000" }) }),
    );

    expect(result.expectedExecution).toBe("immediate");
    expect(result.warnings).toEqual(["IMMEDIATE_FILL"]);
  });

  it("warns that a closed market defers the fill of an order that would fill", () => {
    const result = validatePlacement(input({ request: parse({ side: "BUY" }), marketOpen: false }));

    expect(result.expectedExecution).toBe("waiting_for_market_open");
    expect(result.warnings).toEqual(["MARKET_CLOSED"]);
  });

  it("warns that a sell without a position opens a short", () => {
    const result = validatePlacement(input());

    expect(result.positionEffect).toBe("open_short");
    expect(result.warnings).toEqual(["OPENS_SHORT"]);
    expect(result.positionAfter.toString()).toBe("-10");
  });
});
