import { useEffect } from "react";
import type { SettingsResponse, UpdateSettingsInput } from "@stockdesk/shared";
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import * as api from "./api";
import { useSettingsStore } from "./store";

export const SETTINGS_QUERY_KEY = ["settings"] as const;
export const SETTINGS_SAVE_ERROR_KEY = "errors.saveFailed";

export function useSettingsSync(): void {
  const applyServerSettings = useSettingsStore((state) => state.applyServerSettings);
  const query = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
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
  const applyServerSettings = useSettingsStore((state) => state.applyServerSettings);
  const queryClient = useQueryClient();
  const { t } = useTranslation("settings");

  return useMutation<SettingsResponse, Error, UpdateSettingsInput>({
    mutationFn: (input) => api.updateSettings(input),
    onSuccess: (response) => {
      applyServerSettings(response.settings);
      void queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
      toast.success(t("saved"));
    },
    onError: () => toast.error(t(SETTINGS_SAVE_ERROR_KEY)),
  });
}
