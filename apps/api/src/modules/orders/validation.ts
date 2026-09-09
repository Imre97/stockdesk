import {
  Decimal,
  positionEffect,
  referencePrice,
  reservationFor,
  splitCrossingFill,
  validateBracketPrices,
  type ErrorCode,
  type ExpectedExecution,
  type OrderSide,
  type OrderTypeValue,
  type PlaceOrderInput,
  type PositionEffect,
  type PreviewWarning,
} from "@stockdesk/shared";
import { AppError } from "../../lib/errors.js";

const REDUCING_EFFECTS: readonly PositionEffect[] = [
  "reduce_long",
  "close_long",
  "reduce_short",
  "close_short",
];

const SHORT_OPENING_EFFECTS: readonly PositionEffect[] = [
  "open_short",
  "increase_short",
  "flip_to_short",
];

const BRACKET_EFFECTS: readonly PositionEffect[] = [
  "open_long",
  "increase_long",
  "open_short",
  "increase_short",
];

const LAST_PRICE_ENTRY_TYPES: readonly OrderTypeValue[] = ["MARKET", "STOP"];

export interface OrderValidationSymbol {
  shortable: boolean;
  fractionable: boolean;
}

export interface RestingOrderQuantity {
  side: OrderSide;
  quantity: Decimal;
}

export interface OrderValidationRates {
  shortMarginRate: Decimal;
  marketOrderBuffer: Decimal;
}

export interface OrderValidationInput {
  request: PlaceOrderInput;
  symbol: OrderValidationSymbol;
  positionQuantity: Decimal;
  openOrders: RestingOrderQuantity[];
  lastPrice: Decimal | null;
  marketOpen: boolean;
  rates: OrderValidationRates;
  commission: Decimal;
}

export interface OrderValidationResult {
  availableQuantity: Decimal;
  positionEffect: PositionEffect;
  closingQuantity: Decimal;
  openingQuantity: Decimal;
  referencePrice: Decimal;
  estimatedPrice: Decimal;
  reservation: Decimal;
  positionAfter: Decimal;
  expectedExecution: ExpectedExecution;
  warnings: PreviewWarning[];
  increasesPosition: boolean;
}

function unprocessable(code: ErrorCode, message: string): AppError {
  return new AppError(422, code, message);
}

function sumClosing(openOrders: RestingOrderQuantity[], closingSide: OrderSide): Decimal {
  return openOrders
    .filter((order) => order.side === closingSide)
    .reduce((total, order) => total.plus(order.quantity), new Decimal(0));
}

/**
 * A second closing order must not slip through as a reduction, so the position is netted against
 * the open closing orders on the same symbol, clamped at zero so the netting never flips the sign.
 */
export function availableQuantity(
  positionQuantity: Decimal,
  openOrders: RestingOrderQuantity[],
): Decimal {
  if (positionQuantity.isZero()) return positionQuantity;

  if (positionQuantity.greaterThan(0)) {
    return Decimal.max(0, positionQuantity.minus(sumClosing(openOrders, "SELL")));
  }

  return Decimal.min(0, positionQuantity.plus(sumClosing(openOrders, "BUY")));
}

function entryPriceFor(request: PlaceOrderInput, lastPrice: Decimal | null): Decimal | null {
  if (LAST_PRICE_ENTRY_TYPES.includes(request.type)) return lastPrice;

  return request.limitPrice ?? null;
}

function estimatedPriceFor(request: PlaceOrderInput, lastPrice: Decimal | null): Decimal | null {
  if (request.type === "MARKET") return lastPrice;
  if (request.type === "STOP") return request.stopPrice ?? null;

  return request.limitPrice ?? null;
}

function wouldFillAgainst(request: PlaceOrderInput, lastPrice: Decimal | null): boolean {
  if (request.type === "MARKET") return lastPrice !== null;
  if (lastPrice === null) return false;

  if (request.type === "LIMIT") {
    const limit = request.limitPrice ?? null;
    if (limit === null) return false;

    return request.side === "BUY"
      ? lastPrice.lessThanOrEqualTo(limit)
      : lastPrice.greaterThanOrEqualTo(limit);
  }

  const stop = request.stopPrice ?? null;
  if (stop === null) return false;

  return request.side === "BUY"
    ? lastPrice.greaterThanOrEqualTo(stop)
    : lastPrice.lessThanOrEqualTo(stop);
}

