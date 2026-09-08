import { useCallback, useEffect, useState } from "react";
import type { Language, Theme } from "@stockdesk/shared";

import { i18n } from "../../i18n";
import { localeForLanguage } from "../accounts/mappers";
import { applyTheme } from "./theme";
import { useSettingsStore } from "./store";
import { SETTINGS_SAVE_ERROR_KEY, useUpdateSettings } from "./sync";

export { SETTINGS_SAVE_ERROR_KEY };

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

export interface SettingsPersistence {
  persistLanguage: (language: Language) => void;
  persistTheme: (theme: Theme) => void;
  errorKey: string | null;
  pending: boolean;
}

/**
 * Applies a language or theme change locally first, then writes it to the server once.
 * A rejected write keeps the applied value and reports the failure instead of rolling
 * the interface back under the user.
 */
export function usePersistSetting(): SettingsPersistence {
  const setStoreLanguage = useSettingsStore((state) => state.setLanguage);
  const setStoreTheme = useSettingsStore((state) => state.setTheme);
  const mutation = useUpdateSettings();
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const { mutate } = mutation;

  const persistLanguage = useCallback(
    (language: Language) => {
      setStoreLanguage(language);
      setErrorKey(null);
      mutate({ language }, { onError: () => setErrorKey(SETTINGS_SAVE_ERROR_KEY) });
    },
    [mutate, setStoreLanguage],
  );

  const persistTheme = useCallback(
    (theme: Theme) => {
      setStoreTheme(theme);
      setErrorKey(null);
      mutate({ theme }, { onError: () => setErrorKey(SETTINGS_SAVE_ERROR_KEY) });
    },
    [mutate, setStoreTheme],
  );

  return { persistLanguage, persistTheme, errorKey, pending: mutation.isPending };
}
