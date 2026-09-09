import { placeOrderSchema } from "@stockdesk/shared";
import { Router, type Request } from "express";
import type { AppConfig } from "../../lib/config.js";
import { AppError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/require-auth.js";
import type { AccountsDependencies } from "../accounts/snapshot-writer.js";
import type { MarketRuntime } from "../market/runtime.js";
import type { OrdersDependencies } from "./context.js";
import type { OrderEngine } from "./engine.js";
import { placeOrder } from "./placement.js";
import { previewOrder } from "./preview.js";

const CREATED = 201;
const OK = 200;

function callerId(request: Request): string {
  const userId = request.user?.id;

  if (userId === undefined) throw new AppError(401, "UNAUTHORIZED", "Authentication required.");

  return userId;
}

function accountId(request: Request): string {
  const value = request.params.id;

  if (Array.isArray(value)) return value[0] ?? "";

  return value ?? "";
}

export function createOrdersRouter(
  config: AppConfig,
  market: MarketRuntime,
  accounts: AccountsDependencies,
  engine: OrderEngine,
): Router {
  const router = Router({ mergeParams: true });
  const dependencies: OrdersDependencies = {
    config,
    prices: market.priceService,
    accounts,
    engine,
  };

  router.use(requireAuth(config));

  router.post("/preview", async (request, response) => {
    const input = placeOrderSchema.parse(request.body);
    const preview = await previewOrder(callerId(request), accountId(request), input, dependencies);

    response.status(OK).json({ preview });
  });

  router.post("/", async (request, response) => {
    const input = placeOrderSchema.parse(request.body);
    const result = await placeOrder(callerId(request), accountId(request), input, dependencies);

    const { created, ...payload } = result;

    response.status(created ? CREATED : OK).json(payload);
  });

  return router;
}
