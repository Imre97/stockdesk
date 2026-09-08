import { languageSchema, type Language } from "@stockdesk/shared";

const HUNGARIAN_PREFIX = "hu";
const FALLBACK_LANGUAGE: Language = "en";

export function resolveInitialLanguage(
  cached: string | null | undefined,
  navigatorLanguage: string | null | undefined,
): Language {
  const parsed = languageSchema.safeParse(cached);
  if (parsed.success) return parsed.data;

  if (typeof navigatorLanguage === "string" && navigatorLanguage.toLowerCase().startsWith(HUNGARIAN_PREFIX)) {
    return HUNGARIAN_PREFIX;
  }

  return FALLBACK_LANGUAGE;
}
