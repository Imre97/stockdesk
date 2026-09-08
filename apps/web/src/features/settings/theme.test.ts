import { afterEach, describe, expect, it, vi } from "vitest";

import { applyTheme, isDarkTheme } from "./theme";

interface Listener {
  (event: { matches: boolean }): void;
}

function createMatchMedia(matches: boolean) {
  const listeners = new Set<Listener>();
  const media = {
    matches,
    addEventListener: (_type: "change", listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: "change", listener: Listener) => listeners.delete(listener),
  };

  return {
    matchMedia: vi.fn(() => media),
    emit: (next: boolean) => {
      for (const listener of listeners) listener({ matches: next });
    },
    listenerCount: () => listeners.size,
  };
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

describe("isDarkTheme", () => {
  it("resolves the three theme values", () => {
    expect(isDarkTheme("dark", false)).toBe(true);
    expect(isDarkTheme("light", true)).toBe(false);
    expect(isDarkTheme("system", true)).toBe(true);
    expect(isDarkTheme("system", false)).toBe(false);
  });
});

describe("applyTheme", () => {
  it("toggles the dark class on the document element", () => {
    applyTheme("dark", createMatchMedia(false).matchMedia);
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    applyTheme("light", createMatchMedia(true).matchMedia);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("does not subscribe for an explicit theme", () => {
    const media = createMatchMedia(true);
    applyTheme("dark", media.matchMedia);

    expect(media.listenerCount()).toBe(0);
  });

  it("follows prefers-color-scheme changes while the theme is system", () => {
    const media = createMatchMedia(false);
    const unsubscribe = applyTheme("system", media.matchMedia);

    expect(document.documentElement.classList.contains("dark")).toBe(false);

    media.emit(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    unsubscribe();
    expect(media.listenerCount()).toBe(0);
  });
});
