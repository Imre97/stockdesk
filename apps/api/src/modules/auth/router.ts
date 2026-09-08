import { loginSchema, registerSchema } from "@stockdesk/shared";
import { Router, type RequestHandler } from "express";
import { AppError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "./cookies.js";
import * as service from "./service.js";

export function createAuthRouter(rateLimiter?: RequestHandler): Router {
  const router = Router();
  const throttled: RequestHandler[] = rateLimiter === undefined ? [] : [rateLimiter];

  router.post("/register", ...throttled, async (request, response) => {
    const input = registerSchema.parse(request.body);
    const session = await service.register(input);

    setRefreshCookie(response, session.refreshToken);
    response.status(201).json({ user: session.user, accessToken: session.accessToken });
  });

  router.post("/login", ...throttled, async (request, response) => {
    const input = loginSchema.parse(request.body);
    const session = await service.login(input);

    setRefreshCookie(response, session.refreshToken);
    response.status(200).json({ user: session.user, accessToken: session.accessToken });
  });

  router.post("/refresh", async (request, response) => {
    const presented = readRefreshCookie(request);

    if (presented === undefined) throw new AppError(401, "UNAUTHORIZED", "Refresh token is missing.");

    const session = await service.refresh(presented);

    setRefreshCookie(response, session.refreshToken);
    response.status(200).json({ accessToken: session.accessToken });
  });

  router.post("/logout", async (request, response) => {
    await service.logout(readRefreshCookie(request));

    clearRefreshCookie(response);
    response.status(204).end();
  });

  router.get("/me", requireAuth, async (request, response) => {
    const userId = request.user?.id;

    if (userId === undefined) throw new AppError(401, "UNAUTHORIZED", "Authentication required.");

    response.status(200).json({ user: await service.currentUser(userId) });
  });

  return router;
}
