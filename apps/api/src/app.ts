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
import { createAuthRouter } from "./modules/auth/router.js";
import { createHealthRouter, type DatabaseCheck } from "./modules/health/router.js";
import { mountStaticWeb } from "./static-web.js";

const MILLISECONDS_PER_MINUTE = 60 * 1000;
const TRUSTED_PROXY_HOPS = 1;

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
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", TRUSTED_PROXY_HOPS);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  const apiRouter = express.Router();
  apiRouter.use("/health", createHealthRouter(options.checkDatabase));
  apiRouter.use("/auth", createAuthRouter(config, buildAuthRateLimiter(options.rateLimit, config)));
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
