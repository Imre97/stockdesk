import {
  priceToApi,
  quantityToApi,
  type DecimalValue,
  type ModifyOrderInput,
  type OrderTypeValue,
  type PlaceOrderRequest,
} from "@stockdesk/shared";
import { AppError } from "../../lib/errors.js";
import { orderNotModifiable } from "./conflicts.js";
import type { DecimalLike, OrderRow } from "./repository.js";

const LIMIT_PRICE_TYPES: readonly OrderTypeValue[] = ["LIMIT", "STOP_LIMIT"];
const STOP_PRICE_TYPES: readonly OrderTypeValue[] = ["STOP", "STOP_LIMIT"];

export type ModifiableField =
  | "quantity"
  | "limitPrice"
  | "stopPrice"
  | "stopLossPrice"
  | "takeProfitPrice"
  | "timeInForce";

const ALL_FIELDS: readonly ModifiableField[] = [
  "quantity",
  "limitPrice",
  "stopPrice",
  "stopLossPrice",
  "takeProfitPrice",
  "timeInForce",
];

function priceMismatch(field: ModifiableField): AppError {
  return new AppError(
    422,
    "VALIDATION_ERROR",
    `A ${field === "limitPrice" ? "limit" : "stop"} price does not belong to this order type.`,
  );
}

export function quantityAbovePosition(): AppError {
  return new AppError(
    422,
    "VALIDATION_ERROR",
    "A bracket child cannot close more than the absolute position quantity.",
  );
}

export function touchedFields(request: ModifyOrderInput): ModifiableField[] {
  return ALL_FIELDS.filter((field) => request[field] !== undefined);
}

/**
 * An `OPEN` entry accepts everything its type carries; a `TRIGGERED` stop-limit has already used
 * its stop, so only the limit and the quantity remain; a bracket child owns neither the time in
 * force nor bracket prices of its own.
 */
function allowedFields(order: OrderRow): Set<ModifiableField> {
  const allowed = new Set<ModifiableField>(["quantity"]);
  const triggered = order.status === "TRIGGERED";

  if (LIMIT_PRICE_TYPES.includes(order.type)) allowed.add("limitPrice");
  if (STOP_PRICE_TYPES.includes(order.type) && !triggered) allowed.add("stopPrice");

  if (order.role === "ENTRY" && !triggered) {
    allowed.add("timeInForce");
    allowed.add("stopLossPrice");
    allowed.add("takeProfitPrice");
  }

  return allowed;
}

export function assertModifiableFields(order: OrderRow, request: ModifyOrderInput): void {
  const allowed = allowedFields(order);

  for (const field of touchedFields(request)) {
    if (allowed.has(field)) continue;

    if (field === "limitPrice" && !LIMIT_PRICE_TYPES.includes(order.type)) {
      throw priceMismatch(field);
    }

    if (field === "stopPrice" && !STOP_PRICE_TYPES.includes(order.type)) {
      throw priceMismatch(field);
    }

    throw orderNotModifiable();
  }
}

function storedPrice(value: DecimalLike | null): string | null {
  return value === null ? null : priceToApi(value.toString());
}

function mergedPrice(
  requested: DecimalValue | null | undefined,
  stored: DecimalLike | null,
): string | null {
  if (requested === undefined) return storedPrice(stored);

  return requested === null ? null : priceToApi(requested);
}

/**
 * The merged order is re-validated by the placement schema and the placement pipeline, so a modify
 * cannot reach a state a placement would have refused.
 */
export function mergedPlacement(order: OrderRow, request: ModifyOrderInput): PlaceOrderRequest {
  return {
    symbol: order.symbol,
    side: order.side,
    type: order.type,
    quantity: quantityToApi(request.quantity ?? order.quantity.toString()),
    limitPrice: mergedPrice(request.limitPrice, order.limitPrice),
    stopPrice: mergedPrice(request.stopPrice, order.stopPrice),
    timeInForce: request.timeInForce ?? order.timeInForce,
    stopLossPrice: mergedPrice(request.stopLossPrice, order.stopLossPrice),
    takeProfitPrice: mergedPrice(request.takeProfitPrice, order.takeProfitPrice),
  };
}
