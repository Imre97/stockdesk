import { useEffect } from "react";
import type { Language, Theme } from "@stockdesk/shared";

import { i18n } from "../../i18n";
import { localeForLanguage } from "../accounts/mappers";
import { applyTheme } from "./theme";
import { useSettingsStore } from "./store";

export interface ThemeControls {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export interface LanguageControls {
  language: Language;
  setLanguage: (language: Language) => void;
}

export function useTheme(): ThemeControls {
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);

  useEffect(() => applyTheme(theme), [theme]);

  return { theme, setTheme };
}

export function useSettingsLocale(): string {
  return localeForLanguage(useSettingsStore((state) => state.language));
}

export function useLanguage(): LanguageControls {
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);

  useEffect(() => {
    if (i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
  }, [language]);

  return { language, setLanguage };
}
