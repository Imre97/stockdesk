import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import { resolveInitialLanguage } from "../features/settings/language";
import { readCachedSettings } from "../features/settings/storage";

type Catalog = Record<string, string>;

const LOCALE_FILE_PATTERN = /\/locales\/([^/]+)\/([^/]+)\.json$/;

const catalogs = import.meta.glob<Catalog>("./locales/*/*.json", { eager: true, import: "default" });

function buildResources(): Record<string, Record<string, Catalog>> {
  const built: Record<string, Record<string, Catalog>> = {};

  for (const [file, catalog] of Object.entries(catalogs)) {
    const match = LOCALE_FILE_PATTERN.exec(file);
    if (match === null) continue;

    const [, locale, namespace] = match;
    if (locale === undefined || namespace === undefined) continue;

    const bundle = built[locale] ?? {};
    bundle[namespace] = catalog;
    built[locale] = bundle;
  }

  return built;
}

function browserLanguage(): string | null {
  return typeof navigator === "undefined" ? null : navigator.language;
}

export const resources = buildResources();

export const defaultNamespace = "common";

export const namespaces = [
  ...new Set(Object.values(resources).flatMap((bundle) => Object.keys(bundle))),
];

export const i18n = i18next.createInstance();

void i18n.use(initReactI18next).init({
  resources,
  lng: resolveInitialLanguage(readCachedSettings()?.language ?? null, browserLanguage()),
  fallbackLng: "en",
  ns: namespaces,
  defaultNS: defaultNamespace,
  interpolation: { escapeValue: false },
});
