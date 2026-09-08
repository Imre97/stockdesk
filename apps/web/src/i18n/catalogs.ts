export type Catalog = Record<string, string>;

const LOCALE_FILE_PATTERN = /^\.\/locales\/([^/]+)\/([^/]+)\.json$/;

export const PRELOADED_NAMESPACES = ["common", "shell"] as const;

const lazyCatalogs = import.meta.glob<Catalog>("./locales/*/*.json", { import: "default" });

const eagerCatalogs: Record<string, Catalog> = {
  ...import.meta.glob<Catalog>("./locales/*/common.json", { eager: true, import: "default" }),
  ...import.meta.glob<Catalog>("./locales/*/shell.json", { eager: true, import: "default" }),
};

function filePath(language: string, namespace: string): string {
  return `./locales/${language}/${namespace}.json`;
}

export function preloadedCatalog(language: string, namespace: string): Catalog | null {
  return eagerCatalogs[filePath(language, namespace)] ?? null;
}

export async function importCatalog(language: string, namespace: string): Promise<Catalog | null> {
  const preloaded = preloadedCatalog(language, namespace);

  if (preloaded !== null) return preloaded;

  const load = lazyCatalogs[filePath(language, namespace)];

  return load === undefined ? null : await load();
}

export function listNamespaces(): string[] {
  const found = new Set<string>();

  for (const file of Object.keys(lazyCatalogs)) {
    const match = LOCALE_FILE_PATTERN.exec(file);
    const namespace = match?.[2];

    if (namespace !== undefined) found.add(namespace);
  }

  return [...found];
}

export function buildPreloadedResources(): Record<string, Record<string, Catalog>> {
  const built: Record<string, Record<string, Catalog>> = {};

  for (const [file, catalog] of Object.entries(eagerCatalogs)) {
    const match = LOCALE_FILE_PATTERN.exec(file);
    const locale = match?.[1];
    const namespace = match?.[2];

    if (locale === undefined || namespace === undefined) continue;

    const bundle = built[locale] ?? {};
    bundle[namespace] = catalog;
    built[locale] = bundle;
  }

  return built;
}
