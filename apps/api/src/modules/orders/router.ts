import { cancelOrderSchema, modifyOrderSchema, ordersQuerySchema, placeOrderSchema } from "@stockdesk/shared";
import { Router, type Request } from "express";
import type { AppConfig } from "../../lib/config.js";
import { AppError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/require-auth.js";
import type { AccountsDependencies } from "../accounts/snapshot-writer.js";
import type { MarketRuntime } from "../market/runtime.js";
import { cancelOrder } from "./cancel.js";
import type { OrdersDependencies } from "./context.js";
import { getOrderDetail } from "./detail.js";
import type { OrderEngine } from "./engine.js";
import { listOrders } from "./listing.js";
import { modifyOrder } from "./modify.js";
import { placeOrder } from "./placement.js";
import { previewOrder } from "./preview.js";

const CREATED = 201;
const OK = 200;

function callerId(request: Request): string {
  const userId = request.user?.id;

  if (userId === undefined) throw new AppError(401, "UNAUTHORIZED", "Authentication required.");

  return userId;
}

function param(request: Request, name: string): string {
  const value = request.params[name];

  if (Array.isArray(value)) return value[0] ?? "";

  return value ?? "";
}

function accountId(request: Request): string {
  return param(request, "id");
}

function orderId(request: Request): string {
  return param(request, "orderId");
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

  router.get("/", async (request, response) => {
    const query = ordersQuerySchema.parse(request.query);
    const page = await listOrders(callerId(request), query, accountId(request));

    response.status(OK).json(page);
  });

  router.get("/:orderId", async (request, response) => {
    const detail = await getOrderDetail(callerId(request), accountId(request), orderId(request));

    response.status(OK).json(detail);
  });

  router.patch("/:orderId", async (request, response) => {
    const input = modifyOrderSchema.parse(request.body);
    const result = await modifyOrder(
      callerId(request),
      accountId(request),
      orderId(request),
      input,
      dependencies,
    );

    response.status(OK).json(result);
  });

  router.delete("/:orderId", async (request, response) => {
    const input = cancelOrderSchema.parse(request.body);
    const result = await cancelOrder(
      callerId(request),
      accountId(request),
      orderId(request),
      input.version,
      dependencies,
    );

    response.status(OK).json(result);
  });

  return router;
}

export function createUserOrdersRouter(config: AppConfig): Router {
  const router = Router();

  router.use(requireAuth(config));

  router.get("/", async (request, response) => {
    const query = ordersQuerySchema.parse(request.query);

    response.status(OK).json(await listOrders(callerId(request), query));
  });

  return router;
}
