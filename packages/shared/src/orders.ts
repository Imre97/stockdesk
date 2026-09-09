import * as z from "zod";

import { accountIdSchema, symbolSchema } from "./accounts.js";
import type { DecimalValue } from "./decimal.js";
import { decimalString, decimalStringValue } from "./decimal.js";

export const QUANTITY_DECIMALS = 6;
export const PRICE_DECIMALS = 4;
export const MIN_QUANTITY = "0.000001";
export const CLIENT_ORDER_ID_MAX = 64;

const QUANTITY_POSITIVE_ERROR = "Quantity must be positive";
const QUANTITY_PLACES_ERROR = "Quantity has more than 6 decimal places";
const QUANTITY_MIN_ERROR = "Quantity is below the minimum tradable quantity";
const PRICE_POSITIVE_ERROR = "Price must be positive";
const PRICE_PLACES_ERROR = "Price has more than 4 decimal places";
const LIMIT_PRICE_ERROR = "A limit price belongs to LIMIT and STOP_LIMIT orders only";
const STOP_PRICE_ERROR = "A stop price belongs to STOP and STOP_LIMIT orders only";
const STOP_LIMIT_RELATION_ERROR =
  "A BUY stop-limit needs a limit price at or above the stop price, a SELL one at or below it";

const VALIDATION_ERROR_PARAMS = { code: "VALIDATION_ERROR" } as const;
const STOP_LIMIT_ERROR_PARAMS = { code: "INVALID_STOP_LIMIT_PRICES" } as const;

export const ORDER_ERROR_CODES = [
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
] as const;

export type OrderErrorCode = (typeof ORDER_ERROR_CODES)[number];

export const orderSideSchema = z.enum(["BUY", "SELL"]);

export const orderTypeSchema = z.enum(["MARKET", "LIMIT", "STOP", "STOP_LIMIT"]);

export const timeInForceSchema = z.enum(["GTC", "DAY"]);

export const orderStatusSchema = z.enum([
  "PENDING",
  "OPEN",
  "TRIGGERED",
  "FILLED",
  "CANCELLED",
  "REJECTED",
  "EXPIRED",
]);

export const orderRoleSchema = z.enum(["ENTRY", "STOP_LOSS", "TAKE_PROFIT"]);

export const cancelReasonSchema = z.enum(["USER", "OCO_SIBLING_FILLED", "POSITION_CLOSED"]);

