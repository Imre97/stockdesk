import { Decimal, type DecimalValue, toApiString } from "./decimal.js";
import {
  type NumberLayout,
  readLayout,
  renderNumber,
  splitDigits,
  trimTrailingZeros,
} from "./format-parts.js";

const MONEY_DECIMAL_PLACES = 2;
const PERCENT_DECIMAL_PLACES = 2;
const QUANTITY_DECIMAL_PLACES = 6;
const DEFAULT_CURRENCY = "USD";
const PLUS_SIGN = "+";

const PLAIN_PROBE = 1234567.89;
const PLAIN_GROUPING_PROBE = 1234.56;
const PERCENT_PROBE = 12345.6789;
const PERCENT_GROUPING_PROBE = 12.3456;

const layouts = new Map<string, NumberLayout>();

function cached(key: string, build: () => NumberLayout): NumberLayout {
  const existing = layouts.get(key);

  if (existing !== undefined) return existing;

  const built = build();
  layouts.set(key, built);

  return built;
}

function signedProbe(probe: number, negative: boolean): number {
  return negative ? -probe : probe;
}

function currencyLayout(locale: string, currency: string, negative: boolean): NumberLayout {
  return cached(`currency:${locale}:${currency}:${String(negative)}`, () =>
    readLayout(
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: MONEY_DECIMAL_PLACES,
        maximumFractionDigits: MONEY_DECIMAL_PLACES,
      }),
      signedProbe(PLAIN_PROBE, negative),
      PLAIN_GROUPING_PROBE,
    ),
  );
}

function percentLayout(locale: string, negative: boolean): NumberLayout {
  return cached(`percent:${locale}:${String(negative)}`, () =>
    readLayout(
      new Intl.NumberFormat(locale, {
        style: "percent",
        minimumFractionDigits: PERCENT_DECIMAL_PLACES,
        maximumFractionDigits: PERCENT_DECIMAL_PLACES,
      }),
      signedProbe(PERCENT_PROBE, negative),
      PERCENT_GROUPING_PROBE,
    ),
  );
}

function decimalLayout(locale: string, negative: boolean): NumberLayout {
  return cached(`decimal:${locale}:${String(negative)}`, () =>
    readLayout(
      new Intl.NumberFormat(locale, {
        style: "decimal",
        minimumFractionDigits: MONEY_DECIMAL_PLACES,
        maximumFractionDigits: MONEY_DECIMAL_PLACES,
      }),
      signedProbe(PLAIN_PROBE, negative),
      PLAIN_GROUPING_PROBE,
    ),
  );
}

function round(value: DecimalValue, decimalPlaces: number): DecimalValue {
  return new Decimal(toApiString(value, decimalPlaces));
}

function isNegative(value: DecimalValue): boolean {
  return value.isNegative() && !value.isZero();
}

export function formatMoney(value: DecimalValue, locale: string, currency = DEFAULT_CURRENCY): string {
  const rounded = round(value, MONEY_DECIMAL_PLACES);
  const digits = splitDigits(toApiString(rounded.abs(), MONEY_DECIMAL_PLACES));

  return renderNumber(currencyLayout(locale, currency, isNegative(rounded)), digits);
}

export function formatSignedMoney(value: DecimalValue, locale: string, currency = DEFAULT_CURRENCY): string {
  const rounded = round(value, MONEY_DECIMAL_PLACES);

  if (rounded.isZero()) return formatMoney(rounded, locale, currency);

  const digits = splitDigits(toApiString(rounded.abs(), MONEY_DECIMAL_PLACES));
  const signText = rounded.isNegative() ? undefined : PLUS_SIGN;

  return renderNumber(currencyLayout(locale, currency, true), digits, signText);
}

export function formatPercent(value: DecimalValue, locale: string): string {
  const rounded = round(value, PERCENT_DECIMAL_PLACES);
  const digits = splitDigits(toApiString(rounded.abs(), PERCENT_DECIMAL_PLACES));

  return renderNumber(percentLayout(locale, isNegative(rounded)), digits);
}

export function formatQuantity(value: DecimalValue, locale: string): string {
  const rounded = round(value, QUANTITY_DECIMAL_PLACES);
  const digits = splitDigits(toApiString(rounded.abs(), QUANTITY_DECIMAL_PLACES));

  return renderNumber(decimalLayout(locale, isNegative(rounded)), {
    integer: digits.integer,
    fraction: trimTrailingZeros(digits.fraction),
  });
}
