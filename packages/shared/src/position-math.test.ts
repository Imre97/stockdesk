import { describe, expect, it } from "vitest";

import { nextAverageCost, realizedPnlFor, splitCrossingFill } from "./position-math.js";

describe("splitCrossingFill", () => {
  it("splits a sell that crosses zero into a close and an open", () => {
    const result = splitCrossingFill("10", "SELL", "15");

    expect(result.closingQty.toString()).toBe("10");
    expect(result.openingQty.toString()).toBe("5");
  });

  it("splits a cover that crosses zero into a close and an open", () => {
    const result = splitCrossingFill("-10", "BUY", "15");

    expect(result.closingQty.toString()).toBe("10");
    expect(result.openingQty.toString()).toBe("5");
  });

  it("closes only when the fill reduces the position", () => {
    expect(splitCrossingFill("10", "SELL", "4").closingQty.toString()).toBe("4");
    expect(splitCrossingFill("10", "SELL", "4").openingQty.toString()).toBe("0");
    expect(splitCrossingFill("10", "SELL", "10").closingQty.toString()).toBe("10");
    expect(splitCrossingFill("10", "SELL", "10").openingQty.toString()).toBe("0");
  });

  it("opens only when the fill increases the position", () => {
    expect(splitCrossingFill("10", "BUY", "5").closingQty.toString()).toBe("0");
    expect(splitCrossingFill("10", "BUY", "5").openingQty.toString()).toBe("5");
    expect(splitCrossingFill("-10", "SELL", "5").closingQty.toString()).toBe("0");
    expect(splitCrossingFill("-10", "SELL", "5").openingQty.toString()).toBe("5");
  });

  it("opens the whole quantity from a flat position", () => {
    expect(splitCrossingFill("0", "SELL", "3").closingQty.toString()).toBe("0");
    expect(splitCrossingFill("0", "SELL", "3").openingQty.toString()).toBe("3");
  });

  it("splits a fractional crossing fill", () => {
    const result = splitCrossingFill("0.5", "SELL", "1.25");

    expect(result.closingQty.toString()).toBe("0.5");
    expect(result.openingQty.toString()).toBe("0.75");
  });
});

describe("nextAverageCost", () => {
  it("spreads the commission of a buy into the average cost of a new long", () => {
    const result = nextAverageCost({
      quantity: "0",
      averageCost: "0",
      fillQuantity: "10",
      fillPrice: "100",
      commission: "1",
      side: "BUY",
    });

    expect(result.toString()).toBe("100.1");
  });

  it("averages an increasing long fill", () => {
    const result = nextAverageCost({
      quantity: "10",
      averageCost: "100",
      fillQuantity: "10",
      fillPrice: "110",
      commission: "0",
      side: "BUY",
    });

    expect(result.toString()).toBe("105");
  });

  it("raises the average cost of a long by the commission", () => {
    const result = nextAverageCost({
      quantity: "10",
      averageCost: "100",
      fillQuantity: "10",
      fillPrice: "110",
      commission: "2",
      side: "BUY",
    });

    expect(result.toString()).toBe("105.1");
  });

  it("deducts the commission from the proceeds of a new short", () => {
    const result = nextAverageCost({
      quantity: "0",
      averageCost: "0",
      fillQuantity: "10",
      fillPrice: "100",
      commission: "2",
      side: "SELL",
    });

    expect(result.toString()).toBe("99.8");
  });

  it("deducts the commission from the proceeds of an increasing short", () => {
    const result = nextAverageCost({
      quantity: "-10",
      averageCost: "100",
      fillQuantity: "10",
      fillPrice: "90",
      commission: "2",
      side: "SELL",
    });

    expect(result.toString()).toBe("94.9");
  });

  it("keeps eight decimal places for a repeating average", () => {
    const result = nextAverageCost({
      quantity: "1",
      averageCost: "10",
      fillQuantity: "2",
      fillPrice: "20",
      commission: "0",
      side: "BUY",
    });

    expect(result.toString()).toBe("16.66666667");
  });

  it("averages a six-decimal quantity", () => {
    const result = nextAverageCost({
      quantity: "0.000001",
      averageCost: "100",
      fillQuantity: "0.000001",
      fillPrice: "200",
      commission: "0",
      side: "BUY",
    });

    expect(result.toString()).toBe("150");
  });

  it("averages a large quantity", () => {
    const result = nextAverageCost({
      quantity: "1000000",
      averageCost: "100",
      fillQuantity: "1000000",
      fillPrice: "200",
      commission: "0",
      side: "BUY",
    });

    expect(result.toString()).toBe("150");
  });
});

describe("realizedPnlFor", () => {
  it("realizes the gain of a long that was sold", () => {
    const result = realizedPnlFor({
      direction: 1,
      fillPrice: "110",
      averageCost: "100",
      fillQuantity: "10",
      commission: "0",
    });

    expect(result.toString()).toBe("100");
  });

  it("realizes the loss of a long that was sold", () => {
    const result = realizedPnlFor({
      direction: 1,
      fillPrice: "90",
      averageCost: "100",
      fillQuantity: "10",
      commission: "0",
    });

    expect(result.toString()).toBe("-100");
  });

  it("realizes the gain of a short that was covered", () => {
    const result = realizedPnlFor({
      direction: -1,
      fillPrice: "90",
      averageCost: "100",
      fillQuantity: "10",
      commission: "0",
    });

    expect(result.toString()).toBe("100");
  });

  it("realizes the loss of a short that was covered", () => {
    const result = realizedPnlFor({
      direction: -1,
      fillPrice: "110",
      averageCost: "100",
      fillQuantity: "10",
      commission: "0",
    });

    expect(result.toString()).toBe("-100");
  });

  it("deducts the commission from the realized result", () => {
    const result = realizedPnlFor({
      direction: 1,
      fillPrice: "110",
      averageCost: "100",
      fillQuantity: "10",
      commission: "1.5",
    });

    expect(result.toString()).toBe("98.5");
  });

  it("rounds the realized result half-even to cents", () => {
    const result = realizedPnlFor({
      direction: 1,
      fillPrice: "100.0075",
      averageCost: "100",
      fillQuantity: "2",
      commission: "0",
    });

    expect(result.toString()).toBe("0.02");
  });

  it("realizes a fractional cover", () => {
    const result = realizedPnlFor({
      direction: -1,
      fillPrice: "251.34",
      averageCost: "260",
      fillQuantity: "3.978674",
      commission: "0",
    });

    expect(result.toString()).toBe("34.46");
  });
});
