import * as z from "zod";

import { decimalString, decimalStringValue } from "./decimal.js";

export const ACCOUNT_LIMIT = 10;
export const ACCOUNT_NAME_MIN = 1;
export const ACCOUNT_NAME_MAX = 40;

const SYMBOL_MIN_LENGTH = 1;
const SYMBOL_MAX_LENGTH = 10;
const SYMBOL_PATTERN = /^[A-Z0-9.-]+$/;
const SYMBOL_ERROR = "Expected an uppercase ticker symbol";

export const ACCOUNT_ERROR_CODES = [
  "ACCOUNT_NOT_FOUND",
  "ACCOUNT_NAME_TAKEN",
  "ACCOUNT_LIMIT_REACHED",
  "DEPOSIT_LIMIT_EXCEEDED",
] as const;

export type AccountErrorCode = (typeof ACCOUNT_ERROR_CODES)[number];

export const accountIdSchema = z.string().min(1);

export const accountNameSchema = z.string().trim().min(ACCOUNT_NAME_MIN).max(ACCOUNT_NAME_MAX);

export const symbolSchema = z
  .string()
  .min(SYMBOL_MIN_LENGTH)
  .max(SYMBOL_MAX_LENGTH)
  .regex(SYMBOL_PATTERN, SYMBOL_ERROR);

export const accountSummaryDtoSchema = z.object({
  id: accountIdSchema,
  name: z.string(),
  cash: decimalStringValue,
  positionsValue: decimalStringValue,
  equity: decimalStringValue,
  unrealizedPnl: decimalStringValue,
  unrealizedPnlPct: decimalStringValue,
  dailyPnl: decimalStringValue,
  dailyPnlPct: decimalStringValue,
  longValue: decimalStringValue,
  shortValue: decimalStringValue,
  shortMargin: decimalStringValue,
  reservedCash: decimalStringValue,
  buyingPower: decimalStringValue,
  marginDeficit: z.boolean(),
  createdAt: z.iso.datetime(),
});

export const accountSummarySchema = accountSummaryDtoSchema.extend({
  cash: decimalString,
  positionsValue: decimalString,
  equity: decimalString,
  unrealizedPnl: decimalString,
  unrealizedPnlPct: decimalString,
  dailyPnl: decimalString,
  dailyPnlPct: decimalString,
  longValue: decimalString,
  shortValue: decimalString,
  shortMargin: decimalString,
  reservedCash: decimalString,
  buyingPower: decimalString,
});

export const accountsResponseSchema = z.object({ accounts: z.array(accountSummarySchema) });

export const accountResponseSchema = z.object({ account: accountSummarySchema });

export const createAccountSchema = z.object({ name: accountNameSchema });

export const renameAccountSchema = z.object({ name: accountNameSchema });

export const equityRangeSchema = z.enum(["1D", "5D", "1W", "1M", "1Y"]);

export const equityPointSchema = z.object({ at: z.iso.datetime(), equity: decimalString });

export const equityResponseSchema = z.object({
  range: equityRangeSchema,
  points: z.array(equityPointSchema),
});

export const positionSchema = z.object({
  symbol: symbolSchema,
  quantity: decimalString,
  averageCost: decimalString,
  lastPrice: decimalString,
  marketValue: decimalString,
  unrealizedPnl: decimalString,
  unrealizedPnlPct: decimalString,
  dailyChange: decimalString,
  dailyChangePct: decimalString,
  realizedPnl: decimalString,
});

export const positionsResponseSchema = z.object({ positions: z.array(positionSchema) });

export type AccountSummaryDto = z.input<typeof accountSummarySchema>;
export type AccountSummary = z.output<typeof accountSummarySchema>;
export type AccountsResponseDto = z.input<typeof accountsResponseSchema>;
export type AccountsResponse = z.output<typeof accountsResponseSchema>;
export type AccountResponseDto = z.input<typeof accountResponseSchema>;
export type AccountResponse = z.output<typeof accountResponseSchema>;
export type CreateAccountRequest = z.input<typeof createAccountSchema>;
export type CreateAccountInput = z.output<typeof createAccountSchema>;
export type RenameAccountRequest = z.input<typeof renameAccountSchema>;
export type RenameAccountInput = z.output<typeof renameAccountSchema>;
export type EquityRange = z.infer<typeof equityRangeSchema>;
export type EquityPointDto = z.input<typeof equityPointSchema>;
export type EquityPoint = z.output<typeof equityPointSchema>;
export type EquityResponseDto = z.input<typeof equityResponseSchema>;
export type EquityResponse = z.output<typeof equityResponseSchema>;
export type PositionDto = z.input<typeof positionSchema>;
export type Position = z.output<typeof positionSchema>;
export type PositionsResponseDto = z.input<typeof positionsResponseSchema>;
export type PositionsResponse = z.output<typeof positionsResponseSchema>;
