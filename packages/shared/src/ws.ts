import * as z from "zod";

import { accountSummaryDtoSchema } from "./accounts.js";

export const clientAuthMessageSchema = z.object({
  type: z.literal("auth"),
  token: z.string().min(1),
});

export const clientMessageSchema = z.discriminatedUnion("type", [clientAuthMessageSchema]);

export const authOkMessageSchema = z.object({
  type: z.literal("auth_ok"),
  userId: z.string().min(1),
});

export const accountSummaryMessageSchema = z.object({
  type: z.literal("account_summary"),
  accounts: z.array(accountSummaryDtoSchema),
});

export const serverMessageSchema = z.discriminatedUnion("type", [
  authOkMessageSchema,
  accountSummaryMessageSchema,
]);

export type ClientAuthMessage = z.infer<typeof clientAuthMessageSchema>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type AuthOkMessage = z.infer<typeof authOkMessageSchema>;
export type AccountSummaryMessage = z.infer<typeof accountSummaryMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
