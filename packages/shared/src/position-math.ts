import type { DecimalValue } from "./decimal.js";
import { Decimal } from "./decimal.js";
import type { DecimalInput } from "./order-math.js";
import { roundMoney } from "./order-math.js";
import type { OrderSide } from "./orders.js";

export const AVERAGE_COST_DECIMALS = 8;

export type CrossingFillSplit = {
  closingQty: DecimalValue;
  openingQty: DecimalValue;
};

export type NextAverageCostInput = {
  quantity: DecimalInput;
  averageCost: DecimalInput;
  fillQuantity: DecimalInput;
  fillPrice: DecimalInput;
  commission: DecimalInput;
  side: OrderSide;
};

export type RealizedPnlInput = {
  direction: 1 | -1;
  fillPrice: DecimalInput;
  averageCost: DecimalInput;
  fillQuantity: DecimalInput;
  commission: DecimalInput;
};

export function splitCrossingFill(
  currentQuantity: DecimalInput,
  side: OrderSide,
  quantity: DecimalInput,
): CrossingFillSplit {
  const current = new Decimal(currentQuantity);
  const requested = new Decimal(quantity);
  const reduces = side === "SELL" ? current.greaterThan(0) : current.lessThan(0);

  if (!reduces) return { closingQty: new Decimal(0), openingQty: requested };

  const closingQty = Decimal.min(requested, current.absoluteValue());

  return { closingQty, openingQty: requested.minus(closingQty) };
}

/**
 * The commission of a buy is spread into the average cost; the commission of a
 * short sale is deducted from the proceeds, which lowers the average sale price.
 */
export function nextAverageCost(input: NextAverageCostInput): DecimalValue {
  const heldQuantity = new Decimal(input.quantity).absoluteValue();
  const fillQuantity = new Decimal(input.fillQuantity);
  const totalQuantity = heldQuantity.plus(fillQuantity);

  if (totalQuantity.isZero()) {
    return new Decimal(input.fillPrice).toDecimalPlaces(AVERAGE_COST_DECIMALS, Decimal.ROUND_HALF_EVEN);
  }

  const commission = new Decimal(input.commission);
  const signedCommission = input.side === "BUY" ? commission : commission.negated();
  const total = new Decimal(input.averageCost)
    .times(heldQuantity)
    .plus(fillQuantity.times(input.fillPrice))
    .plus(signedCommission);

  return total.dividedBy(totalQuantity).toDecimalPlaces(AVERAGE_COST_DECIMALS, Decimal.ROUND_HALF_EVEN);
}

export function realizedPnlFor(input: RealizedPnlInput): DecimalValue {
  const gross = new Decimal(input.fillPrice)
    .minus(input.averageCost)
    .times(input.direction)
    .times(input.fillQuantity);

  return roundMoney(gross.minus(input.commission));
}
