import { languageSchema, themeSchema, type Language, type Theme } from "@stockdesk/shared";

export const SETTINGS_STORAGE_KEY = "stockdesk.settings";

export interface CachedSettings {
  language: Language | null;
  theme: Theme | null;
  defaultAccountId: string | null;
}

function normalizeLanguage(value: unknown): Language | null {
  const parsed = languageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function normalizeTheme(value: unknown): Theme | null {
  const parsed = themeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function normalizeAccountId(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export function readCachedSettings(): CachedSettings | null {
  let raw: string | null = null;

  try {
    raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
  } catch {
    return null;
  }

  if (raw === null) return null;

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (parsed === null || typeof parsed !== "object") return null;

  const blob = parsed as Record<string, unknown>;

  return {
    language: normalizeLanguage(blob.language),
    theme: normalizeTheme(blob.theme),
    defaultAccountId: normalizeAccountId(blob.defaultAccountId),
  };
}

export function writeCachedSettings(value: CachedSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(value));
  } catch {
    return;
  }
}
