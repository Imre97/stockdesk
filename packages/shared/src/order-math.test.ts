import { describe, expect, it } from "vitest";

import { Decimal } from "./decimal.js";
import {
  buyingPower,
  estimateCost,
  isMarginDeficit,
  positionEffect,
  priceToApi,
  quantityToApi,
  referencePrice,
  reservationFor,
  roundMoney,
  roundReservation,
  sharesFromAmount,
} from "./order-math.js";
import type { OrderSide, PositionEffect } from "./orders.js";

const SHORT_MARGIN_RATE = "0.5";
const MARKET_ORDER_BUFFER = "0.02";
const MAINTENANCE_MARGIN_RATE = "0.3";

const EFFECT_CASES: [string, string, OrderSide, string, PositionEffect][] = [
  ["a buy from a flat position", "0", "BUY", "1", "open_long"],
  ["a sell from a flat position", "0", "SELL", "10", "open_short"],
  ["a buy on a long position", "10", "BUY", "5", "increase_long"],
  ["a partial sell of a long position", "10", "SELL", "4", "reduce_long"],
  ["a full sell of a long position", "10", "SELL", "10", "close_long"],
  ["a sell past a long position", "10", "SELL", "15", "flip_to_short"],
  ["a sell on a short position", "-10", "SELL", "5", "increase_short"],
  ["a partial cover of a short position", "-10", "BUY", "4", "reduce_short"],
  ["a full cover of a short position", "-10", "BUY", "10", "close_short"],
  ["a buy past a short position", "-10", "BUY", "15", "flip_to_long"],
];

describe("rounding helpers", () => {
  it("rounds money half-even to cents", () => {
    expect(roundMoney("2.005").toString()).toBe("2");
    expect(roundMoney("2.015").toString()).toBe("2.02");
    expect(roundMoney("-2.005").toString()).toBe("-2");
  });

  it("rounds a reservation up to cents", () => {
    expect(roundReservation("2.001").toString()).toBe("2.01");
    expect(roundReservation("2.000").toString()).toBe("2");
    expect(roundReservation("1019.9999216232").toString()).toBe("1020");
  });

  it("serializes quantities with six places and prices with four", () => {
    expect(quantityToApi(new Decimal("0.5"))).toBe("0.500000");
    expect(quantityToApi("10")).toBe("10.000000");
    expect(quantityToApi("-5")).toBe("-5.000000");
    expect(priceToApi(new Decimal("251.34"))).toBe("251.3400");
    expect(priceToApi("100")).toBe("100.0000");
  });
});

describe("sharesFromAmount", () => {
  it("rounds a fractionable share count down to six places", () => {
    expect(sharesFromAmount("1000", "251.34", true).toString()).toBe("3.978674");
  });

  it("rounds a non-fractionable share count down to a whole share", () => {
    expect(sharesFromAmount("1000", "251.34", false).toString()).toBe("3");
  });

  it("truncates a repeating decimal instead of rounding it up", () => {
    expect(sharesFromAmount("100", "3", true).toString()).toBe("33.333333");
    expect(sharesFromAmount("100", "3", false).toString()).toBe("33");
  });

  it("handles a large amount", () => {
    expect(sharesFromAmount("100000000", "0.5", true).toString()).toBe("200000000");
  });

  it("never buys a fraction of a share below the minimum quantity", () => {
    expect(sharesFromAmount("0.0000001", "251.34", true).toString()).toBe("0");
  });

  it.each([["0"], ["-1"]])("returns zero for the price %s", (price) => {
    expect(sharesFromAmount("1000", price, true).toString()).toBe("0");
    expect(sharesFromAmount("1000", price, false).toString()).toBe("0");
  });
});

describe("estimateCost", () => {
  it("rounds the cost of a fractional quantity to cents", () => {
    expect(estimateCost("3.978674", "251.34").toString()).toBe("1000");
  });

  it("multiplies a whole quantity by the price", () => {
    expect(estimateCost("10", "250.0000").toString()).toBe("2500");
  });

  it("keeps a six-decimal quantity exact before rounding", () => {
    expect(estimateCost("0.000001", "251.34").toString()).toBe("0");
    expect(estimateCost("1000000", "251.3456").toString()).toBe("251345600");
  });
});

describe("positionEffect", () => {
  it.each(EFFECT_CASES)("classifies %s", (_label, current, side, quantity, expected) => {
    expect(positionEffect(current, side, quantity)).toBe(expected);
  });

  it("classifies a fractional close as a close, not a reduce", () => {
    expect(positionEffect("0.500000", "SELL", "0.5")).toBe("close_long");
  });
});

describe("referencePrice", () => {
  it("uses the limit price for a limit and a stop-limit order", () => {
    expect(referencePrice("LIMIT", "250", null, "260", MARKET_ORDER_BUFFER)?.toString()).toBe("250");
    expect(referencePrice("STOP_LIMIT", "261", "260", "250", MARKET_ORDER_BUFFER)?.toString()).toBe("261");
  });

  it("uses the stop price for a stop order", () => {
    expect(referencePrice("STOP", null, "260", "250", MARKET_ORDER_BUFFER)?.toString()).toBe("260");
  });

  it("buffers the last price for a market order", () => {
    expect(referencePrice("MARKET", null, null, "251.34", MARKET_ORDER_BUFFER)?.toString()).toBe("256.3668");
  });

  it("returns null when the price it needs is missing", () => {
    expect(referencePrice("MARKET", null, null, null, MARKET_ORDER_BUFFER)).toBeNull();
    expect(referencePrice("LIMIT", null, null, "250", MARKET_ORDER_BUFFER)).toBeNull();
    expect(referencePrice("STOP", null, null, "250", MARKET_ORDER_BUFFER)).toBeNull();
  });
});

