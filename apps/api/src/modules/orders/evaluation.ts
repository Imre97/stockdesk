import {
  Decimal,
  splitCrossingFill,
  type OrderSide,
  type OrderStatus,
  type OrderTypeValue,
} from "@stockdesk/shared";

export const ENGINE_REJECT_REASONS = [
  "SYMBOL_NOT_FOUND",
  "SYMBOL_NOT_SHORTABLE",
  "FRACTIONAL_NOT_ALLOWED",
  "FRACTIONAL_SHORT_NOT_ALLOWED",
  "POSITION_CONFLICT",
] as const;

export type EngineRejectReason = (typeof ENGINE_REJECT_REASONS)[number];

export type FillDecision =
  | { kind: "none" }
  | { kind: "trigger" }
  | { kind: "fill"; price: Decimal };

export interface EvaluableOrder {
  side: OrderSide;
  type: OrderTypeValue;
  status: OrderStatus;
  limitPrice: Decimal | null;
  stopPrice: Decimal | null;
}

export interface TradableSymbol {
  shortable: boolean;
  fractionable: boolean;
}

const NONE: FillDecision = { kind: "none" };
const TRIGGER: FillDecision = { kind: "trigger" };

function limitHolds(side: OrderSide, limit: Decimal, price: Decimal): boolean {
  return side === "BUY" ? price.lessThanOrEqualTo(limit) : price.greaterThanOrEqualTo(limit);
}

function stopHolds(side: OrderSide, stop: Decimal, price: Decimal): boolean {
  return side === "BUY" ? price.greaterThanOrEqualTo(stop) : price.lessThanOrEqualTo(stop);
}

function decideStop(order: EvaluableOrder, price: Decimal): FillDecision {
  const triggered = order.status === "TRIGGERED";

  if (!triggered) {
    const stop = order.stopPrice;
    if (stop === null || !stopHolds(order.side, stop, price)) return NONE;
  }

  if (order.type === "STOP") return { kind: "fill", price };

  const limit = order.limitPrice;
  if (limit === null) return NONE;
  if (limitHolds(order.side, limit, price)) return { kind: "fill", price };

  return triggered ? NONE : TRIGGER;
}

/**
 * A marketable limit always fills at the tick price: the trigger condition puts the tick at or
 * beyond the limit, so the tick is never worse for the client than the limit itself.
 */
export function decideFill(order: EvaluableOrder, price: Decimal): FillDecision {
  if (order.type === "MARKET") return { kind: "fill", price };

  if (order.type === "LIMIT") {
    const limit = order.limitPrice;

    if (limit === null || !limitHolds(order.side, limit, price)) return NONE;

    return { kind: "fill", price };
  }

  return decideStop(order, price);
}

/**
 * An order valid at placement can still be unfillable at engine time: the symbol may have lost the
 * attribute the effect needs, and the position it is measured against is the row inside the fill
 * transaction, not the one placement classified.
 */
export function rejectionReason(
  order: { side: OrderSide; quantity: Decimal },
  symbol: TradableSymbol | null,
  heldQuantity: Decimal,
): EngineRejectReason | null {
  if (symbol === null) return "SYMBOL_NOT_FOUND";

  if (!symbol.fractionable && order.quantity.decimalPlaces() > 0) return "FRACTIONAL_NOT_ALLOWED";

  const openingQuantity = new Decimal(
    splitCrossingFill(heldQuantity, order.side, order.quantity).openingQty,
  );

  if (order.side !== "SELL" || openingQuantity.isZero()) return null;
  if (!symbol.shortable) return "SYMBOL_NOT_SHORTABLE";
  if (openingQuantity.decimalPlaces() > 0) return "FRACTIONAL_SHORT_NOT_ALLOWED";

  return null;
}
