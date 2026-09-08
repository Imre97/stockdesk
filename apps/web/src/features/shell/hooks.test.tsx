import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const logout = vi.fn();
const settingsApi = vi.hoisted(() => ({ fetchSettings: vi.fn(), updateSettings: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("../auth/hooks", async () => {
  const actual = await vi.importActual<typeof import("../auth/hooks")>("../auth/hooks");
  return { ...actual, useLogout: () => logout };
});

vi.mock("../settings/api", () => settingsApi);
vi.mock("sonner", () => ({ toast }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));

import { i18n } from "../../i18n";
import { useAuthStore } from "../auth/store";
import { SETTINGS_SAVE_ERROR_KEY } from "../settings/hooks";
import { useSettingsStore } from "../settings/store";
import { useProfileMenu } from "./hooks";

const USER = {
  id: "user-1",
  email: "trader@example.com",
  displayName: "Ada Trader",
  createdAt: "2026-09-08T10:00:00.000Z",
};

const SAVED_SETTINGS = { settings: { language: "hu", theme: "dark", defaultAccountId: null } };

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
  useAuthStore.setState({ user: USER, accessToken: "token-1", status: "authenticated" });
  useSettingsStore.setState({ language: "en", theme: "system", defaultAccountId: null, status: "idle" });
});

describe("useProfileMenu", () => {
  it("exposes the display name and the initials of the signed in user", () => {
    const { result } = renderHook(() => useProfileMenu(), { wrapper });

    expect(result.current.displayName).toBe("Ada Trader");
    expect(result.current.initials).toBe("AT");
  });

  it("signs the user out", () => {
    const { result } = renderHook(() => useProfileMenu(), { wrapper });

    result.current.signOut();

    expect(logout).toHaveBeenCalled();
  });

  it("falls back to an empty name when nobody is signed in", () => {
    useAuthStore.setState({ user: null, accessToken: null, status: "anonymous" });

    const { result } = renderHook(() => useProfileMenu(), { wrapper });

    expect(result.current.displayName).toBe("");
  });

  it("applies a language switch immediately and persists it once", async () => {
    settingsApi.updateSettings.mockResolvedValue(SAVED_SETTINGS);

    const { result } = renderHook(() => useProfileMenu(), { wrapper });

    act(() => result.current.setLanguage("hu"));

    expect(useSettingsStore.getState().language).toBe("hu");

    await waitFor(() => {
      expect(settingsApi.updateSettings).toHaveBeenCalledWith({ language: "hu" });
    });

    expect(settingsApi.updateSettings).toHaveBeenCalledTimes(1);
  });

  it("applies a theme switch immediately and persists it once", async () => {
    settingsApi.updateSettings.mockResolvedValue(SAVED_SETTINGS);

    const { result } = renderHook(() => useProfileMenu(), { wrapper });

    act(() => result.current.setTheme("dark"));

    expect(useSettingsStore.getState().theme).toBe("dark");

    await waitFor(() => {
      expect(settingsApi.updateSettings).toHaveBeenCalledWith({ theme: "dark" });
    });

    expect(settingsApi.updateSettings).toHaveBeenCalledTimes(1);
  });

  it("keeps the local theme and surfaces the error key when the patch fails", async () => {
    settingsApi.updateSettings.mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useProfileMenu(), { wrapper });

    act(() => result.current.setTheme("dark"));

    await waitFor(() => {
      expect(result.current.errorKey).toBe(SETTINGS_SAVE_ERROR_KEY);
    });

    expect(useSettingsStore.getState().theme).toBe("dark");
    expect(toast.error).toHaveBeenCalled();
  });
});
