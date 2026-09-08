import { describe, expect, it } from "vitest";

type JsonRecord = Record<string, unknown>;

const REFERENCE_LOCALE = "en";
const modules = import.meta.glob<JsonRecord>("./locales/*/*.json", { eager: true, import: "default" });

function flatten(value: JsonRecord, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    return typeof child === "object" && child !== null && !Array.isArray(child)
      ? flatten(child as JsonRecord, path)
      : [path];
  });
}

const catalog = new Map<string, Map<string, string[]>>();

for (const [file, resource] of Object.entries(modules)) {
  const match = /\.\/locales\/([^/]+)\/([^/]+)\.json$/.exec(file);
  if (match === null) continue;
  const [, locale, namespace] = match as unknown as [string, string, string];
  const namespaces = catalog.get(locale) ?? new Map<string, string[]>();
  namespaces.set(namespace, flatten(resource).sort());
  catalog.set(locale, namespaces);
}

const reference = catalog.get(REFERENCE_LOCALE);
const otherLocales = [...catalog.keys()].filter((locale) => locale !== REFERENCE_LOCALE);

describe("locale catalog", () => {
  it("contains the reference locale", () => {
    expect(reference).toBeDefined();
    expect(reference?.size).toBeGreaterThan(0);
  });

  it("contains at least one translated locale", () => {
    expect(otherLocales.length).toBeGreaterThan(0);
  });
});

describe.each(otherLocales)("locale %s", (locale) => {
  const namespaces = catalog.get(locale);

  it("has the same namespaces as the reference locale", () => {
    expect([...(namespaces?.keys() ?? [])].sort()).toEqual([...(reference?.keys() ?? [])].sort());
  });

  it.each([...(reference?.keys() ?? [])])("has the same keys in the %s namespace", (namespace) => {
    expect(namespaces?.get(namespace)).toEqual(reference?.get(namespace));
  });
});
