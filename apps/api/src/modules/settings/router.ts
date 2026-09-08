import { updateSettingsSchema } from "@stockdesk/shared";
import { Router, type Request } from "express";
import type { AppConfig } from "../../lib/config.js";
import { AppError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { createSettingsService } from "./service.js";

function callerId(request: Request): string {
  const userId = request.user?.id;

  if (userId === undefined) throw new AppError(401, "UNAUTHORIZED", "Authentication required.");

  return userId;
}

export function createSettingsRouter(config: AppConfig): Router {
  const router = Router();
  const service = createSettingsService();

  router.use(requireAuth(config));

  router.get("/", async (request, response) => {
    response.status(200).json({ settings: await service.read(callerId(request)) });
  });

  router.patch("/", async (request, response) => {
    const patch = updateSettingsSchema.parse(request.body);

    response.status(200).json({ settings: await service.update(callerId(request), patch) });
  });

  return router;
}
