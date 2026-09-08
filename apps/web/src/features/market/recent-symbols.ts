export const RECENT_SYMBOLS_STORAGE_KEY = "recentSymbols";
export const RECENT_SYMBOLS_LIMIT = 5;

const SYMBOL_PATTERN = /^[A-Z0-9.-]{1,12}$/;

function normalize(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const upper = value.trim().toUpperCase();

  return SYMBOL_PATTERN.test(upper) ? upper : null;
}

export function readRecentSymbols(): string[] {
  let raw: string | null = null;

  try {
    raw = window.localStorage.getItem(RECENT_SYMBOLS_STORAGE_KEY);
  } catch {
    return [];
  }

  if (raw === null) return [];

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((entry) => normalize(entry))
    .filter((entry): entry is string => entry !== null)
    .slice(0, RECENT_SYMBOLS_LIMIT);
}

function write(symbols: string[]): void {
  try {
    window.localStorage.setItem(RECENT_SYMBOLS_STORAGE_KEY, JSON.stringify(symbols));
  } catch {
    return;
  }
}

export function pushRecentSymbol(symbol: string): void {
  const normalized = normalize(symbol);

  if (normalized === null) return;

  const rest = readRecentSymbols().filter((entry) => entry !== normalized);

  write([normalized, ...rest].slice(0, RECENT_SYMBOLS_LIMIT));
}

export function clearRecentSymbols(): void {
  try {
    window.localStorage.removeItem(RECENT_SYMBOLS_STORAGE_KEY);
  } catch {
    return;
  }
}
