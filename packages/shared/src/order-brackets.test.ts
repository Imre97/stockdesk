import { describe, expect, it } from "vitest";

import { validateBracketPrices } from "./order-math.js";
import type { OrderSide } from "./orders.js";

describe("validateBracketPrices", () => {
  it("accepts a long bracket that straddles the entry price", () => {
    expect(
      validateBracketPrices({ side: "BUY", entryPrice: "250", stopLossPrice: "240", takeProfitPrice: "275" }),
    ).toBeNull();
  });

  it("accepts a short bracket with the stop above and the target below the entry price", () => {
    expect(
      validateBracketPrices({ side: "SELL", entryPrice: "250", stopLossPrice: "260", takeProfitPrice: "240" }),
    ).toBeNull();
  });

  it.each([
    ["a long stop loss above the entry", "BUY", "260", "275"],
    ["a long stop loss at the entry", "BUY", "250", "275"],
    ["a long take profit below the entry", "BUY", "240", "245"],
    ["a long take profit at the entry", "BUY", "240", "250"],
    ["a short stop loss below the entry", "SELL", "240", "240"],
    ["a short take profit above the entry", "SELL", "260", "260"],
  ] as [string, OrderSide, string, string][])("rejects %s", (_label, side, stopLossPrice, takeProfitPrice) => {
    expect(validateBracketPrices({ side, entryPrice: "250", stopLossPrice, takeProfitPrice })).toBe(
      "INVALID_BRACKET_PRICE",
    );
  });

  it("validates a single bracket price on its own", () => {
    expect(validateBracketPrices({ side: "BUY", entryPrice: "250", stopLossPrice: "240" })).toBeNull();
    expect(validateBracketPrices({ side: "BUY", entryPrice: "250", takeProfitPrice: "275" })).toBeNull();
    expect(validateBracketPrices({ side: "BUY", entryPrice: "250", stopLossPrice: "260" })).toBe(
      "INVALID_BRACKET_PRICE",
    );
    expect(validateBracketPrices({ side: "SELL", entryPrice: "250", takeProfitPrice: "260" })).toBe(
      "INVALID_BRACKET_PRICE",
    );
  });

  it("accepts an order without bracket prices", () => {
    expect(validateBracketPrices({ side: "BUY", entryPrice: "250" })).toBeNull();
    expect(
      validateBracketPrices({ side: "SELL", entryPrice: "250", stopLossPrice: null, takeProfitPrice: null }),
    ).toBeNull();
  });
});
