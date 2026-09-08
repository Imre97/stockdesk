import * as z from "zod";

import { accountIdSchema, accountSummarySchema } from "./accounts.js";
import { Decimal, decimalString } from "./decimal.js";

export const DEPOSIT_LIMIT = new Decimal("1000000.00");
export const DEPOSIT_NOTE_MAX = 200;
export const TRANSACTIONS_PAGE_DEFAULT = 50;
export const TRANSACTIONS_PAGE_MAX = 100;

const AMOUNT_DECIMAL_PLACES = 2;
const AMOUNT_POSITIVE_ERROR = "Amount must be positive";
const AMOUNT_PLACES_ERROR = "Amount has more than 2 decimal places";
const AMOUNT_LIMIT_ERROR = "Amount exceeds the deposit limit";

export const cashTransactionTypeSchema = z.enum([
  "DEPOSIT",
  "WITHDRAWAL",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "TRADE",
]);

export const depositAmountSchema = decimalString
  .refine((value) => value.greaterThan(0), { error: AMOUNT_POSITIVE_ERROR })
  .refine((value) => value.decimalPlaces() <= AMOUNT_DECIMAL_PLACES, { error: AMOUNT_PLACES_ERROR })
  .refine((value) => value.lessThanOrEqualTo(DEPOSIT_LIMIT), { error: AMOUNT_LIMIT_ERROR });

export const depositNoteSchema = z
  .string()
  .trim()
  .max(DEPOSIT_NOTE_MAX)
  .transform((value) => (value === "" ? undefined : value));

export const depositSchema = z.object({
  amount: depositAmountSchema,
  note: depositNoteSchema.optional(),
});

export const cashTransactionSchema = z.object({
  id: z.string().min(1),
  accountId: accountIdSchema,
  type: cashTransactionTypeSchema,
  amount: decimalString,
  balanceAfter: decimalString,
  note: z.string().nullable(),
  referenceId: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const depositResponseSchema = z.object({
  account: accountSummarySchema,
  transaction: cashTransactionSchema,
});

export const transactionsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(TRANSACTIONS_PAGE_MAX)
    .default(TRANSACTIONS_PAGE_DEFAULT),
  cursor: z.string().min(1).optional(),
});

export const transactionsPageSchema = z.object({
  transactions: z.array(cashTransactionSchema),
  nextCursor: z.string().nullable(),
});

export type CashTransactionType = z.infer<typeof cashTransactionTypeSchema>;
export type DepositRequest = z.input<typeof depositSchema>;
export type DepositInput = z.output<typeof depositSchema>;
export type CashTransactionDto = z.input<typeof cashTransactionSchema>;
export type CashTransaction = z.output<typeof cashTransactionSchema>;
export type DepositResponseDto = z.input<typeof depositResponseSchema>;
export type DepositResponse = z.output<typeof depositResponseSchema>;
export type TransactionsQueryRequest = z.input<typeof transactionsQuerySchema>;
export type TransactionsQuery = z.output<typeof transactionsQuerySchema>;
export type TransactionsPageDto = z.input<typeof transactionsPageSchema>;
export type TransactionsPage = z.output<typeof transactionsPageSchema>;
