import { describe, expect, it } from "vitest";

import type { ErrorCode } from "./api-error.js";
import {
  CLIENT_ORDER_ID_MAX,
  MIN_QUANTITY,
  ORDER_ERROR_CODES,
  PRICE_DECIMALS,
  QUANTITY_DECIMALS,
  cancelOrderSchema,
  cancelReasonSchema,
  expectedExecutionSchema,
  modifyOrderSchema,
  orderRoleSchema,
  orderSideSchema,
  orderStatusSchema,
  orderTypeSchema,
  placeOrderSchema,
  positionEffectSchema,
  previewWarningSchema,
  timeInForceSchema,
} from "./orders.js";

const PLACE_LIMIT_BUY = {
  symbol: "TSLA",
  side: "BUY",
  type: "LIMIT",
  quantity: "10.000000",
  limitPrice: "250.0000",
  stopPrice: null,
  timeInForce: "GTC",
  stopLossPrice: "240.0000",
  takeProfitPrice: "275.0000",
  clientOrderId: "order-idempotency-key-1",
};

const PLACE_MARKET_BUY = { symbol: "TSLA", side: "BUY", type: "MARKET", quantity: "1" };

function issueCodes(input: unknown): string[] {
  const result = placeOrderSchema.safeParse(input);

  if (result.success) return [];

  return result.error.issues.map((issue) => {
    const params = "params" in issue ? issue.params : undefined;
    const code = params?.["code"];

    return typeof code === "string" ? code : issue.code;
  });
}

