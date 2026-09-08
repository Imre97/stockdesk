import { beforeEach, describe, expect, it } from "vitest";

import { SETTINGS_STORAGE_KEY } from "./storage";
import { useSettingsStore } from "./store";

function readBlob(): unknown {
  return JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "null");
}

beforeEach(() => {
  window.localStorage.clear();
  useSettingsStore.setState({ language: "en", theme: "system", defaultAccountId: null, status: "idle" });
});

describe("settings store", () => {
  it("starts idle with the default language and theme", () => {
    const state = useSettingsStore.getState();

    expect(state.language).toBe("en");
    expect(state.theme).toBe("system");
    expect(state.defaultAccountId).toBeNull();
    expect(state.status).toBe("idle");
  });

  it("hydrates from the cached blob without leaving the idle status", () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ language: "hu", theme: "dark", defaultAccountId: "account-1" }),
    );

    useSettingsStore.getState().hydrateFromCache();

    const state = useSettingsStore.getState();
    expect(state.language).toBe("hu");
    expect(state.theme).toBe("dark");
    expect(state.defaultAccountId).toBe("account-1");
    expect(state.status).toBe("idle");
  });

  it("keeps the defaults when the cache is corrupt", () => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, "{not json");

    useSettingsStore.getState().hydrateFromCache();

    expect(useSettingsStore.getState().theme).toBe("system");
    expect(useSettingsStore.getState().language).toBe("en");
  });

  it("applies server settings and marks the store loaded", () => {
    useSettingsStore.getState().applyServerSettings({ language: "hu", theme: "light", defaultAccountId: "account-2" });

    const state = useSettingsStore.getState();
    expect(state.status).toBe("loaded");
    expect(state.language).toBe("hu");
    expect(readBlob()).toEqual({ language: "hu", theme: "light", defaultAccountId: "account-2" });
  });

  it("writes the blob on every change", () => {
    useSettingsStore.getState().setLanguage("hu");
    expect(readBlob()).toEqual({ language: "hu", theme: "system", defaultAccountId: null });

    useSettingsStore.getState().setTheme("dark");
    expect(readBlob()).toEqual({ language: "hu", theme: "dark", defaultAccountId: null });

    useSettingsStore.getState().setDefaultAccountId("account-3");
    expect(readBlob()).toEqual({ language: "hu", theme: "dark", defaultAccountId: "account-3" });
  });
});
