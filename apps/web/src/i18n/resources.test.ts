import { describe, expect, it } from "vitest";

import { defaultNamespace, i18n, namespaces, resources } from "./index";

const EXPECTED_NAMESPACES = ["accounts", "auth", "common", "dashboard", "funding", "settings", "shell"];
const EXPECTED_LOCALES = ["en", "hu"];

describe("i18n resources", () => {
  it("derives every namespace from the locale glob", () => {
    expect([...namespaces].sort()).toEqual(EXPECTED_NAMESPACES);
  });

  it("uses common as the default namespace", () => {
    expect(defaultNamespace).toBe("common");
  });

  it("builds one resource bundle per locale and namespace", () => {
    expect(Object.keys(resources).sort()).toEqual(EXPECTED_LOCALES);

    for (const locale of EXPECTED_LOCALES) {
      expect(Object.keys(resources[locale] ?? {}).sort()).toEqual(EXPECTED_NAMESPACES);
    }
  });

  it("resolves a key from a namespace other than the default", () => {
    expect(i18n.t("shell:nav.portfolio")).not.toBe("nav.portfolio");
  });
});
