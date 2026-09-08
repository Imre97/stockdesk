import { describe, expect, it } from "vitest";

import { resolveInitialLanguage } from "./language";

describe("resolveInitialLanguage", () => {
  it("prefers a valid cached language", () => {
    expect(resolveInitialLanguage("hu", "en-US")).toBe("hu");
    expect(resolveInitialLanguage("en", "hu-HU")).toBe("en");
  });

  it("falls back to the browser language when the cache is empty or invalid", () => {
    expect(resolveInitialLanguage(null, "hu-HU")).toBe("hu");
    expect(resolveInitialLanguage(undefined, "HU")).toBe("hu");
    expect(resolveInitialLanguage("de", "hu")).toBe("hu");
  });

  it("falls back to english for every other browser language", () => {
    expect(resolveInitialLanguage(null, "de-DE")).toBe("en");
    expect(resolveInitialLanguage(null, null)).toBe("en");
    expect(resolveInitialLanguage(null, undefined)).toBe("en");
  });
});
