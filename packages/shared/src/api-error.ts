import * as z from "zod";

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ApiErrorEnvelope = z.infer<typeof apiErrorSchema>;

export function isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  return apiErrorSchema.safeParse(value).success;
}
