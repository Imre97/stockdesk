import type { Theme } from "@stockdesk/shared";

export const DARK_CLASS = "dark";
export const PREFERS_DARK_QUERY = "(prefers-color-scheme: dark)";

export interface MediaQueryChange {
  matches: boolean;
}

export interface MediaQueryListLike {
  matches: boolean;
  addEventListener: (type: "change", listener: (event: MediaQueryChange) => void) => void;
  removeEventListener: (type: "change", listener: (event: MediaQueryChange) => void) => void;
}

export type MatchMediaLike = (query: string) => MediaQueryListLike;

export function isDarkTheme(theme: Theme, prefersDark: boolean): boolean {
  return theme === "dark" || (theme === "system" && prefersDark);
}

function setDarkClass(dark: boolean): void {
  document.documentElement.classList.toggle(DARK_CLASS, dark);
}

function resolveMatchMedia(matchMedia?: MatchMediaLike): MediaQueryListLike | null {
  const resolved = matchMedia ?? (typeof window.matchMedia === "function" ? window.matchMedia : undefined);
  if (resolved === undefined) return null;

  return resolved(PREFERS_DARK_QUERY) as MediaQueryListLike;
}

export function applyTheme(theme: Theme, matchMedia?: MatchMediaLike): () => void {
  if (theme !== "system") {
    setDarkClass(isDarkTheme(theme, false));
    return () => undefined;
  }

  const media = resolveMatchMedia(matchMedia);
  setDarkClass(isDarkTheme(theme, media?.matches === true));

  if (media === null || typeof media.addEventListener !== "function") return () => undefined;

  const listener = (event: MediaQueryChange): void => {
    setDarkClass(isDarkTheme("system", event.matches));
  };

  media.addEventListener("change", listener);

  return () => media.removeEventListener("change", listener);
}
