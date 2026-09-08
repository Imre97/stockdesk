import * as z from "zod";

const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72;
const DISPLAY_NAME_MAX_LENGTH = 50;

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(EMAIL_MAX_LENGTH));

export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

export const displayNameSchema = z.string().trim().min(1).max(DISPLAY_NAME_MAX_LENGTH);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const userSchema = z.object({
  id: z.string().min(1),
  email: z.email(),
  displayName: z.string(),
  createdAt: z.iso.datetime(),
});

export const authResponseSchema = z.object({
  user: userSchema,
  accessToken: z.string().min(1),
});

export const refreshResponseSchema = z.object({
  accessToken: z.string().min(1),
});

export const meResponseSchema = z.object({
  user: userSchema,
});

export const AUTH_ERROR_CODES = [
  "VALIDATION_ERROR",
  "EMAIL_TAKEN",
  "INVALID_CREDENTIALS",
  "UNAUTHORIZED",
  "REFRESH_REUSED",
  "RATE_LIMITED",
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export type RegisterRequest = z.input<typeof registerSchema>;
export type RegisterInput = z.output<typeof registerSchema>;
export type LoginRequest = z.input<typeof loginSchema>;
export type LoginInput = z.output<typeof loginSchema>;
export type User = z.infer<typeof userSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
