import { useEffect } from "react";
import type { SettingsResponse, UpdateSettingsInput } from "@stockdesk/shared";
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { userScopedKey } from "../../lib/query-keys";
import { useCurrentUserId } from "../auth/hooks";
import * as api from "./api";
import { useSettingsStore } from "./store";

export const SETTINGS_SAVE_ERROR_KEY = "errors.saveFailed";

export function settingsQueryKey(userId: string | null): readonly unknown[] {
  return userScopedKey(userId, "settings");
}

export function useSettingsSync(): void {
  const userId = useCurrentUserId();
  const applyServerSettings = useSettingsStore((state) => state.applyServerSettings);
  const query = useQuery({
    queryKey: settingsQueryKey(userId),
    queryFn: api.fetchSettings,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const settings = query.data?.settings;

  useEffect(() => {
    if (settings === undefined) return;

    applyServerSettings(settings);
  }, [applyServerSettings, settings]);
}

export function useUpdateSettings(): UseMutationResult<SettingsResponse, Error, UpdateSettingsInput> {
  const userId = useCurrentUserId();
  const applyServerSettings = useSettingsStore((state) => state.applyServerSettings);
  const queryClient = useQueryClient();
  const { t } = useTranslation("settings");

  return useMutation<SettingsResponse, Error, UpdateSettingsInput>({
    mutationFn: (input) => api.updateSettings(input),
    onSuccess: (response) => {
      applyServerSettings(response.settings);
      void queryClient.invalidateQueries({ queryKey: settingsQueryKey(userId) });
      toast.success(t("saved"));
    },
    onError: () => toast.error(t(SETTINGS_SAVE_ERROR_KEY)),
  });
}
