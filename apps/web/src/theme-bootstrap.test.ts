import { describe, expect, it } from "vitest";

import source from "../public/theme.js?raw";

interface ClassListStub {
  toggle: (name: string, force: boolean) => void;
}

function runBootstrap(raw: string | null, prefersDark: boolean): Set<string> {
  const classes = new Set<string>();
  const classList: ClassListStub = {
    toggle: (name, force) => {
      if (force) {
        classes.add(name);
      } else {
        classes.delete(name);
      }
    },
  };
  const documentStub = { documentElement: { classList } };
  const windowStub = {
    localStorage: { getItem: (key: string) => (key === "stockdesk.settings" ? raw : null) },
    matchMedia: (query: string) => ({ matches: prefersDark && query.includes("dark") }),
  };

  const run = new Function("window", "document", source) as (w: unknown, d: unknown) => void;
  run(windowStub, documentStub);

  return classes;
}

describe("theme bootstrap", () => {
  it("adds the dark class when the stored theme is dark", () => {
    expect(runBootstrap(JSON.stringify({ theme: "dark" }), false).has("dark")).toBe(true);
  });

  it("removes the dark class when the stored theme is light", () => {
    expect(runBootstrap(JSON.stringify({ theme: "light" }), true).has("dark")).toBe(false);
  });

  it("follows the media query when the stored theme is system", () => {
    expect(runBootstrap(JSON.stringify({ theme: "system" }), true).has("dark")).toBe(true);
    expect(runBootstrap(JSON.stringify({ theme: "system" }), false).has("dark")).toBe(false);
  });

  it("falls back to system when the stored value is corrupt or missing", () => {
    expect(runBootstrap("{not json", true).has("dark")).toBe(true);
    expect(runBootstrap("{not json", false).has("dark")).toBe(false);
    expect(runBootstrap(null, true).has("dark")).toBe(true);
    expect(runBootstrap(JSON.stringify({ theme: "neon" }), false).has("dark")).toBe(false);
  });
});
