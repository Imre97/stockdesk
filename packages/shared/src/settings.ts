import * as z from "zod";

import { accountIdSchema } from "./accounts.js";

const UPDATE_EMPTY_ERROR = "At least one setting must be provided";

export const languageSchema = z.enum(["en", "hu"]);

export const themeSchema = z.enum(["light", "dark", "system"]);

export const settingsSchema = z.object({
  language: languageSchema,
  theme: themeSchema,
  defaultAccountId: accountIdSchema.nullable(),
});

export const settingsResponseSchema = z.object({ settings: settingsSchema });

export const updateSettingsSchema = z
  .object({
    language: languageSchema.optional(),
    theme: themeSchema.optional(),
    defaultAccountId: accountIdSchema.optional(),
  })
  .refine(
    (value) =>
      value.language !== undefined || value.theme !== undefined || value.defaultAccountId !== undefined,
    { error: UPDATE_EMPTY_ERROR },
  );

export type Language = z.infer<typeof languageSchema>;
export type Theme = z.infer<typeof themeSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type SettingsResponse = z.infer<typeof settingsResponseSchema>;
export type UpdateSettingsRequest = z.input<typeof updateSettingsSchema>;
export type UpdateSettingsInput = z.output<typeof updateSettingsSchema>;