function executionOf(wouldFill: boolean, marketOpen: boolean): ExpectedExecution {
  if (!wouldFill) return "resting";

  return marketOpen ? "immediate" : "waiting_for_market_open";
}

function warningsFor(
  request: PlaceOrderInput,
  effect: PositionEffect,
  execution: ExpectedExecution,
  marketOpen: boolean,
): PreviewWarning[] {
  const warnings: PreviewWarning[] = [];

  if (!marketOpen) warnings.push("MARKET_CLOSED");
  if (request.type === "LIMIT" && execution === "immediate") warnings.push("IMMEDIATE_FILL");
  if (SHORT_OPENING_EFFECTS.includes(effect)) warnings.push("OPENS_SHORT");

  return warnings;
}

function checkQuantity(
  request: PlaceOrderInput,
  symbol: OrderValidationSymbol,
  openingQuantity: Decimal,
): void {
  if (!symbol.fractionable && request.quantity.decimalPlaces() > 0) {
    throw unprocessable("FRACTIONAL_NOT_ALLOWED", "This symbol trades in whole shares only.");
  }

  if (request.side !== "SELL" || openingQuantity.isZero()) return;

  if (!symbol.shortable) {
    throw unprocessable("SYMBOL_NOT_SHORTABLE", "This symbol cannot be sold short.");
  }

  if (openingQuantity.decimalPlaces() > 0) {
    throw unprocessable(
      "FRACTIONAL_SHORT_NOT_ALLOWED",
      "A short position opens in whole shares only.",
    );
  }
}

function checkBrackets(
  request: PlaceOrderInput,
  effect: PositionEffect,
  lastPrice: Decimal | null,
): void {
  const stopLossPrice = request.stopLossPrice ?? null;
  const takeProfitPrice = request.takeProfitPrice ?? null;

  if (stopLossPrice === null && takeProfitPrice === null) return;

  if (!BRACKET_EFFECTS.includes(effect)) {
    throw unprocessable(
      "BRACKET_NOT_ALLOWED",
      "A bracket belongs to an order that opens or increases a position.",
    );
  }

  const entryPrice = entryPriceFor(request, lastPrice);
  if (entryPrice === null) return;

  const issue = validateBracketPrices({
    side: request.side,
    entryPrice,
    stopLossPrice,
    takeProfitPrice,
  });

  if (issue !== null) {
    throw unprocessable(
      issue,
      "The stop loss and the take profit must straddle the expected entry price.",
    );
  }
}

export function validatePlacement(input: OrderValidationInput): OrderValidationResult {
  const { request, symbol, lastPrice, rates } = input;
  const available = availableQuantity(input.positionQuantity, input.openOrders);
  const effect = positionEffect(available, request.side, request.quantity);
  const split = splitCrossingFill(available, request.side, request.quantity);

  checkQuantity(request, symbol, split.openingQty);
  checkBrackets(request, effect, lastPrice);

  const reference = referencePrice(
    request.type,
    request.limitPrice ?? null,
    request.stopPrice ?? null,
    lastPrice,
    rates.marketOrderBuffer,
  );
  const estimated = estimatedPriceFor(request, lastPrice);

  if (reference === null || estimated === null) {
    throw unprocessable("PRICE_UNAVAILABLE", "No last price is known for this symbol yet.");
  }

  const execution = executionOf(wouldFillAgainst(request, lastPrice), input.marketOpen);
  const signed = request.side === "BUY" ? request.quantity : request.quantity.negated();

  return {
    availableQuantity: available,
    positionEffect: effect,
    closingQuantity: split.closingQty,
    openingQuantity: split.openingQty,
    referencePrice: reference,
    estimatedPrice: estimated,
    reservation: reservationFor({
      side: request.side,
      effect,
      quantity: request.quantity,
      openingQuantity: split.openingQty,
      referencePrice: reference,
      shortMarginRate: rates.shortMarginRate,
      commission: input.commission,
      role: "ENTRY",
    }),
    positionAfter: available.plus(signed),
    expectedExecution: execution,
    warnings: warningsFor(request, effect, execution, input.marketOpen),
    increasesPosition: !REDUCING_EFFECTS.includes(effect),
  };
}
