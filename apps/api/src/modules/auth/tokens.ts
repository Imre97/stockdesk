import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import type { AppConfig } from "../../lib/config.js";

const REFRESH_TOKEN_BYTES = 32;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface SignAccessTokenOptions {
  secret?: string;
  ttl?: string;
}

export interface VerifyAccessTokenOptions {
  secret?: string;
}

export function signAccessToken(
  config: AppConfig,
  userId: string,
  options: SignAccessTokenOptions = {},
): string {
  const signOptions = {
    algorithm: "HS256",
    subject: userId,
    expiresIn: options.ttl ?? config.jwtAccessTtl,
  } as jwt.SignOptions;

  return jwt.sign({}, options.secret ?? config.jwtAccessSecret, signOptions);
}

export function verifyAccessToken(
  config: AppConfig,
  token: string,
  options: VerifyAccessTokenOptions = {},
): string {
  const payload = jwt.verify(token, options.secret ?? config.jwtAccessSecret, { algorithms: ["HS256"] });

  if (typeof payload === "string" || typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error("Access token has no subject claim.");
  }

  return payload.sub;
}

export function createRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function refreshTokenExpiry(config: AppConfig, from: Date = new Date()): Date {
  return new Date(from.getTime() + config.refreshTokenTtlDays * MILLISECONDS_PER_DAY);
}
