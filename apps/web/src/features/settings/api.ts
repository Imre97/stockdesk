import {
  settingsResponseSchema,
  type SettingsResponse,
  type UpdateSettingsInput,
} from "@stockdesk/shared";

import { http } from "../../lib/http";

const BASE_PATH = "/api/v1/settings";

export function fetchSettings(): Promise<SettingsResponse> {
  return http<SettingsResponse>(BASE_PATH, {
    method: "GET",
    parse: (json) => settingsResponseSchema.parse(json),
  });
}

export function updateSettings(input: UpdateSettingsInput): Promise<SettingsResponse> {
  return http<SettingsResponse>(BASE_PATH, {
    method: "PATCH",
    json: input,
    parse: (json) => settingsResponseSchema.parse(json),
  });
}
