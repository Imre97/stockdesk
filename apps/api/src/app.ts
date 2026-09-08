import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { getConfig, type AppConfig } from "./lib/config.js";
import { AppError } from "./lib/errors.js";
import { errorHandler } from "./middleware/error-handler.js";
import { createAccountsRouter } from "./modules/accounts/router.js";
import type { AccountsDependencies } from "./modules/accounts/snapshot-writer.js";
import { createAuthRouter } from "./modules/auth/router.js";
import { createHealthRouter, type DatabaseCheck } from "./modules/health/router.js";
import { createMarketRouter } from "./modules/market/router.js";
import { createMarketRuntime, type MarketRuntime } from "./modules/market/runtime.js";
import { createSettingsRouter } from "./modules/settings/router.js";
import { mountStaticWeb } from "./static-web.js";

const MILLISECONDS_PER_MINUTE = 60 * 1000;
const JSON_BODY_LIMIT = "16kb";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface RateLimitOptions {
  enabled: boolean;
  max?: number;
  windowMs?: number;
}

export interface CreateAppOptions {
  rateLimit?: RateLimitOptions;
  config?: AppConfig;
  checkDatabase?: DatabaseCheck;
  deps?: AccountsDependencies;
  market?: MarketRuntime;
}

function reportToStderr(message: string): void {
  process.stderr.write(`${message}
`);
}

function buildAuthRateLimiter(
  options: RateLimitOptions | undefined,
  config: AppConfig,
): RequestHandler | undefined {
  if (options !== undefined && !options.enabled) return undefined;

  return rateLimit({
    windowMs: options?.windowMs ?? config.authRateLimitWindowMinutes * MILLISECONDS_PER_MINUTE,
    limit: options?.max ?? config.authRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_request, response) => {
      response
        .status(429)
        .json({ error: { code: "RATE_LIMITED", message: "Too many requests. Try again later." } });
    },
  });
}

export function createApp(options: CreateAppOptions = {}): express.Express {
  const config = options.config ?? getConfig();
  const market = options.market ?? createMarketRuntime({ config, log: reportToStderr });
  const dependencies: AccountsDependencies = {
    ...(options.deps ?? {}),
    prices: options.deps?.prices ?? market.priceService,
  };
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxyHops);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(cookieParser());

  const authRateLimiter = buildAuthRateLimiter(options.rateLimit, config);
  const apiRouter = express.Router();

  apiRouter.use("/health", createHealthRouter(options.checkDatabase));
  apiRouter.use("/auth", createAuthRouter(config, authRateLimiter, dependencies));
  apiRouter.use("/accounts", createAccountsRouter(config, dependencies));
  apiRouter.use("/market", createMarketRouter(config, market));
  apiRouter.use("/settings", createSettingsRouter(config));
  app.use("/api/v1", apiRouter);
  app.use("/api/v1", (_request, _response, next) => {
    next(new AppError(404, "NOT_FOUND", "Route not found."));
  });

  if (config.isProduction) {
    mountStaticWeb(app, path.resolve(apiRoot, config.webDistDir));
  }

  app.use(errorHandler);

  return app;
}
