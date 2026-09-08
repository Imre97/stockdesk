import { useCallback, useEffect } from "react";
import type { Language, Theme } from "@stockdesk/shared";

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
  setLanguage: (language: Language) => void;
  setTheme: (theme: Theme) => void;
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

  return {
    displayName: user?.displayName ?? "",
    initials: user?.initials ?? "",
    language,
    theme,
    setLanguage: persistLanguage,
    setTheme: persistTheme,
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
