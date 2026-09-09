import { Decimal, orderPreviewSchema, orderSchema, placeOrderResponseSchema } from "@stockdesk/shared";
import { describe, expect, it } from "vitest";

import { HttpError } from "../../lib/http";
import { orderDto, orderPreviewDto, placeOrderResponseDto, tradeDto } from "../../test/fixtures";
import {
  insufficientBuyingPowerDetails,
  toOrderErrorKey,
  toOrderSuccessView,
  toOrderSummaryView,
  toQuantityHint,
  toSubmitLabel,
} from "./mappers";

const LOCALE = "en-US";

describe("toOrderSummaryView", () => {
  it("formats the preview figures and maps its label keys", () => {
    const preview = orderPreviewSchema.parse(orderPreviewDto({ warnings: ["MARKET_CLOSED"] }));

    expect(toOrderSummaryView(preview, LOCALE)).toEqual({
      estimatedCost: "$1,000.00",
      estimatedPrice: "$251.34",
      reservedCash: "$1,020.00",
      buyingPowerBefore: "$100,000.00",
      buyingPowerAfter: "$98,980.00",
      positionAfter: "3.978674",
      positionEffectKey: "orders:positionEffect.open_long",
      expectedExecutionKey: "orders:expectedExecution.immediate",
      warningKeys: ["orders:warnings.MARKET_CLOSED"],
    });
  });

  it("maps every warning code it receives", () => {
    const preview = orderPreviewSchema.parse(
      orderPreviewDto({ warnings: ["IMMEDIATE_FILL", "OPENS_SHORT"] }),
    );

    expect(toOrderSummaryView(preview, LOCALE).warningKeys).toEqual([
      "orders:warnings.IMMEDIATE_FILL",
      "orders:warnings.OPENS_SHORT",
    ]);
  });
});

describe("toOrderErrorKey", () => {
  const codes = [
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
    "SYMBOL_NOT_FOUND",
    "ACCOUNT_NOT_FOUND",
    "VALIDATION_ERROR",
  ];

  it.each(codes)("maps %s to its own key", (code) => {
    expect(toOrderErrorKey(new HttpError(422, code, "failed"))).toBe(`orders:errors.${code}`);
  });

  it("falls back to the generic key for an unknown code", () => {
    expect(toOrderErrorKey(new HttpError(500, "BOOM", "failed"))).toBe("orders:errors.generic");
  });

  it("falls back to the generic key for a non-http error", () => {
    expect(toOrderErrorKey(new Error("offline"))).toBe("orders:errors.generic");
  });
});

describe("insufficientBuyingPowerDetails", () => {
  it("narrows and formats the required and available amounts", () => {
    const error = new HttpError(422, "INSUFFICIENT_BUYING_POWER", "no power", {
      required: "1020.00",
      available: "500.00",
    });

    expect(insufficientBuyingPowerDetails(error, LOCALE)).toEqual({
      required: "$1,020.00",
      available: "$500.00",
    });
  });

  it("returns null when the details do not match the shared schema", () => {
    const error = new HttpError(422, "INSUFFICIENT_BUYING_POWER", "no power", { required: 1020 });

    expect(insufficientBuyingPowerDetails(error, LOCALE)).toBeNull();
  });

  it("returns null for another error code", () => {
    expect(insufficientBuyingPowerDetails(new HttpError(422, "MARGIN_DEFICIT", "deficit"), LOCALE)).toBeNull();
  });
});

describe("toSubmitLabel", () => {
  const quantity = new Decimal("10");

  it("labels a buy", () => {
    expect(toSubmitLabel({ side: "BUY", opensShort: false, quantity, symbol: "TSLA", locale: LOCALE })).toEqual({
      key: "orders:submit.buy",
      values: { quantity: "10", symbol: "TSLA" },
    });
  });

  it("labels a sell", () => {
    expect(toSubmitLabel({ side: "SELL", opensShort: false, quantity, symbol: "TSLA", locale: LOCALE })).toEqual({
      key: "orders:submit.sell",
      values: { quantity: "10", symbol: "TSLA" },
    });
  });

  it("labels a short sell", () => {
    expect(toSubmitLabel({ side: "SELL", opensShort: true, quantity, symbol: "TSLA", locale: LOCALE })).toEqual({
      key: "orders:submit.sellShort",
      values: { quantity: "10", symbol: "TSLA" },
    });
  });

  it("drops the quantity from the label while none is resolved", () => {
    expect(
      toSubmitLabel({ side: "BUY", opensShort: false, quantity: null, symbol: "TSLA", locale: LOCALE }),
    ).toEqual({ key: "orders:submit.buyPlain", values: { symbol: "TSLA" } });
  });
});

