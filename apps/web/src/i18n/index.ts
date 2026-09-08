import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import { resolveInitialLanguage } from "../features/settings/language";
import { readCachedSettings } from "../features/settings/storage";
import { localeBackend } from "./backend";
import { PRELOADED_NAMESPACES, buildPreloadedResources, importCatalog, listNamespaces } from "./catalogs";

export { PRELOADED_NAMESPACES };

function browserLanguage(): string | null {
  return typeof navigator === "undefined" ? null : navigator.language;
}

export const resources: Readonly<ReturnType<typeof buildPreloadedResources>> = buildPreloadedResources();

export const defaultNamespace = "common";

export const namespaces = listNamespaces();

export const i18n = i18next.createInstance();

void i18n
  .use(localeBackend)
  .use(initReactI18next)
  .init({
    resources: buildPreloadedResources(),
    partialBundledLanguages: true,
    lng: resolveInitialLanguage(readCachedSettings()?.language ?? null, browserLanguage()),
    fallbackLng: "en",
    ns: [...PRELOADED_NAMESPACES],
    defaultNS: defaultNamespace,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

export async function loadNamespace(language: string, namespace: string): Promise<void> {
  if (i18n.hasResourceBundle(language, namespace)) return;

  const catalog = await importCatalog(language, namespace);

  if (catalog === null) return;

  i18n.addResourceBundle(language, namespace, catalog, true, true);
}

/**
 * Route loaders call this before the first render of a page: it registers the namespace with
 * i18next, so the catalog is there on mount and a later language switch reloads it too.
 */
export async function ensureNamespaces(...requested: string[]): Promise<void> {
  await i18n.loadNamespaces(requested);
}
