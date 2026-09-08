import {
  createAccountSchema,
  equityRangeSchema,
  renameAccountSchema,
  transactionsQuerySchema,
} from "@stockdesk/shared";
import { Router, type Request } from "express";
import type { AppConfig } from "../../lib/config.js";
import { AppError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { createDepositService, parseDepositBody } from "./deposits.js";
import { createAccountsService } from "./service.js";
import type { AccountsDependencies } from "./snapshot-writer.js";

const DEFAULT_RANGE = "1D";

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

export function createAccountsRouter(
  config: AppConfig,
  dependencies: AccountsDependencies = {},
): Router {
  const router = Router();
  const service = createAccountsService(dependencies);
  const deposit = createDepositService(dependencies);

  router.use(requireAuth(config));

  router.get("/", async (request, response) => {
    response.status(200).json({ accounts: await service.list(callerId(request)) });
  });

  router.post("/", async (request, response) => {
    const input = createAccountSchema.parse(request.body);

    response.status(201).json({ account: await service.create(callerId(request), input.name) });
  });

  router.patch("/:id", async (request, response) => {
    const input = renameAccountSchema.parse(request.body);
    const account = await service.rename(callerId(request), accountId(request), input.name);

    response.status(200).json({ account });
  });

  router.get("/:id/equity", async (request, response) => {
    const range = equityRangeSchema.parse(request.query.range ?? DEFAULT_RANGE);
    const points = await service.equity(callerId(request), accountId(request), range);

    response.status(200).json({ range, points });
  });

  router.get("/:id/positions", async (request, response) => {
    const positions = await service.positions(callerId(request), accountId(request));

    response.status(200).json({ positions });
  });

  router.post("/:id/deposits", async (request, response) => {
    const input = parseDepositBody(request.body);

    response.status(201).json(await deposit(callerId(request), accountId(request), input));
  });

  router.get("/:id/transactions", async (request, response) => {
    const query = transactionsQuerySchema.parse(request.query);

    response.status(200).json(await service.transactions(callerId(request), accountId(request), query));
  });

  return router;
}
