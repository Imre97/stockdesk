import { useCallback, useEffect, useState } from "react";
import { languageSchema, themeSchema, type Language, type Theme } from "@stockdesk/shared";

import { useSettingsStore } from "./store";
import { useUpdateSettings } from "./sync";

export interface SettingsFormState {
  language: Language;
  theme: Theme;
  defaultAccountId: string | null;
  pending: boolean;
  setLanguage: (value: string) => void;
  setTheme: (value: string) => void;
  setDefaultAccountId: (accountId: string) => void;
  save: () => void;
}

export function useSettingsForm(): SettingsFormState {
  const language = useSettingsStore((state) => state.language);
  const theme = useSettingsStore((state) => state.theme);
  const storedDefaultAccountId = useSettingsStore((state) => state.defaultAccountId);
  const setStoreLanguage = useSettingsStore((state) => state.setLanguage);
  const setStoreTheme = useSettingsStore((state) => state.setTheme);
  const mutation = useUpdateSettings();

  const [defaultAccountId, setDefaultAccountId] = useState<string | null>(storedDefaultAccountId);

  useEffect(() => setDefaultAccountId(storedDefaultAccountId), [storedDefaultAccountId]);

  const setLanguage = useCallback(
    (value: string) => {
      const parsed = languageSchema.safeParse(value);

      if (parsed.success) setStoreLanguage(parsed.data);
    },
    [setStoreLanguage],
  );

  const setTheme = useCallback(
    (value: string) => {
      const parsed = themeSchema.safeParse(value);

      if (parsed.success) setStoreTheme(parsed.data);
    },
    [setStoreTheme],
  );

  const { mutate } = mutation;

  const save = useCallback(() => {
    mutate({
      language,
      theme,
      ...(defaultAccountId === null ? {} : { defaultAccountId }),
    });
  }, [defaultAccountId, language, mutate, theme]);

  return {
    language,
    theme,
    defaultAccountId,
    pending: mutation.isPending,
    setLanguage,
    setTheme,
    setDefaultAccountId,
    save,
  };
}
