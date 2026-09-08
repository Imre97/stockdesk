import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { i18n } from "../../i18n";
import { useLanguage, useTheme } from "./hooks";
import { useSettingsStore } from "./store";

beforeEach(async () => {
  window.localStorage.clear();
  useSettingsStore.setState({ language: "en", theme: "system", defaultAccountId: null, status: "idle" });
  document.documentElement.classList.remove("dark");
  await i18n.changeLanguage("en");
});

describe("useTheme", () => {
  it("applies the current theme to the document element", () => {
    useSettingsStore.setState({ theme: "dark" });

    renderHook(() => useTheme());

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("applies the theme again after setTheme", () => {
    const { result } = renderHook(() => useTheme());

    act(() => result.current.setTheme("dark"));

    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});

describe("useLanguage", () => {
  it("changes the i18n language when the store language changes", async () => {
    const { result } = renderHook(() => useLanguage());

    expect(result.current.language).toBe("en");

    await act(async () => {
      result.current.setLanguage("hu");
      await Promise.resolve();
    });

    expect(i18n.language).toBe("hu");
  });
});
