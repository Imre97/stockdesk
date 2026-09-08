import type { CookieOptions, Request, Response } from "express";
import { getConfig } from "../../lib/config.js";

export const REFRESH_COOKIE_NAME = "refreshToken";
export const REFRESH_COOKIE_PATH = "/api/v1/auth";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function cookieAttributes(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: getConfig().isProduction,
    path: REFRESH_COOKIE_PATH,
  };
}

export function setRefreshCookie(response: Response, token: string): void {
  response.cookie(REFRESH_COOKIE_NAME, token, {
    ...cookieAttributes(),
    maxAge: getConfig().refreshTokenTtlDays * MILLISECONDS_PER_DAY,
  });
}

export function clearRefreshCookie(response: Response): void {
  response.clearCookie(REFRESH_COOKIE_NAME, cookieAttributes());
}

export function readRefreshCookie(request: Request): string | undefined {
  const jar = request.cookies as Record<string, unknown> | undefined;
  const value = jar?.[REFRESH_COOKIE_NAME];

  return typeof value === "string" && value.length > 0 ? value : undefined;
}
