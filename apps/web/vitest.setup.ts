import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

import { i18n } from "./src/i18n";

type Catalog = Record<string, string>;

const LOCALE_FILE_PATTERN = /^\.\/src\/i18n\/locales\/([^/]+)\/([^/]+)\.json$/;
const allCatalogs = import.meta.glob<Catalog>("./src/i18n/locales/*/*.json", {
  eager: true,
  import: "default",
});

for (const [file, catalog] of Object.entries(allCatalogs)) {
  const match = LOCALE_FILE_PATTERN.exec(file);
  const locale = match?.[1];
  const namespace = match?.[2];

  if (locale === undefined || namespace === undefined) continue;

  i18n.addResourceBundle(locale, namespace, catalog, true, true);
}

class ResizeObserverStub {
  observe(): void {
    return undefined;
  }

  unobserve(): void {
    return undefined;
  }

  disconnect(): void {
    return undefined;
  }
}

if (!("ResizeObserver" in globalThis)) {
  Object.defineProperty(globalThis, "ResizeObserver", { value: ResizeObserverStub, writable: true });
}

if (!("IntersectionObserver" in globalThis)) {
  Object.defineProperty(globalThis, "IntersectionObserver", { value: ResizeObserverStub, writable: true });
}

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

if (typeof Element !== "undefined") {
  Element.prototype.scrollIntoView ??= () => undefined;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
}

afterEach(() => {
  cleanup();
});