describe("toQuantityHint", () => {
  it("shows the resulting share count in USD mode", () => {
    expect(
      toQuantityHint({
        unit: "usd",
        quantity: new Decimal("3.978674"),
        cost: new Decimal("1000"),
        price: new Decimal("251.34"),
        locale: LOCALE,
      }),
    ).toEqual({ key: "orders:hint.shares", values: { quantity: "3.978674" } });
  });

  it("shows the estimated cost and the price in shares mode", () => {
    expect(
      toQuantityHint({
        unit: "shares",
        quantity: new Decimal("10"),
        cost: new Decimal("2513.4"),
        price: new Decimal("251.34"),
        locale: LOCALE,
      }),
    ).toEqual({ key: "orders:hint.cost", values: { cost: "$2,513.40", price: "$251.34" } });
  });

  it("returns null without a resolved quantity", () => {
    expect(
      toQuantityHint({ unit: "usd", quantity: null, cost: null, price: null, locale: LOCALE }),
    ).toBeNull();
  });
});

describe("toOrderSuccessView", () => {
  it("reports the fill price of an immediately filled order", () => {
    const response = placeOrderResponseSchema.parse(
      placeOrderResponseDto({
        order: orderDto({
          type: "MARKET",
          status: "FILLED",
          limitPrice: null,
          quantity: "10.000000",
          avgFillPrice: "251.3400",
          filledAt: "2026-09-08T14:31:00.000Z",
        }),
        trade: tradeDto({ price: "251.3400", amount: "2513.40" }),
      }),
    );

    expect(toOrderSuccessView(response, "immediate", LOCALE)).toEqual({
      statusKey: "orders:success.filled",
      statusValues: { price: "251.3400" },
      quantity: "10",
      costLabelKey: "orders:success.cost",
      cost: "$2,513.40",
      children: [],
    });
  });

  it("reports a resting order that waits for the market to open", () => {
    const response = placeOrderResponseSchema.parse(placeOrderResponseDto());

    expect(toOrderSuccessView(response, "waiting_for_market_open", LOCALE)).toMatchObject({
      statusKey: "orders:success.waitingForMarketOpen",
      statusValues: {},
      costLabelKey: "orders:success.reserved",
      cost: "$2,500.00",
    });
  });

  it("reports a resting order with no market-open wait", () => {
    const response = placeOrderResponseSchema.parse(placeOrderResponseDto());

    expect(toOrderSuccessView(response, "resting", LOCALE).statusKey).toBe("orders:success.resting");
  });

  it("lists the bracket children created with the entry", () => {
    const response = placeOrderResponseSchema.parse(
      placeOrderResponseDto({
        order: orderDto({ stopLossPrice: "240.0000", takeProfitPrice: "275.0000" }),
      }),
    );

    expect(toOrderSuccessView(response, "resting", LOCALE).children).toEqual([
      { roleKey: "orders:role.STOP_LOSS", price: "240.0000" },
      { roleKey: "orders:role.TAKE_PROFIT", price: "275.0000" },
    ]);
  });

  it("prefers the child orders that arrived over the entry bracket prices", () => {
    const response = placeOrderResponseSchema.parse(
      placeOrderResponseDto({
        order: orderDto({ stopLossPrice: "240.0000", takeProfitPrice: "275.0000" }),
      }),
    );
    const children = [
      orderSchema.parse(
        orderDto({
          id: "order-2",
          role: "STOP_LOSS",
          type: "STOP",
          side: "SELL",
          limitPrice: null,
          stopPrice: "238.5000",
          parentOrderId: "order-1",
        }),
      ),
      orderSchema.parse(
        orderDto({
          id: "order-3",
          role: "TAKE_PROFIT",
          side: "SELL",
          limitPrice: "277.0000",
          parentOrderId: "order-1",
        }),
      ),
    ];

    expect(toOrderSuccessView(response, "resting", LOCALE, children).children).toEqual([
      { roleKey: "orders:role.STOP_LOSS", price: "238.5000" },
      { roleKey: "orders:role.TAKE_PROFIT", price: "277.0000" },
    ]);
  });
});
