import {
  Decimal,
  formatMoney,
  formatSignedMoney,
  type CashTransaction,
  type CashTransactionType,
  type DecimalValue,
} from "@stockdesk/shared";

import { pnlTone, type PnlTone } from "../accounts/mappers";

export interface TransactionViewModel {
  id: string;
  date: string;
  type: CashTransactionType;
  amount: string;
  balanceAfter: string;
  note: string | null;
  tone: PnlTone;
}

const SEPARATOR_PROBE = 12345.6;
const WHITESPACE_PATTERN = /[\s\u00a0\u202f\u2009]/g;
const PLAIN_DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;
const DIGITS_PATTERN = /^\d+$/;
const GROUP_SIZE = 3;

interface Separators {
  group: string;
  decimal: string;
}

const separators = new Map<string, Separators>();

function readSeparators(locale: string): Separators {
  const cached = separators.get(locale);

  if (cached !== undefined) return cached;

  const parts = new Intl.NumberFormat(locale).formatToParts(SEPARATOR_PROBE);
  const read = {
    group: parts.find((part) => part.type === "group")?.value ?? "",
    decimal: parts.find((part) => part.type === "decimal")?.value ?? ".",
  };

  separators.set(locale, read);

  return read;
}

function ungroup(integer: string, group: string): string | null {
  if (group === "" || !integer.includes(group)) {
    return DIGITS_PATTERN.test(integer) ? integer : null;
  }

  const parts = integer.split(group);
  const head = parts[0] ?? "";
  const rest = parts.slice(1);

  if (head.length < 1 || head.length > GROUP_SIZE || !DIGITS_PATTERN.test(head)) return null;
  if (rest.some((part) => part.length !== GROUP_SIZE || !DIGITS_PATTERN.test(part))) return null;

  return parts.join("");
}

/**
 * Accepts only what the active locale itself renders: optionally grouped digits with
 * the locale group separator (a plain space stands in for the no-break space) and the
 * locale decimal mark. Anything else, including another locale's layout, is rejected
 * instead of coerced.
 */
export function parseAmountInput(input: string, locale: string): DecimalValue | null {
  const separators = readSeparators(locale);
  const group = separators.group.replace(WHITESPACE_PATTERN, "");
  const decimal = separators.decimal;
  const compact = input.replace(WHITESPACE_PATTERN, "");

  if (compact === "") return null;

  const sign = compact.startsWith("-") ? "-" : "";
  const body = sign === "" ? compact : compact.slice(1);
  const decimalIndex = body.indexOf(decimal);

  if (decimalIndex !== body.lastIndexOf(decimal)) return null;

  const fraction = decimalIndex === -1 ? "" : body.slice(decimalIndex + 1);
  const integer = ungroup(decimalIndex === -1 ? body : body.slice(0, decimalIndex), group);

  if (integer === null) return null;
  if (decimalIndex !== -1 && !DIGITS_PATTERN.test(fraction)) return null;

  const normalized = decimalIndex === -1 ? `${sign}${integer}` : `${sign}${integer}.${fraction}`;

  if (!PLAIN_DECIMAL_PATTERN.test(normalized)) return null;

  return new Decimal(normalized);
}

export function toTransactionViewModel(transaction: CashTransaction, locale: string): TransactionViewModel {
  return {
    id: transaction.id,
    date: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(transaction.createdAt),
    ),
    type: transaction.type,
    amount: formatSignedMoney(transaction.amount, locale),
    balanceAfter: formatMoney(transaction.balanceAfter, locale),
    note: transaction.note,
    tone: pnlTone(transaction.amount),
  };
}
