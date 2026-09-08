import * as z from "zod";

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ApiErrorEnvelope = z.infer<typeof apiErrorSchema>;

export const API_ERROR_CODES = ["NOT_FOUND", "INTERNAL_ERROR"] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export function isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  return apiErrorSchema.safeParse(value).success;
}
