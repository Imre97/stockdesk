import { Decimal } from "@stockdesk/shared";

import { parseJsonWithDecimals } from "../decimal-json.js";
import type { SymbolProfile } from "../types.js";
import type { FinnhubClient } from "./client.js";

const PROFILE_DECIMAL_KEYS: ReadonlySet<string> = new Set(["marketCapitalization", "shareOutstanding"]);

const METRIC_DECIMAL_KEYS: ReadonlySet<string> = new Set([
  "peTTM",
  "peBasicExclExtraTTM",
  "52WeekHigh",
  "52WeekLow",
  "beta",
  "dividendYieldIndicatedAnnual",
]);

const MILLION = new Decimal("1000000");

interface RawProfile {
  name?: unknown;
  exchange?: unknown;
  finnhubIndustry?: unknown;
  marketCapitalization?: unknown;
  shareOutstanding?: unknown;
  logo?: unknown;
  weburl?: unknown;
  ipo?: unknown;
}

interface RawMetricPayload {
  metric?: Record<string, unknown> | null;
}

function decimalOrNull(value: unknown): Decimal | null {
  return value instanceof Decimal ? value : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function millionsToUnits(value: unknown): Decimal | null {
  const amount = decimalOrNull(value);

  return amount === null ? null : amount.times(MILLION);
}

function dateOrNull(value: unknown): Date | null {
  const text = textOrNull(value);

  if (text === null) return null;

  const date = new Date(text);

  return Number.isNaN(date.getTime()) ? null : date;
}

async function fetchMetrics(client: FinnhubClient, symbol: string): Promise<Record<string, unknown>> {
  const text = await client.get("/stock/metric", { symbol, metric: "all" });
  const payload = parseJsonWithDecimals(text, METRIC_DECIMAL_KEYS) as RawMetricPayload;

  return payload.metric ?? {};
}

export async function fetchFinnhubProfile(
  client: FinnhubClient,
  symbol: string,
): Promise<SymbolProfile | null> {
  const profileText = await client.get("/stock/profile2", { symbol });
  const raw = parseJsonWithDecimals(profileText, PROFILE_DECIMAL_KEYS) as RawProfile;

  if (Object.keys(raw).length === 0) return null;

  const metric = await fetchMetrics(client, symbol);

  return {
    symbol,
    name: textOrNull(raw.name),
    exchange: textOrNull(raw.exchange),
    industry: textOrNull(raw.finnhubIndustry),
    marketCap: millionsToUnits(raw.marketCapitalization),
    sharesOutstanding: millionsToUnits(raw.shareOutstanding),
    peRatio: decimalOrNull(metric.peTTM) ?? decimalOrNull(metric.peBasicExclExtraTTM),
    week52High: decimalOrNull(metric["52WeekHigh"]),
    week52Low: decimalOrNull(metric["52WeekLow"]),
    beta: decimalOrNull(metric.beta),
    dividendYield: decimalOrNull(metric.dividendYieldIndicatedAnnual),
    logoUrl: textOrNull(raw.logo),
    websiteUrl: textOrNull(raw.weburl),
    ipoDate: dateOrNull(raw.ipo),
  };
}
