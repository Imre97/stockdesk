import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { getConfig } from "../../lib/config.js";

const REFRESH_TOKEN_BYTES = 32;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface SignAccessTokenOptions {
  secret?: string;
  ttl?: string;
}

export interface VerifyAccessTokenOptions {
  secret?: string;
}

export function signAccessToken(userId: string, options: SignAccessTokenOptions = {}): string {
  const config = getConfig();
  const signOptions = {
    algorithm: "HS256",
    subject: userId,
    expiresIn: options.ttl ?? config.jwtAccessTtl,
  } as jwt.SignOptions;

  return jwt.sign({}, options.secret ?? config.jwtAccessSecret, signOptions);
}

export function verifyAccessToken(token: string, options: VerifyAccessTokenOptions = {}): string {
  const config = getConfig();
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

export function refreshTokenExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + getConfig().refreshTokenTtlDays * MILLISECONDS_PER_DAY);
}
