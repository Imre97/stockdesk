import { Decimal } from "decimal.js";
import * as z from "zod";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN });

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;
const DECIMAL_STRING_ERROR = "Expected a decimal string";

export { Decimal };

export type DecimalValue = Decimal;

export function isDecimalString(value: unknown): value is string {
  return typeof value === "string" && DECIMAL_PATTERN.test(value);
}

export const decimalString = z
  .string({ error: DECIMAL_STRING_ERROR })
  .regex(DECIMAL_PATTERN, DECIMAL_STRING_ERROR)
  .transform((value) => new Decimal(value));

export function toApiString(value: DecimalValue | string, decimalPlaces: number): string {
  // eslint-disable-next-line no-restricted-syntax
  return new Decimal(value).toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_EVEN).toFixed(decimalPlaces);
}