function issuePaths(input: unknown): string[] {
  const result = placeOrderSchema.safeParse(input);

  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

describe("order constants", () => {
  it("fixes the decimal places and the minimum quantity from the module spec", () => {
    expect(QUANTITY_DECIMALS).toBe(6);
    expect(PRICE_DECIMALS).toBe(4);
    expect(MIN_QUANTITY).toBe("0.000001");
    expect(CLIENT_ORDER_ID_MAX).toBe(64);
  });
});

describe("ORDER_ERROR_CODES", () => {
  it("lists exactly the codes from the module spec error table", () => {
    expect(ORDER_ERROR_CODES).toEqual([
      "INSUFFICIENT_BUYING_POWER",
      "MARGIN_DEFICIT",
      "SYMBOL_NOT_SHORTABLE",
      "FRACTIONAL_NOT_ALLOWED",
      "FRACTIONAL_SHORT_NOT_ALLOWED",
      "BRACKET_NOT_ALLOWED",
      "INVALID_BRACKET_PRICE",
      "INVALID_STOP_LIMIT_PRICES",
      "ORDER_NOT_FOUND",
      "ORDER_NOT_MODIFIABLE",
      "ORDER_NOT_CANCELLABLE",
      "ORDER_VERSION_CONFLICT",
      "PRICE_UNAVAILABLE",
    ]);
  });

  it("joins the shared ErrorCode union", () => {
    const codes: ErrorCode[] = [...ORDER_ERROR_CODES];

    for (const code of ORDER_ERROR_CODES) {
      expect(codes).toContain(code);
    }
  });

  it.each([["SYMBOL_NOT_FOUND"], ["ACCOUNT_NOT_FOUND"], ["VALIDATION_ERROR"]])(
    "does not duplicate the reused code %s",
    (code) => {
      expect(ORDER_ERROR_CODES).not.toContain(code);
    },
  );
});

describe("order enums", () => {
  it("lists the Prisma enum values", () => {
    expect(orderSideSchema.options).toEqual(["BUY", "SELL"]);
    expect(orderTypeSchema.options).toEqual(["MARKET", "LIMIT", "STOP", "STOP_LIMIT"]);
    expect(timeInForceSchema.options).toEqual(["GTC", "DAY"]);
    expect(orderStatusSchema.options).toEqual([
      "PENDING",
      "OPEN",
      "TRIGGERED",
      "FILLED",
      "CANCELLED",
      "REJECTED",
      "EXPIRED",
    ]);
    expect(orderRoleSchema.options).toEqual(["ENTRY", "STOP_LOSS", "TAKE_PROFIT"]);
    expect(cancelReasonSchema.options).toEqual(["USER", "OCO_SIBLING_FILLED", "POSITION_CLOSED"]);
  });

  it("lists the ten position effects and the preview enums", () => {
    expect(positionEffectSchema.options).toEqual([
      "open_long",
      "increase_long",
      "reduce_long",
      "close_long",
      "open_short",
      "increase_short",
      "reduce_short",
      "close_short",
      "flip_to_short",
      "flip_to_long",
    ]);
    expect(expectedExecutionSchema.options).toEqual(["immediate", "waiting_for_market_open", "resting"]);
    expect(previewWarningSchema.options).toEqual(["MARKET_CLOSED", "IMMEDIATE_FILL", "OPENS_SHORT"]);
  });

  it.each([["pending"], ["PARTIALLY_FILLED"], [""]])("rejects the unknown status %s", (status) => {
    expect(orderStatusSchema.safeParse(status).success).toBe(false);
  });
});

describe("placeOrderSchema", () => {
  it("accepts the request from the module spec and transforms the decimals", () => {
    const result = placeOrderSchema.parse(PLACE_LIMIT_BUY);

    expect(result.quantity.toString()).toBe("10");
    expect(result.limitPrice?.toString()).toBe("250");
    expect(result.stopPrice).toBeNull();
    expect(result.stopLossPrice?.toString()).toBe("240");
    expect(result.takeProfitPrice?.toString()).toBe("275");
    expect(result.clientOrderId).toBe("order-idempotency-key-1");
  });

  it("defaults the time in force to GTC", () => {
    expect(placeOrderSchema.parse(PLACE_MARKET_BUY).timeInForce).toBe("GTC");
  });

  it("accepts the minimum quantity", () => {
    expect(placeOrderSchema.parse({ ...PLACE_MARKET_BUY, quantity: MIN_QUANTITY }).quantity.toString()).toBe(
      "0.000001",
    );
  });

  it.each([["0"], ["-1"], ["0.0000001"], ["1e3"], ["abc"]])("rejects the quantity %s", (quantity) => {
    expect(placeOrderSchema.safeParse({ ...PLACE_MARKET_BUY, quantity }).success).toBe(false);
  });

  it.each([["0"], ["-250"], ["250.00001"]])("rejects the limit price %s", (limitPrice) => {
    expect(placeOrderSchema.safeParse({ ...PLACE_LIMIT_BUY, limitPrice }).success).toBe(false);
  });

  it("requires a limit price for a LIMIT order", () => {
    expect(issueCodes({ ...PLACE_LIMIT_BUY, limitPrice: null })).toContain("VALIDATION_ERROR");
    expect(issuePaths({ ...PLACE_LIMIT_BUY, limitPrice: null })).toContain("limitPrice");
  });

  it("requires a stop price for a STOP order", () => {
    const stopOrder = { ...PLACE_MARKET_BUY, type: "STOP" };

    expect(issueCodes(stopOrder)).toContain("VALIDATION_ERROR");
    expect(issuePaths(stopOrder)).toContain("stopPrice");
    expect(placeOrderSchema.safeParse({ ...stopOrder, stopPrice: "260.0000" }).success).toBe(true);
  });

  it("requires both prices for a STOP_LIMIT order", () => {
    const base = { ...PLACE_MARKET_BUY, type: "STOP_LIMIT" };

    expect(placeOrderSchema.safeParse({ ...base, stopPrice: "260.0000" }).success).toBe(false);
    expect(placeOrderSchema.safeParse({ ...base, limitPrice: "261.0000" }).success).toBe(false);
    expect(placeOrderSchema.safeParse({ ...base, stopPrice: "260.0000", limitPrice: "261.0000" }).success).toBe(true);
  });

  it("rejects a price a MARKET order does not use", () => {
    expect(placeOrderSchema.safeParse({ ...PLACE_MARKET_BUY, limitPrice: "250.0000" }).success).toBe(false);
    expect(placeOrderSchema.safeParse({ ...PLACE_MARKET_BUY, stopPrice: "250.0000" }).success).toBe(false);
  });

  it("requires the BUY stop-limit price to be at or above the stop price", () => {
    const base = { ...PLACE_MARKET_BUY, type: "STOP_LIMIT", side: "BUY", stopPrice: "260.0000" };

    expect(issueCodes({ ...base, limitPrice: "259.0000" })).toContain("INVALID_STOP_LIMIT_PRICES");
    expect(placeOrderSchema.safeParse({ ...base, limitPrice: "260.0000" }).success).toBe(true);
    expect(placeOrderSchema.safeParse({ ...base, limitPrice: "261.0000" }).success).toBe(true);
  });

  it("requires the SELL stop-limit price to be at or below the stop price", () => {
    const base = { ...PLACE_MARKET_BUY, type: "STOP_LIMIT", side: "SELL", stopPrice: "240.0000" };

    expect(issueCodes({ ...base, limitPrice: "241.0000" })).toContain("INVALID_STOP_LIMIT_PRICES");
    expect(placeOrderSchema.safeParse({ ...base, limitPrice: "239.0000" }).success).toBe(true);
  });

  it("leaves the bracket direction to the service because it needs the entry price", () => {
    const inverted = { ...PLACE_LIMIT_BUY, stopLossPrice: "275.0000", takeProfitPrice: "240.0000" };

    expect(placeOrderSchema.safeParse(inverted).success).toBe(true);
  });

  it("bounds the client order id", () => {
    expect(placeOrderSchema.safeParse({ ...PLACE_MARKET_BUY, clientOrderId: "" }).success).toBe(false);
    expect(
      placeOrderSchema.safeParse({ ...PLACE_MARKET_BUY, clientOrderId: "a".repeat(CLIENT_ORDER_ID_MAX) }).success,
    ).toBe(true);
    expect(
      placeOrderSchema.safeParse({ ...PLACE_MARKET_BUY, clientOrderId: "a".repeat(CLIENT_ORDER_ID_MAX + 1) }).success,
    ).toBe(false);
  });

  it.each([["tsla"], [""], ["TOO-LONG-SYMBOL"]])("rejects the symbol %s", (symbol) => {
    expect(placeOrderSchema.safeParse({ ...PLACE_MARKET_BUY, symbol }).success).toBe(false);
  });
});

describe("modifyOrderSchema", () => {
  it("accepts a limit price change with the current version", () => {
    const result = modifyOrderSchema.parse({ limitPrice: "249.5000", version: 3 });

    expect(result.limitPrice?.toString()).toBe("249.5");
    expect(result.version).toBe(3);
    expect(result.quantity).toBeUndefined();
  });

  it("accepts null bracket prices so a bracket can be removed", () => {
    const result = modifyOrderSchema.parse({ stopLossPrice: null, takeProfitPrice: null, version: 1 });

    expect(result.stopLossPrice).toBeNull();
    expect(result.takeProfitPrice).toBeNull();
  });

  it("accepts a quantity and a time in force change", () => {
    const result = modifyOrderSchema.parse({ quantity: "0.500000", timeInForce: "DAY", version: 2 });

    expect(result.quantity?.toString()).toBe("0.5");
    expect(result.timeInForce).toBe("DAY");
  });

  it.each([[undefined], [0], [1.5], ["1"]])("rejects the version %s", (version) => {
    expect(modifyOrderSchema.safeParse({ limitPrice: "1.0000", version }).success).toBe(false);
  });

  it("rejects an out-of-range quantity or price", () => {
    expect(modifyOrderSchema.safeParse({ quantity: "0", version: 1 }).success).toBe(false);
    expect(modifyOrderSchema.safeParse({ limitPrice: "1.00001", version: 1 }).success).toBe(false);
  });

  it("does not accept a null limit price", () => {
    expect(modifyOrderSchema.safeParse({ limitPrice: null, version: 1 }).success).toBe(false);
  });
});

describe("cancelOrderSchema", () => {
  it("requires the client version", () => {
    expect(cancelOrderSchema.parse({ version: 7 })).toEqual({ version: 7 });
    expect(cancelOrderSchema.safeParse({}).success).toBe(false);
    expect(cancelOrderSchema.safeParse({ version: 0 }).success).toBe(false);
  });
});
