import { languageSchema, themeSchema, type Settings, type UpdateSettingsInput } from "@stockdesk/shared";
import { AppError } from "../../lib/errors.js";
import * as repository from "./repository.js";

const DEFAULT_LANGUAGE = "en";
const DEFAULT_THEME = "system";

export interface SettingsService {
  read: (userId: string) => Promise<Settings>;
  update: (userId: string, patch: UpdateSettingsInput) => Promise<Settings>;
}

function accountNotFound(): AppError {
  return new AppError(404, "ACCOUNT_NOT_FOUND", "Account not found.");
}

async function resolveDefaultAccount(userId: string, referenced: string | null): Promise<string | null> {
  if (referenced !== null && (await repository.accountExists(userId, referenced))) return referenced;

  return await repository.oldestAccountId(userId);
}

async function toSettings(
  userId: string,
  stored: repository.SettingsRecord | null,
): Promise<Settings> {
  return {
    language: languageSchema.safeParse(stored?.language).data ?? DEFAULT_LANGUAGE,
    theme: themeSchema.safeParse(stored?.theme).data ?? DEFAULT_THEME,
    defaultAccountId: await resolveDefaultAccount(userId, stored?.defaultAccountId ?? null),
  };
}

export function createSettingsService(): SettingsService {
  return {
    async read(userId: string): Promise<Settings> {
      return await toSettings(userId, await repository.findSettings(userId));
    },

    async update(userId: string, patch: UpdateSettingsInput): Promise<Settings> {
      const result = await repository.updateSettings(userId, patch);

      if (result.status === "accountNotFound") throw accountNotFound();

      return await toSettings(userId, result.settings);
    },
  };
}