export const positionEffectSchema = z.enum([
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

export const expectedExecutionSchema = z.enum(["immediate", "waiting_for_market_open", "resting"]);

export const previewWarningSchema = z.enum(["MARKET_CLOSED", "IMMEDIATE_FILL", "OPENS_SHORT"]);

export const orderQuantitySchema = decimalString
  .refine((value) => value.greaterThan(0), { error: QUANTITY_POSITIVE_ERROR })
  .refine((value) => value.decimalPlaces() <= QUANTITY_DECIMALS, { error: QUANTITY_PLACES_ERROR })
  .refine((value) => value.greaterThanOrEqualTo(MIN_QUANTITY), { error: QUANTITY_MIN_ERROR });

export const orderPriceSchema = decimalString
  .refine((value) => value.greaterThan(0), { error: PRICE_POSITIVE_ERROR })
  .refine((value) => value.decimalPlaces() <= PRICE_DECIMALS, { error: PRICE_PLACES_ERROR });

export const orderVersionSchema = z.number().int().min(1);

const placeOrderFieldsSchema = z.object({
  symbol: symbolSchema,
  side: orderSideSchema,
  type: orderTypeSchema,
  quantity: orderQuantitySchema,
  limitPrice: orderPriceSchema.nullable().optional(),
  stopPrice: orderPriceSchema.nullable().optional(),
  timeInForce: timeInForceSchema.default("GTC"),
  stopLossPrice: orderPriceSchema.nullable().optional(),
  takeProfitPrice: orderPriceSchema.nullable().optional(),
  clientOrderId: z.string().min(1).max(CLIENT_ORDER_ID_MAX).optional(),
});

type PlaceOrderFields = z.output<typeof placeOrderFieldsSchema>;

type OrderType = z.output<typeof orderTypeSchema>;

const LIMIT_PRICE_TYPES: readonly OrderType[] = ["LIMIT", "STOP_LIMIT"];
const STOP_PRICE_TYPES: readonly OrderType[] = ["STOP", "STOP_LIMIT"];

function isPresent(value: DecimalValue | null | undefined): value is DecimalValue {
  return value !== null && value !== undefined;
}

function limitPriceMatchesType(order: PlaceOrderFields): boolean {
  return LIMIT_PRICE_TYPES.includes(order.type) === isPresent(order.limitPrice);
}

function stopPriceMatchesType(order: PlaceOrderFields): boolean {
  return STOP_PRICE_TYPES.includes(order.type) === isPresent(order.stopPrice);
}

function stopLimitPricesOrdered(order: PlaceOrderFields): boolean {
  const { type, side, limitPrice, stopPrice } = order;

  if (type !== "STOP_LIMIT" || !isPresent(limitPrice) || !isPresent(stopPrice)) return true;

  return side === "BUY" ? limitPrice.greaterThanOrEqualTo(stopPrice) : limitPrice.lessThanOrEqualTo(stopPrice);
}

export const placeOrderSchema = placeOrderFieldsSchema
  .refine(limitPriceMatchesType, {
    error: LIMIT_PRICE_ERROR,
    path: ["limitPrice"],
    params: VALIDATION_ERROR_PARAMS,
  })
  .refine(stopPriceMatchesType, {
    error: STOP_PRICE_ERROR,
    path: ["stopPrice"],
    params: VALIDATION_ERROR_PARAMS,
  })
  .refine(stopLimitPricesOrdered, {
    error: STOP_LIMIT_RELATION_ERROR,
    path: ["limitPrice"],
    params: STOP_LIMIT_ERROR_PARAMS,
  });

export const modifyOrderSchema = z.object({
  quantity: orderQuantitySchema.optional(),
  limitPrice: orderPriceSchema.optional(),
  stopPrice: orderPriceSchema.optional(),
  stopLossPrice: orderPriceSchema.nullable().optional(),
  takeProfitPrice: orderPriceSchema.nullable().optional(),
  timeInForce: timeInForceSchema.optional(),
  version: orderVersionSchema,
});

export const cancelOrderSchema = z.object({ version: orderVersionSchema });

export const orderDtoSchema = z.object({
  id: z.string().min(1),
  accountId: accountIdSchema,
  clientOrderId: z.string().nullable(),
  symbol: symbolSchema,
  side: orderSideSchema,
  type: orderTypeSchema,
  role: orderRoleSchema,
  status: orderStatusSchema,
  timeInForce: timeInForceSchema,
  quantity: decimalStringValue,
  limitPrice: decimalStringValue.nullable(),
  stopPrice: decimalStringValue.nullable(),
  stopLossPrice: decimalStringValue.nullable(),
  takeProfitPrice: decimalStringValue.nullable(),
  reservedCash: decimalStringValue,
  avgFillPrice: decimalStringValue.nullable(),
  commission: decimalStringValue,
  parentOrderId: z.string().nullable(),
  ocoGroupId: z.string().nullable(),
  cancelReason: cancelReasonSchema.nullable(),
  rejectReason: z.string().nullable(),
  version: orderVersionSchema,
  expiresAt: z.iso.datetime().nullable(),
  triggeredAt: z.iso.datetime().nullable(),
  filledAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const orderSchema = orderDtoSchema.extend({
  quantity: decimalString,
  limitPrice: decimalString.nullable(),
  stopPrice: decimalString.nullable(),
  stopLossPrice: decimalString.nullable(),
  takeProfitPrice: decimalString.nullable(),
  reservedCash: decimalString,
  avgFillPrice: decimalString.nullable(),
  commission: decimalString,
});

export const positionRecordDtoSchema = z.object({
  id: z.string().min(1),
  accountId: accountIdSchema,
  symbol: symbolSchema,
  quantity: decimalStringValue,
  averageCost: decimalStringValue,
  realizedPnl: decimalStringValue,
  openedAt: z.iso.datetime(),
  closedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});

export const positionRecordSchema = positionRecordDtoSchema.extend({
  quantity: decimalString,
  averageCost: decimalString,
  realizedPnl: decimalString,
});

export const insufficientBuyingPowerDetailsSchema = z.object({
  required: decimalStringValue,
  available: decimalStringValue,
});

export type OrderSide = z.infer<typeof orderSideSchema>;
export type OrderTypeValue = OrderType;
export type TimeInForce = z.infer<typeof timeInForceSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type OrderRole = z.infer<typeof orderRoleSchema>;
export type CancelReason = z.infer<typeof cancelReasonSchema>;
export type PositionEffect = z.infer<typeof positionEffectSchema>;
export type ExpectedExecution = z.infer<typeof expectedExecutionSchema>;
export type PreviewWarning = z.infer<typeof previewWarningSchema>;
export type PlaceOrderRequest = z.input<typeof placeOrderSchema>;
export type PlaceOrderInput = z.output<typeof placeOrderSchema>;
export type ModifyOrderRequest = z.input<typeof modifyOrderSchema>;
export type ModifyOrderInput = z.output<typeof modifyOrderSchema>;
export type CancelOrderRequest = z.input<typeof cancelOrderSchema>;
export type CancelOrderInput = z.output<typeof cancelOrderSchema>;
export type OrderDto = z.input<typeof orderSchema>;
export type Order = z.output<typeof orderSchema>;
export type PositionRecordDto = z.input<typeof positionRecordSchema>;
export type PositionRecord = z.output<typeof positionRecordSchema>;
export type InsufficientBuyingPowerDetails = z.infer<typeof insufficientBuyingPowerDetailsSchema>;
