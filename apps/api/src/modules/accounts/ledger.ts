import { toApiString, type CashTransactionDto, type CashTransactionType } from "@stockdesk/shared";
import type { CashTransactionRecord, TransactionsCursor } from "./repository.js";

const MONEY_PLACES = 2;

interface EncodedCursor {
  createdAt: string;
  id: string;
}

export function toCashTransactionDto(row: CashTransactionRecord): CashTransactionDto {
  return {
    id: row.id,
    accountId: row.accountId,
    type: row.type as CashTransactionType,
    amount: toApiString(row.amount.toString(), MONEY_PLACES),
    balanceAfter: toApiString(row.balanceAfter.toString(), MONEY_PLACES),
    note: row.note,
    referenceId: row.referenceId,
    createdAt: row.createdAt.toISOString(),
  };
}

export function encodeCursor(row: CashTransactionRecord): string {
  const payload: EncodedCursor = { createdAt: row.createdAt.toISOString(), id: row.id };

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCursor(value: string): TransactionsCursor | undefined {
  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null) return undefined;

  const candidate = parsed as { createdAt?: unknown; id?: unknown };
  if (typeof candidate.createdAt !== "string" || typeof candidate.id !== "string") return undefined;

  const createdAt = new Date(candidate.createdAt);
  if (Number.isNaN(createdAt.getTime())) return undefined;

  return { createdAt, id: candidate.id };
}
