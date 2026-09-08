import {
  authResponseSchema,
  meResponseSchema,
  refreshResponseSchema,
  type AuthResponse,
  type LoginRequest,
  type MeResponse,
  type RefreshResponse,
  type RegisterRequest,
} from "@stockdesk/shared";

import { http } from "../../lib/http";

const BASE_PATH = "/api/v1/auth";

export function register(input: RegisterRequest): Promise<AuthResponse> {
  return http<AuthResponse>(`${BASE_PATH}/register`, {
    method: "POST",
    json: input,
    skipAuthRetry: true,
    parse: (json) => authResponseSchema.parse(json),
  });
}

export function login(input: LoginRequest): Promise<AuthResponse> {
  return http<AuthResponse>(`${BASE_PATH}/login`, {
    method: "POST",
    json: input,
    skipAuthRetry: true,
    parse: (json) => authResponseSchema.parse(json),
  });
}

export function refresh(): Promise<RefreshResponse> {
  return http<RefreshResponse>(`${BASE_PATH}/refresh`, {
    method: "POST",
    skipAuthRetry: true,
    parse: (json) => refreshResponseSchema.parse(json),
  });
}

export function logout(): Promise<void> {
  return http<void>(`${BASE_PATH}/logout`, { method: "POST", skipAuthRetry: true });
}

export function me(accessToken: string): Promise<MeResponse> {
  return http<MeResponse>(`${BASE_PATH}/me`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    skipAuthRetry: true,
    parse: (json) => meResponseSchema.parse(json),
  });
}
