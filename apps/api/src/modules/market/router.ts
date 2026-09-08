import {
  barsQuerySchema,
  symbolSchema,
  symbolSearchQuerySchema,
  timeframeSchema,
} from "@stockdesk/shared";
import { Router, type Request } from "express";
import type { AppConfig } from "../../lib/config.js";
import { AppError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/require-auth.js";
import type { MarketRuntime } from "./runtime.js";

function requestedSymbol(request: Request): string {
  const value = request.params.symbol;
  const raw = Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

  return symbolSchema.parse(raw.trim().toUpperCase());
}

function invalidTimeframe(): AppError {
  return new AppError(422, "INVALID_TIMEFRAME", "The requested timeframe is not supported.");
}

export function createMarketRouter(config: AppConfig, runtime: MarketRuntime): Router {
  const router = Router();

  router.use(requireAuth(config));

  router.get("/symbols/search", async (request, response) => {
    const query = symbolSearchQuerySchema.parse(request.query);

    response.status(200).json({ results: await runtime.symbols.search(query.q, query.limit) });
  });

  router.get("/status", (_request, response) => {
    response.status(200).json(runtime.priceService.getMarketStatus());
  });

  router.get("/symbols/:symbol/bars", async (request, response) => {
    const symbol = requestedSymbol(request);
    const timeframe = timeframeSchema.safeParse(request.query.timeframe);

    if (!timeframe.success) throw invalidTimeframe();

    const query = barsQuerySchema.parse(request.query);

    response.status(200).json(
      await runtime.candles.getBars({
        symbol,
        timeframe: timeframe.data,
        limit: query.limit,
        end: query.end === undefined ? undefined : new Date(query.end),
      }),
    );
  });

  router.get("/symbols/:symbol", async (request, response) => {
    const detail = await runtime.symbols.getDetail(requestedSymbol(request));

    response.status(200).json({ symbol: detail });
  });

  return router;
}
