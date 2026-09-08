import { useCallback, useEffect } from "react";
import { languageSchema, themeSchema, type Language, type Theme } from "@stockdesk/shared";

import { createWsClient } from "../../lib/ws";
import { useAuthStore } from "../auth/store";
import { useCurrentUser, useLogout } from "../auth/hooks";
import { useAccountsStore } from "../accounts/store";
import { useLanguage, usePersistSetting, useTheme } from "../settings/hooks";

const WS_PATH = "/ws";

export interface ProfileMenuState {
  displayName: string;
  initials: string;
  language: Language;
  theme: Theme;
  setLanguage: (value: string) => void;
  setTheme: (value: string) => void;
  errorKey: string | null;
  signOut: () => void;
}

export function useProfileMenu(): ProfileMenuState {
  const user = useCurrentUser();
  const logout = useLogout();
  const { language } = useLanguage();
  const { theme } = useTheme();
  const { persistLanguage, persistTheme, errorKey } = usePersistSetting();

  const signOut = useCallback(() => {
    void logout();
  }, [logout]);

  const setLanguage = useCallback(
    (value: string) => {
      const parsed = languageSchema.safeParse(value);

      if (parsed.success) persistLanguage(parsed.data);
    },
    [persistLanguage],
  );

  const setTheme = useCallback(
    (value: string) => {
      const parsed = themeSchema.safeParse(value);

      if (parsed.success) persistTheme(parsed.data);
    },
    [persistTheme],
  );

  return {
    displayName: user?.displayName ?? "",
    initials: user?.initials ?? "",
    language,
    theme,
    setLanguage,
    setTheme,
    errorKey,
    signOut,
  };
}

export function useAccountSummaryStream(): void {
  const applyAccountSummary = useAccountsStore((state) => state.applyAccountSummary);

  useEffect(() => {
    const client = createWsClient({
      url: WS_PATH,
      getAccessToken: () => useAuthStore.getState().accessToken,
      onMessage: (message) => {
        if (message.type !== "account_summary") return;

        applyAccountSummary(message);
      },
    });

    client.connect();

    return () => client.disconnect();
  }, [applyAccountSummary]);
}
