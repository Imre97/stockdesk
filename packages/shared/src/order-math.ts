import type { DecimalValue } from "./decimal.js";
import { Decimal, toApiString } from "./decimal.js";
import type { OrderRole, OrderSide, OrderTypeValue, PositionEffect } from "./orders.js";
import { PRICE_DECIMALS, QUANTITY_DECIMALS } from "./orders.js";

export const MONEY_DECIMALS = 2;

export type DecimalInput = DecimalValue | string;

export type ReservationInput = {
  side: OrderSide;
  effect: PositionEffect;
  quantity: DecimalInput;
  openingQuantity: DecimalInput;
  referencePrice: DecimalInput;
  shortMarginRate: DecimalInput;
  commission: DecimalInput;
  role?: OrderRole;
};

export type BuyingPowerInput = {
  cash: DecimalInput;
  longValue: DecimalInput;
  shortValue: DecimalInput;
  shortMarginRate: DecimalInput;
  reservedCash: DecimalInput;
};

export type BuyingPowerResult = {
  equity: DecimalValue;
  shortMargin: DecimalValue;
  buyingPower: DecimalValue;
};

export type BracketPricesInput = {
  side: OrderSide;
  entryPrice: DecimalInput;
  stopLossPrice?: DecimalInput | null;
  takeProfitPrice?: DecimalInput | null;
};

const SHORT_OPENING_EFFECTS: readonly PositionEffect[] = ["open_short", "increase_short", "flip_to_short"];

function toOptionalDecimal(value: DecimalInput | null | undefined): DecimalValue | null {
  return value === null || value === undefined ? null : new Decimal(value);
}

export function roundMoney(value: DecimalInput): DecimalValue {
  return new Decimal(value).toDecimalPlaces(MONEY_DECIMALS, Decimal.ROUND_HALF_EVEN);
}

export function roundReservation(value: DecimalInput): DecimalValue {
  return new Decimal(value).toDecimalPlaces(MONEY_DECIMALS, Decimal.ROUND_UP);
}

export function quantityToApi(quantity: DecimalInput): string {
  return toApiString(quantity, QUANTITY_DECIMALS);
}

export function priceToApi(price: DecimalInput): string {
  return toApiString(price, PRICE_DECIMALS);
}

export function sharesFromAmount(amount: DecimalInput, price: DecimalInput, fractionable: boolean): DecimalValue {
  const priceValue = new Decimal(price);

  if (priceValue.lessThanOrEqualTo(0)) return new Decimal(0);

  const places = fractionable ? QUANTITY_DECIMALS : 0;

  return new Decimal(amount).dividedBy(priceValue).toDecimalPlaces(places, Decimal.ROUND_DOWN);
}

export function estimateCost(quantity: DecimalInput, price: DecimalInput): DecimalValue {
  return roundMoney(new Decimal(quantity).times(price));
}

export function positionEffect(
  currentQuantity: DecimalInput,
  side: OrderSide,
  quantity: DecimalInput,
): PositionEffect {
  const current = new Decimal(currentQuantity);
  const requested = new Decimal(quantity);

  if (current.isZero()) return side === "BUY" ? "open_long" : "open_short";

  if (current.greaterThan(0)) {
    if (side === "BUY") return "increase_long";
    if (requested.lessThan(current)) return "reduce_long";

    return requested.equals(current) ? "close_long" : "flip_to_short";
  }

  const absolute = current.absoluteValue();

  if (side === "SELL") return "increase_short";
  if (requested.lessThan(absolute)) return "reduce_short";

  return requested.equals(absolute) ? "close_short" : "flip_to_long";
}

export function referencePrice(
  type: OrderTypeValue,
  limitPrice: DecimalInput | null | undefined,
  stopPrice: DecimalInput | null | undefined,
  last: DecimalInput | null | undefined,
  marketOrderBuffer: DecimalInput,
): DecimalValue | null {
  if (type === "LIMIT" || type === "STOP_LIMIT") return toOptionalDecimal(limitPrice);
  if (type === "STOP") return toOptionalDecimal(stopPrice);

  const lastPrice = toOptionalDecimal(last);

  return lastPrice === null ? null : lastPrice.times(new Decimal(1).plus(marketOrderBuffer));
}

export function reservationFor(input: ReservationInput): DecimalValue {
  const role = input.role ?? "ENTRY";

  if (role !== "ENTRY") return new Decimal(0);

  const commission = new Decimal(input.commission);

  if (input.side === "BUY") {
    return roundReservation(new Decimal(input.quantity).times(input.referencePrice).plus(commission));
  }

  if (!SHORT_OPENING_EFFECTS.includes(input.effect)) return new Decimal(0);

  const margin = new Decimal(input.openingQuantity)
    .times(input.referencePrice)
    .times(input.shortMarginRate)
    .plus(commission);

  return roundReservation(margin);
}

export function buyingPower(input: BuyingPowerInput): BuyingPowerResult {
  const equity = roundMoney(new Decimal(input.cash).plus(input.longValue).minus(input.shortValue));
  const shortMargin = roundMoney(new Decimal(input.shortValue).times(input.shortMarginRate));

  return {
    equity,
    shortMargin,
    buyingPower: roundMoney(equity.minus(shortMargin).minus(new Decimal(input.reservedCash))),
  };
}

export function isMarginDeficit(
  equity: DecimalInput,
  shortValue: DecimalInput,
  maintenanceRate: DecimalInput,
): boolean {
  return new Decimal(equity).lessThan(new Decimal(shortValue).times(maintenanceRate));
}

export function validateBracketPrices(input: BracketPricesInput): "INVALID_BRACKET_PRICE" | null {
  const entry = new Decimal(input.entryPrice);
  const stopLoss = toOptionalDecimal(input.stopLossPrice);
  const takeProfit = toOptionalDecimal(input.takeProfitPrice);
  const long = input.side === "BUY";

  if (stopLoss !== null && (long ? stopLoss.greaterThanOrEqualTo(entry) : stopLoss.lessThanOrEqualTo(entry))) {
    return "INVALID_BRACKET_PRICE";
  }

  if (takeProfit !== null && (long ? takeProfit.lessThanOrEqualTo(entry) : takeProfit.greaterThanOrEqualTo(entry))) {
    return "INVALID_BRACKET_PRICE";
  }

  return null;
}
