import { Decimal, decimalStringValue } from "@stockdesk/shared";
import { z } from "zod";

export const MARKET_DATA_PROVIDER_NAMES = ["alpaca", "finnhub", "simulated"] as const;

export type MarketDataProviderName = (typeof MARKET_DATA_PROVIDER_NAMES)[number];

const DEFAULT_MARKET_DATA_PROVIDERS = MARKET_DATA_PROVIDER_NAMES.join(",");

const providerListSchema = z
  .string()
  .default(DEFAULT_MARKET_DATA_PROVIDERS)
  .transform((value) =>
    value
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name !== ""),
  )
  .pipe(z.array(z.enum(MARKET_DATA_PROVIDER_NAMES)).min(1));

const NEGATIVE_RATE_ERROR = "Expected a decimal at or above zero";

function nonNegativeDecimalSchema(defaultValue: string): z.ZodType<Decimal, string | undefined> {
  return decimalStringValue
    .default(defaultValue)
    .transform((value) => new Decimal(value))
    .refine((value) => value.greaterThanOrEqualTo(0), { error: NEGATIVE_RATE_ERROR });
}

const optionalCredentialSchema = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value === "" ? undefined : value));

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
  DATABASE_URL_TEST: z.string().min(1).optional(),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_ACCESS_TTL: z.string().min(1).default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  REFRESH_TOKEN_PRUNE_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  WEB_DIST_DIR: z.string().min(1).default("../web/dist"),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  AUTH_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().optional(),
  SNAPSHOT_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
  SNAPSHOT_FINE_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
  SNAPSHOT_COARSE_RETENTION_DAYS: z.coerce.number().int().positive().default(400),
  SNAPSHOT_THINNING_INTERVAL_HOURS: z.coerce.number().int().positive().default(24),
  MARKET_DATA_PROVIDERS: providerListSchema,
  ALPACA_API_KEY: optionalCredentialSchema,
  ALPACA_API_SECRET: optionalCredentialSchema,
  ALPACA_DATA_FEED: z.enum(["iex", "sip"]).default("iex"),
  FINNHUB_API_KEY: optionalCredentialSchema,
  SYMBOL_REFRESH_HOURS: z.coerce.number().int().positive().default(24),
  QUOTE_THROTTLE_PER_SECOND: z.coerce.number().int().positive().default(4),
  CANDLE_THINNING_INTERVAL_HOURS: z.coerce.number().int().positive().default(24),
  COMMISSION_PER_ORDER: nonNegativeDecimalSchema("0.00"),
  MARKET_ORDER_BUFFER: nonNegativeDecimalSchema("0.02"),
  SHORT_MARGIN_RATE: nonNegativeDecimalSchema("0.5"),
  MAINTENANCE_MARGIN_RATE: nonNegativeDecimalSchema("0.3"),
  ORDER_EXPIRY_CHECK_SECONDS: z.coerce.number().int().positive().default(60),
});

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  directUrl: string | undefined;
  databaseUrlTest: string | undefined;
  jwtAccessSecret: string;
  jwtAccessTtl: string;
  refreshTokenTtlDays: number;
  refreshTokenPruneIntervalMinutes: number;
  corsOrigin: string;
  webDistDir: string;
  authRateLimitMax: number;
  authRateLimitWindowMinutes: number;
  trustProxyHops: number;
  snapshotIntervalSeconds: number;
  snapshotFineRetentionDays: number;
  snapshotCoarseRetentionDays: number;
  snapshotThinningIntervalHours: number;
  marketDataProviders: MarketDataProviderName[];
  alpacaApiKey: string | undefined;
  alpacaApiSecret: string | undefined;
  alpacaDataFeed: "iex" | "sip";
  finnhubApiKey: string | undefined;
  symbolRefreshHours: number;
  quoteThrottlePerSecond: number;
  candleThinningIntervalHours: number;
  commissionPerOrder: Decimal;
  marketOrderBuffer: Decimal;
  shortMarginRate: Decimal;
  maintenanceMarginRate: Decimal;
  orderExpiryCheckSeconds: number;
  isProduction: boolean;
}

function formatIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = environmentSchema.safeParse(env);

  if (!parsed.success) {
    throw new Error(`Invalid environment configuration. ${formatIssues(parsed.error)}`);
  }

  const values = parsed.data;
  const isProduction = values.NODE_ENV === "production";

  return {
    nodeEnv: values.NODE_ENV,
    port: values.PORT,
    databaseUrl: values.DATABASE_URL,
    directUrl: values.DIRECT_URL,
    databaseUrlTest: values.DATABASE_URL_TEST,
    jwtAccessSecret: values.JWT_ACCESS_SECRET,
    jwtAccessTtl: values.JWT_ACCESS_TTL,
    refreshTokenTtlDays: values.REFRESH_TOKEN_TTL_DAYS,
    refreshTokenPruneIntervalMinutes: values.REFRESH_TOKEN_PRUNE_INTERVAL_MINUTES,
    corsOrigin: values.CORS_ORIGIN,
    webDistDir: values.WEB_DIST_DIR,
    authRateLimitMax: values.AUTH_RATE_LIMIT_MAX,
    authRateLimitWindowMinutes: values.AUTH_RATE_LIMIT_WINDOW_MINUTES,
    trustProxyHops: values.TRUST_PROXY_HOPS ?? (isProduction ? 1 : 0),
    snapshotIntervalSeconds: values.SNAPSHOT_INTERVAL_SECONDS,
    snapshotFineRetentionDays: values.SNAPSHOT_FINE_RETENTION_DAYS,
    snapshotCoarseRetentionDays: values.SNAPSHOT_COARSE_RETENTION_DAYS,
    snapshotThinningIntervalHours: values.SNAPSHOT_THINNING_INTERVAL_HOURS,
    marketDataProviders: values.MARKET_DATA_PROVIDERS,
    alpacaApiKey: values.ALPACA_API_KEY,
    alpacaApiSecret: values.ALPACA_API_SECRET,
    alpacaDataFeed: values.ALPACA_DATA_FEED,
    finnhubApiKey: values.FINNHUB_API_KEY,
    symbolRefreshHours: values.SYMBOL_REFRESH_HOURS,
    quoteThrottlePerSecond: values.QUOTE_THROTTLE_PER_SECOND,
    candleThinningIntervalHours: values.CANDLE_THINNING_INTERVAL_HOURS,
    commissionPerOrder: values.COMMISSION_PER_ORDER,
    marketOrderBuffer: values.MARKET_ORDER_BUFFER,
    shortMarginRate: values.SHORT_MARGIN_RATE,
    maintenanceMarginRate: values.MAINTENANCE_MARGIN_RATE,
    orderExpiryCheckSeconds: values.ORDER_EXPIRY_CHECK_SECONDS,
    isProduction,
  };
}

let cached: AppConfig | undefined;

export function getConfig(): AppConfig {
  cached ??= loadConfig(process.env);
  return cached;
}
