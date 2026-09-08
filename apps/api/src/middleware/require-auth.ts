import type { RequestHandler } from "express";
import type { AppConfig } from "../lib/config.js";
import { AppError } from "../lib/errors.js";
import { verifyAccessToken } from "../modules/auth/tokens.js";

const BEARER_PREFIX = "Bearer ";

function unauthorized(): AppError {
  return new AppError(401, "UNAUTHORIZED", "Authentication required.");
}

export function requireAuth(config: AppConfig): RequestHandler {
  return (request, _response, next) => {
    const header = request.headers.authorization;

    if (header === undefined || !header.startsWith(BEARER_PREFIX)) {
      next(unauthorized());
      return;
    }

    try {
      request.user = { id: verifyAccessToken(config, header.slice(BEARER_PREFIX.length)) };
      next();
    } catch {
      next(unauthorized());
    }
  };
}
