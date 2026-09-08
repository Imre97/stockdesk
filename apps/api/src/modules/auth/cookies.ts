import type { CookieOptions, Request, Response } from "express";
import type { AppConfig } from "../../lib/config.js";

export const REFRESH_COOKIE_NAME = "refreshToken";
export const REFRESH_COOKIE_PATH = "/api/v1/auth";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function cookieAttributes(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: config.isProduction,
    path: REFRESH_COOKIE_PATH,
  };
}

export function setRefreshCookie(config: AppConfig, response: Response, token: string): void {
  response.cookie(REFRESH_COOKIE_NAME, token, {
    ...cookieAttributes(config),
    maxAge: config.refreshTokenTtlDays * MILLISECONDS_PER_DAY,
  });
}

export function clearRefreshCookie(config: AppConfig, response: Response): void {
  response.clearCookie(REFRESH_COOKIE_NAME, cookieAttributes(config));
}

export function readRefreshCookie(request: Request): string | undefined {
  const jar = request.cookies as Record<string, unknown> | undefined;
  const value = jar?.[REFRESH_COOKIE_NAME];

  return typeof value === "string" && value.length > 0 ? value : undefined;
}
