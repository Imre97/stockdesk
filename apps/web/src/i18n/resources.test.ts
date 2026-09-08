import { describe, expect, it } from "vitest";

import {
  PRELOADED_NAMESPACES,
  defaultNamespace,
  ensureNamespaces,
  i18n,
  loadNamespace,
  namespaces,
  resources,
} from "./index";

const EXPECTED_NAMESPACES = [
  "accounts",
  "auth",
  "common",
  "dashboard",
  "funding",
  "market",
  "settings",
  "shell",
];
const EXPECTED_LOCALES = ["en", "hu"];

describe("i18n resources", () => {
  it("derives every namespace from the locale glob", () => {
    expect([...namespaces].sort()).toEqual(EXPECTED_NAMESPACES);
  });

  it("uses common as the default namespace", () => {
    expect(defaultNamespace).toBe("common");
  });

  it("bundles only the first paint namespaces into the initial resources", () => {
    expect([...PRELOADED_NAMESPACES].sort()).toEqual(["common", "shell"]);
    expect(Object.keys(resources).sort()).toEqual(EXPECTED_LOCALES);

    for (const locale of EXPECTED_LOCALES) {
      expect(Object.keys(resources[locale] ?? {}).sort()).toEqual(["common", "shell"]);
    }
  });

  it("resolves a key from a preloaded namespace", () => {
    expect(i18n.t("shell:nav.portfolio")).not.toBe("nav.portfolio");
  });
});

describe("loadNamespace", () => {
  it("adds a catalog that the initial bundle does not carry", async () => {
    await loadNamespace("hu", "market");

    expect(i18n.getResource("hu", "market", "stats.title")).toBe("Fő mutatók");
  });

  it("ignores a namespace that has no catalog", async () => {
    await loadNamespace("en", "nothing-here");

    expect(i18n.hasResourceBundle("en", "nothing-here")).toBe(false);
  });
});

describe("ensureNamespaces", () => {
  it("registers the namespace so a later language change reloads it", async () => {
    await ensureNamespaces("market");

    expect([...(i18n.options.ns ?? [])]).toContain("market");
  });
});
