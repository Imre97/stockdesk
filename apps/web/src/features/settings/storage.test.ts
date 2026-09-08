import { beforeEach, describe, expect, it, vi } from "vitest";

import { SETTINGS_STORAGE_KEY, readCachedSettings, writeCachedSettings } from "./storage";

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("readCachedSettings", () => {
  it("returns null when nothing is cached", () => {
    expect(readCachedSettings()).toBeNull();
  });

  it("returns null for corrupt json", () => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, "{not json");

    expect(readCachedSettings()).toBeNull();
  });

  it("drops unknown values instead of failing", () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ language: "de", theme: "neon", defaultAccountId: 7 }),
    );

    expect(readCachedSettings()).toEqual({ language: null, theme: null, defaultAccountId: null });
  });

  it("reads a valid blob", () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ language: "hu", theme: "dark", defaultAccountId: "account-1" }),
    );

    expect(readCachedSettings()).toEqual({ language: "hu", theme: "dark", defaultAccountId: "account-1" });
  });

  it("survives a throwing storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(readCachedSettings()).toBeNull();
  });
});

describe("writeCachedSettings", () => {
  it("stores the blob under the settings key", () => {
    writeCachedSettings({ language: "hu", theme: "light", defaultAccountId: null });

    expect(JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "null")).toEqual({
      language: "hu",
      theme: "light",
      defaultAccountId: null,
    });
  });

  it("survives a throwing storage", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => writeCachedSettings({ language: "en", theme: "system", defaultAccountId: null })).not.toThrow();
  });
});
