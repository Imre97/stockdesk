import { describe, expect, it } from "vitest";

import {
  languageSchema,
  settingsResponseSchema,
  settingsSchema,
  themeSchema,
  updateSettingsSchema,
} from "./settings.js";

const SETTINGS = { language: "en", theme: "system", defaultAccountId: "clx0000000000000000000001" };

describe("languageSchema", () => {
  it.each([["en"], ["hu"]])("accepts %s", (language) => {
    expect(languageSchema.parse(language)).toBe(language);
  });

  it.each([["EN"], ["de"], [""], ["en-US"]])("rejects %s", (language) => {
    expect(languageSchema.safeParse(language).success).toBe(false);
  });
});

describe("themeSchema", () => {
  it.each([["light"], ["dark"], ["system"]])("accepts %s", (theme) => {
    expect(themeSchema.parse(theme)).toBe(theme);
  });

  it.each([["Light"], ["auto"], [""]])("rejects %s", (theme) => {
    expect(themeSchema.safeParse(theme).success).toBe(false);
  });
});

describe("settingsSchema", () => {
  it("accepts the documented settings shape", () => {
    expect(settingsSchema.parse(SETTINGS)).toEqual(SETTINGS);
  });

  it("accepts a null default account", () => {
    expect(settingsSchema.parse({ ...SETTINGS, defaultAccountId: null }).defaultAccountId).toBeNull();
  });

  it("rejects a settings object without the default account key", () => {
    const body: Record<string, unknown> = { ...SETTINGS };
    delete body.defaultAccountId;

    expect(settingsSchema.safeParse(body).success).toBe(false);
  });

  it("rejects an unknown language", () => {
    expect(settingsSchema.safeParse({ ...SETTINGS, language: "de" }).success).toBe(false);
  });

  it("accepts a settings response", () => {
    expect(settingsResponseSchema.parse({ settings: SETTINGS }).settings).toEqual(SETTINGS);
  });

  it("rejects a settings response without the settings key", () => {
    expect(settingsResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe("updateSettingsSchema", () => {
  it.each([
    ["language only", { language: "hu" }],
    ["theme only", { theme: "dark" }],
    ["default account only", { defaultAccountId: "clx0000000000000000000001" }],
  ])("accepts %s", (_label, body) => {
    expect(updateSettingsSchema.safeParse(body).success).toBe(true);
  });

  it("accepts every field at once", () => {
    const result = updateSettingsSchema.parse({
      language: "hu",
      theme: "light",
      defaultAccountId: "clx0000000000000000000001",
    });

    expect(result).toEqual({ language: "hu", theme: "light", defaultAccountId: "clx0000000000000000000001" });
  });

  it("rejects an empty body", () => {
    expect(updateSettingsSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a null default account", () => {
    expect(updateSettingsSchema.safeParse({ defaultAccountId: null }).success).toBe(false);
  });

  it("rejects an empty default account id", () => {
    expect(updateSettingsSchema.safeParse({ defaultAccountId: "" }).success).toBe(false);
  });

  it("rejects an unknown theme", () => {
    expect(updateSettingsSchema.safeParse({ theme: "auto" }).success).toBe(false);
  });

  it("strips unknown keys", () => {
    expect(updateSettingsSchema.parse({ theme: "dark", currency: "EUR" })).toEqual({ theme: "dark" });
  });
});
