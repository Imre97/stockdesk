import * as z from "zod";

import { accountIdSchema, accountSummaryDtoSchema, accountSummarySchema, symbolSchema } from "./accounts.js";
import { decimalString, decimalStringValue } from "./decimal.js";
import { tradeDtoSchema, tradeSchema } from "./market.js";
import {
  expectedExecutionSchema,
  orderDtoSchema,
  orderSchema,
  positionEffectSchema,
  positionRecordDtoSchema,
  positionRecordSchema,
  previewWarningSchema,
} from "./orders.js";

export const ORDERS_PAGE_DEFAULT = 50;
export const ORDERS_PAGE_MAX = 200;

export const ordersStatusFilterSchema = z.enum(["active", "filled", "all"]);

export const orderPreviewDtoSchema = z.object({
  quantity: decimalStringValue,
  estimatedPrice: decimalStringValue,
  estimatedCost: decimalStringValue,
  reservedCash: decimalStringValue,
  commission: decimalStringValue,
  positionEffect: positionEffectSchema,
  positionAfter: decimalStringValue,
  buyingPowerBefore: decimalStringValue,
  buyingPowerAfter: decimalStringValue,
  expectedExecution: expectedExecutionSchema,
  warnings: z.array(previewWarningSchema),
});

export const orderPreviewSchema = orderPreviewDtoSchema.extend({
  quantity: decimalString,
  estimatedPrice: decimalString,
  estimatedCost: decimalString,
  reservedCash: decimalString,
  commission: decimalString,
  positionAfter: decimalString,
  buyingPowerBefore: decimalString,
  buyingPowerAfter: decimalString,
});

export const orderPreviewResponseDtoSchema = z.object({ preview: orderPreviewDtoSchema });

export const orderPreviewResponseSchema = z.object({ preview: orderPreviewSchema });

export const ordersQuerySchema = z.object({
  status: ordersStatusFilterSchema.default("active"),
  symbol: symbolSchema.optional(),
  accountId: accountIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(ORDERS_PAGE_MAX).default(ORDERS_PAGE_DEFAULT),
  cursor: z.string().min(1).optional(),
});

export const ordersResponseDtoSchema = z.object({
  orders: z.array(orderDtoSchema),
  nextCursor: z.string().nullable(),
});

export const ordersResponseSchema = ordersResponseDtoSchema.extend({ orders: z.array(orderSchema) });

export const orderDetailResponseDtoSchema = z.object({
  order: orderDtoSchema,
  children: z.array(orderDtoSchema),
  trades: z.array(tradeDtoSchema),
});

export const orderDetailResponseSchema = z.object({
  order: orderSchema,
  children: z.array(orderSchema),
  trades: z.array(tradeSchema),
});

export const placeOrderResponseDtoSchema = z.object({
  order: orderDtoSchema,
  trade: tradeDtoSchema.optional(),
  position: positionRecordDtoSchema.optional(),
  account: accountSummaryDtoSchema,
});

export const placeOrderResponseSchema = z.object({
  order: orderSchema,
  trade: tradeSchema.optional(),
  position: positionRecordSchema.optional(),
  account: accountSummarySchema,
});

export type OrdersStatusFilter = z.infer<typeof ordersStatusFilterSchema>;
export type OrderPreviewDto = z.input<typeof orderPreviewSchema>;
export type OrderPreview = z.output<typeof orderPreviewSchema>;
export type OrderPreviewResponseDto = z.input<typeof orderPreviewResponseSchema>;
export type OrderPreviewResponse = z.output<typeof orderPreviewResponseSchema>;
export type OrdersQueryRequest = z.input<typeof ordersQuerySchema>;
export type OrdersQuery = z.output<typeof ordersQuerySchema>;
export type OrdersResponseDto = z.input<typeof ordersResponseSchema>;
export type OrdersResponse = z.output<typeof ordersResponseSchema>;
export type OrderDetailResponseDto = z.input<typeof orderDetailResponseSchema>;
export type OrderDetailResponse = z.output<typeof orderDetailResponseSchema>;
export type PlaceOrderResponseDto = z.input<typeof placeOrderResponseSchema>;
export type PlaceOrderResponse = z.output<typeof placeOrderResponseSchema>;
