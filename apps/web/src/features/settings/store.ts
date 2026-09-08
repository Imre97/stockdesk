import type { Language, Settings, Theme } from "@stockdesk/shared";
import { create } from "zustand";

import { resolveInitialLanguage } from "./language";
import { readCachedSettings, writeCachedSettings } from "./storage";

export type SettingsStatus = "idle" | "loaded";

export interface SettingsState {
  language: Language;
  theme: Theme;
  defaultAccountId: string | null;
  status: SettingsStatus;
  hydrateFromCache: () => void;
  applyServerSettings: (settings: Settings) => void;
  setLanguage: (language: Language) => void;
  setTheme: (theme: Theme) => void;
  setDefaultAccountId: (accountId: string | null) => void;
}

const DEFAULT_LANGUAGE: Language = "en";
const DEFAULT_THEME: Theme = "system";

function browserLanguage(): string | null {
  return typeof navigator === "undefined" ? null : navigator.language;
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  function persist(next: Pick<SettingsState, "language" | "theme" | "defaultAccountId">): void {
    writeCachedSettings({
      language: next.language,
      theme: next.theme,
      defaultAccountId: next.defaultAccountId,
    });
  }

  function change(patch: Partial<Pick<SettingsState, "language" | "theme" | "defaultAccountId" | "status">>): void {
    set(patch);
    const state = get();
    persist(state);
  }

  return {
    language: DEFAULT_LANGUAGE,
    theme: DEFAULT_THEME,
    defaultAccountId: null,
    status: "idle",

    hydrateFromCache: () => {
      const cached = readCachedSettings();

      set({
        language: resolveInitialLanguage(cached?.language ?? null, browserLanguage()),
        theme: cached?.theme ?? DEFAULT_THEME,
        defaultAccountId: cached?.defaultAccountId ?? null,
      });
    },

    applyServerSettings: (settings) => {
      change({
        language: settings.language,
        theme: settings.theme,
        defaultAccountId: settings.defaultAccountId,
        status: "loaded",
      });
    },

    setLanguage: (language) => change({ language }),
    setTheme: (theme) => change({ theme }),
    setDefaultAccountId: (accountId) => change({ defaultAccountId: accountId }),
  };
});
