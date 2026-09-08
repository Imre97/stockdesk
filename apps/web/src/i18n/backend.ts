import type { BackendModule, ReadCallback } from "i18next";

import { importCatalog, preloadedCatalog } from "./catalogs";

/**
 * Feeds i18next from the locale glob instead of the network: the preloaded catalogs answer
 * synchronously, every other namespace arrives through its own dynamic import chunk.
 */
export const localeBackend: BackendModule = {
  type: "backend",

  init: () => undefined,

  read: (language: string, namespace: string, callback: ReadCallback) => {
    const preloaded = preloadedCatalog(language, namespace);

    if (preloaded !== null) {
      callback(null, preloaded);
      return;
    }

    void importCatalog(language, namespace).then(
      (catalog) => callback(catalog === null ? new Error(`Unknown catalog ${language}/${namespace}`) : null, catalog),
      (error: unknown) => callback(error instanceof Error ? error : new Error(String(error)), false),
    );
  },
};