describe("reservationFor", () => {
  const base = {
    quantity: "10",
    openingQuantity: "0",
    referencePrice: "250",
    shortMarginRate: SHORT_MARGIN_RATE,
    commission: "0",
  };

  it.each([["open_long"], ["increase_long"], ["reduce_short"], ["close_short"], ["flip_to_long"]] as const)(
    "reserves the full notional for a BUY with effect %s",
    (effect) => {
      expect(reservationFor({ ...base, side: "BUY", effect }).toString()).toBe("2500");
    },
  );

  it("adds the commission to a buy reservation", () => {
    expect(reservationFor({ ...base, side: "BUY", effect: "open_long", commission: "1.25" }).toString()).toBe(
      "2501.25",
    );
  });

  it.each([["reduce_long"], ["close_long"]] as const)("reserves nothing for a SELL with effect %s", (effect) => {
    expect(reservationFor({ ...base, side: "SELL", effect, commission: "1.25" }).toString()).toBe("0");
  });

  it("reserves the short margin when a sell opens or increases a short", () => {
    expect(
      reservationFor({ ...base, side: "SELL", effect: "open_short", openingQuantity: "10" }).toString(),
    ).toBe("1250");
    expect(
      reservationFor({ ...base, side: "SELL", effect: "increase_short", openingQuantity: "10" }).toString(),
    ).toBe("1250");
  });

  it("reserves only the short-opening part of a sell that crosses zero", () => {
    expect(
      reservationFor({
        ...base,
        side: "SELL",
        effect: "flip_to_short",
        quantity: "15",
        openingQuantity: "5",
      }).toString(),
    ).toBe("625");
  });

  it("reserves nothing for a bracket child", () => {
    expect(reservationFor({ ...base, side: "BUY", effect: "close_short", role: "STOP_LOSS" }).toString()).toBe("0");
    expect(reservationFor({ ...base, side: "SELL", effect: "close_long", role: "TAKE_PROFIT" }).toString()).toBe("0");
  });

  it("rounds the reservation up to cents", () => {
    expect(
      reservationFor({ ...base, side: "BUY", effect: "open_long", quantity: "1", referencePrice: "10.0051" })
        .toString(),
    ).toBe("10.01");
    expect(
      reservationFor({
        ...base,
        side: "BUY",
        effect: "open_long",
        quantity: "3.978674",
        referencePrice: "256.3668",
      }).toString(),
    ).toBe("1020");
  });
});

describe("buyingPower", () => {
  it("equals the cash of an account with no positions", () => {
    const result = buyingPower({
      cash: "100000",
      longValue: "0",
      shortValue: "0",
      shortMarginRate: SHORT_MARGIN_RATE,
      reservedCash: "0",
    });

    expect(result.equity.toString()).toBe("100000");
    expect(result.shortMargin.toString()).toBe("0");
    expect(result.buyingPower.toString()).toBe("100000");
  });

  it("subtracts the short market value from equity and the short margin from buying power", () => {
    const result = buyingPower({
      cash: "102500",
      longValue: "0",
      shortValue: "2500",
      shortMarginRate: SHORT_MARGIN_RATE,
      reservedCash: "0",
    });

    expect(result.equity.toString()).toBe("100000");
    expect(result.shortMargin.toString()).toBe("1250");
    expect(result.buyingPower.toString()).toBe("98750");
  });

  it("subtracts the reservations of open orders", () => {
    const result = buyingPower({
      cash: "100000",
      longValue: "5000",
      shortValue: "0",
      shortMarginRate: SHORT_MARGIN_RATE,
      reservedCash: "1020",
    });

    expect(result.equity.toString()).toBe("105000");
    expect(result.buyingPower.toString()).toBe("103980");
  });

  it("rounds every result to cents", () => {
    const result = buyingPower({
      cash: "0",
      longValue: "0",
      shortValue: "1019.9999216232",
      shortMarginRate: SHORT_MARGIN_RATE,
      reservedCash: "0",
    });

    expect(result.shortMargin.toString()).toBe("510");
    expect(result.equity.toString()).toBe("-1020");
  });
});

describe("isMarginDeficit", () => {
  it("flags an account whose equity falls below the maintenance requirement", () => {
    expect(isMarginDeficit("700", "2500", MAINTENANCE_MARGIN_RATE)).toBe(true);
  });

  it("does not flag an account at or above the requirement", () => {
    expect(isMarginDeficit("750", "2500", MAINTENANCE_MARGIN_RATE)).toBe(false);
    expect(isMarginDeficit("800", "2500", MAINTENANCE_MARGIN_RATE)).toBe(false);
  });

  it("does not flag an account without shorts", () => {
    expect(isMarginDeficit("0", "0", MAINTENANCE_MARGIN_RATE)).toBe(false);
    expect(isMarginDeficit("100000", "0", MAINTENANCE_MARGIN_RATE)).toBe(false);
  });

  it("does not flag a long-only account whose equity turned negative", () => {
    expect(isMarginDeficit("-500", "0", MAINTENANCE_MARGIN_RATE)).toBe(false);
  });
});
