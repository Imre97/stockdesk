import * as z from "zod";

import { accountSummaryDtoSchema, symbolSchema } from "./accounts.js";
import { decimalStringValue } from "./decimal.js";
import {
  MARKET_ERROR_CODES,
  barDtoSchema,
  marketStatusValueSchema,
  timeframeSchema,
} from "./market.js";

export const QUOTE_SUBSCRIPTION_LIMIT = 50;
export const BAR_SUBSCRIPTION_LIMIT = 5;

const quotesChannelShape = {
  channel: z.literal("quotes"),
  symbols: z.array(symbolSchema).min(1).max(QUOTE_SUBSCRIPTION_LIMIT),
};

const barsChannelShape = {
  channel: z.literal("bars"),
  symbol: symbolSchema,
  timeframe: timeframeSchema,
};

export const clientAuthMessageSchema = z.object({
  type: z.literal("auth"),
  token: z.string().min(1),
});

export const subscribeQuotesMessageSchema = z.object({ type: z.literal("subscribe"), ...quotesChannelShape });

export const subscribeBarsMessageSchema = z.object({ type: z.literal("subscribe"), ...barsChannelShape });

export const unsubscribeQuotesMessageSchema = z.object({ type: z.literal("unsubscribe"), ...quotesChannelShape });

export const unsubscribeBarsMessageSchema = z.object({ type: z.literal("unsubscribe"), ...barsChannelShape });

export const clientSubscribeMessageSchema = z.discriminatedUnion("channel", [
  subscribeQuotesMessageSchema,
  subscribeBarsMessageSchema,
]);

export const clientUnsubscribeMessageSchema = z.discriminatedUnion("channel", [
  unsubscribeQuotesMessageSchema,
  unsubscribeBarsMessageSchema,
]);

export const clientMessageSchema = z.union([
  clientAuthMessageSchema,
  clientSubscribeMessageSchema,
  clientUnsubscribeMessageSchema,
]);

export const authOkMessageSchema = z.object({
  type: z.literal("auth_ok"),
  userId: z.string().min(1),
});

export const accountSummaryMessageSchema = z.object({
  type: z.literal("account_summary"),
  accounts: z.array(accountSummaryDtoSchema),
});

export const quoteMessageSchema = z.object({
  type: z.literal("quote"),
  symbol: symbolSchema,
  price: decimalStringValue,
  size: decimalStringValue,
  at: z.iso.datetime(),
  prevClose: decimalStringValue.nullable(),
});

export const barMessageSchema = z.object({
  type: z.literal("bar"),
  symbol: symbolSchema,
  timeframe: timeframeSchema,
  bar: barDtoSchema,
  isFinal: z.boolean(),
});

export const marketStatusMessageSchema = z.object({
  type: z.literal("market_status"),
  status: marketStatusValueSchema,
  nextOpenAt: z.iso.datetime().nullable(),
  nextCloseAt: z.iso.datetime().nullable(),
});

export const wsErrorMessageSchema = z.object({
  type: z.literal("error"),
  code: z.enum(MARKET_ERROR_CODES),
  symbol: z.string().optional(),
});

export const serverMessageSchema = z.discriminatedUnion("type", [
  authOkMessageSchema,
  accountSummaryMessageSchema,
  quoteMessageSchema,
  barMessageSchema,
  marketStatusMessageSchema,
  wsErrorMessageSchema,
]);

export type ClientAuthMessage = z.infer<typeof clientAuthMessageSchema>;
export type SubscribeQuotesMessage = z.infer<typeof subscribeQuotesMessageSchema>;
export type SubscribeBarsMessage = z.infer<typeof subscribeBarsMessageSchema>;
export type UnsubscribeQuotesMessage = z.infer<typeof unsubscribeQuotesMessageSchema>;
export type UnsubscribeBarsMessage = z.infer<typeof unsubscribeBarsMessageSchema>;
export type ClientSubscribeMessage = z.infer<typeof clientSubscribeMessageSchema>;
export type ClientUnsubscribeMessage = z.infer<typeof clientUnsubscribeMessageSchema>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type AuthOkMessage = z.infer<typeof authOkMessageSchema>;
export type AccountSummaryMessage = z.infer<typeof accountSummaryMessageSchema>;
export type QuoteMessage = z.infer<typeof quoteMessageSchema>;
export type BarMessage = z.infer<typeof barMessageSchema>;
export type MarketStatusMessage = z.infer<typeof marketStatusMessageSchema>;
export type WsErrorMessage = z.infer<typeof wsErrorMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
