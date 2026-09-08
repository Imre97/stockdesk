import type { ReactNode } from "react";
import { settingsResponseSchema } from "@stockdesk/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ fetchSettings: vi.fn(), updateSettings: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("./api", () => api);
vi.mock("sonner", () => ({ toast }));

import { i18n } from "../../i18n";
import { useSettingsStore } from "./store";
import { useSettingsSync, useUpdateSettings } from "./sync";

const SERVER_SETTINGS = settingsResponseSchema.parse({
  settings: { language: "hu", theme: "dark", defaultAccountId: "acc-2" },
});

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </I18nextProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  useSettingsStore.setState({ language: "en", theme: "system", defaultAccountId: null, status: "idle" });
});

describe("useSettingsSync", () => {
  it("applies the settings returned by the server", async () => {
    api.fetchSettings.mockResolvedValue(SERVER_SETTINGS);

    renderHook(() => useSettingsSync(), { wrapper });

    await waitFor(() => {
      expect(useSettingsStore.getState().status).toBe("loaded");
    });

    const state = useSettingsStore.getState();

    expect(state.language).toBe("hu");
    expect(state.theme).toBe("dark");
    expect(state.defaultAccountId).toBe("acc-2");
  });

  it("keeps the cached settings when the request fails", async () => {
    api.fetchSettings.mockRejectedValue(new Error("offline"));

    renderHook(() => useSettingsSync(), { wrapper });

    await waitFor(() => {
      expect(api.fetchSettings).toHaveBeenCalled();
    });

    expect(useSettingsStore.getState().language).toBe("en");
  });
});

describe("useUpdateSettings", () => {
  it("patches the settings and applies the server answer", async () => {
    api.updateSettings.mockResolvedValue(SERVER_SETTINGS);

    const { result } = renderHook(() => useUpdateSettings(), { wrapper });

    result.current.mutate({ language: "hu" });

    await waitFor(() => {
      expect(api.updateSettings).toHaveBeenCalledWith({ language: "hu" });
    });

    await waitFor(() => {
      expect(useSettingsStore.getState().theme).toBe("dark");
    });

    expect(toast.success).toHaveBeenCalled();
  });
});
