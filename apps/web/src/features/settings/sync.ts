import { useEffect } from "react";
import type { SettingsResponse, UpdateSettingsInput } from "@stockdesk/shared";
import { useMutation, useQuery, type UseMutationResult } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import * as api from "./api";
import { useSettingsStore } from "./store";

export const SETTINGS_QUERY_KEY = ["settings"] as const;

export function useSettingsSync(): void {
  const applyServerSettings = useSettingsStore((state) => state.applyServerSettings);
  const query = useQuery({ queryKey: SETTINGS_QUERY_KEY, queryFn: api.fetchSettings });
  const settings = query.data?.settings;

  useEffect(() => {
    if (settings === undefined) return;

    applyServerSettings(settings);
  }, [applyServerSettings, settings]);
}

export function useUpdateSettings(): UseMutationResult<SettingsResponse, Error, UpdateSettingsInput> {
  const applyServerSettings = useSettingsStore((state) => state.applyServerSettings);
  const { t } = useTranslation("settings");

  return useMutation<SettingsResponse, Error, UpdateSettingsInput>({
    mutationFn: (input) => api.updateSettings(input),
    onSuccess: (response) => {
      applyServerSettings(response.settings);
      toast.success(t("saved"));
    },
  });
}
