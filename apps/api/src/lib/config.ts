import { z } from "zod";

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
  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),
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
    trustProxyHops: values.TRUST_PROXY_HOPS,
    isProduction: values.NODE_ENV === "production",
  };
}

let cached: AppConfig | undefined;

export function getConfig(): AppConfig {
  cached ??= loadConfig(process.env);
  return cached;
}
