import { randomBytes } from "node:crypto";
import type { Express } from "express";
import request from "supertest";
import { expect } from "vitest";

export const MONETARY_KEY_PATTERN = /cash|balance|amount|price|quantity|equity/i;

export function uniqueEmail(prefix = "trader"): string {
  return `${prefix}-${randomBytes(6).toString("hex")}@example.com`;
}

export const REFRESH_COOKIE_NAME = "refreshToken";

export function setCookies(response: request.Response): string[] {
  const header = response.headers["set-cookie"] as string[] | string | undefined;
  if (header === undefined) return [];
  return Array.isArray(header) ? header : [header];
}

export function findRefreshCookieHeader(response: request.Response): string {
  const header = setCookies(response).find((value) => value.startsWith(`${REFRESH_COOKIE_NAME}=`));
  if (header === undefined) {
    throw new Error("Response does not set a refreshToken cookie.");
  }
  return header;
}

export function extractRefreshCookie(response: request.Response): string {
  const header = findRefreshCookieHeader(response);
  const [pair] = header.split(";");
  return pair ?? header;
}

export function firstOf<T>(items: T[], label: string): T {
  const [item] = items;
  if (item === undefined) throw new Error(`Expected at least one ${label}.`);
  return item;
}

export interface RegisterOverrides {
  email?: string;
  password?: string;
  displayName?: string;
}

export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface RegisteredUser {
  response: request.Response;
  accessToken: string;
  cookie: string;
  user: UserDto;
  password: string;
}

export const DEFAULT_PASSWORD = "trader-pass-1";

export async function registerUser(app: Express, overrides: RegisterOverrides = {}): Promise<RegisteredUser> {
  const payload = {
    email: overrides.email ?? uniqueEmail(),
    password: overrides.password ?? DEFAULT_PASSWORD,
    displayName: overrides.displayName ?? "Trader",
  };

  const response = await request(app).post("/api/v1/auth/register").send(payload);
  expect(response.status).toBe(201);

  const body = response.body as { user: UserDto; accessToken: string };

  return {
    response,
    accessToken: body.accessToken,
    cookie: extractRefreshCookie(response),
    user: body.user,
    password: payload.password,
  };
}

export function expectNoMonetaryNumbers(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      expectNoMonetaryNumbers(item, `${path}[${index}]`);
    });
    return;
  }

  if (value === null || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;
    if (MONETARY_KEY_PATTERN.test(key) && typeof child === "number") {
      throw new Error(`${childPath} is a JSON number; monetary values must travel as decimal strings.`);
    }
    expectNoMonetaryNumbers(child, childPath);
  }
}
