export const RECENT_SYMBOLS_STORAGE_KEY = "recentSymbols";
export const RECENT_SYMBOLS_LIMIT = 5;

const SYMBOL_PATTERN = /^[A-Z0-9.-]{1,12}$/;

export interface RecentSymbol {
  symbol: string;
  name: string;
  exchange: string;
}

function normalize(entry: unknown): RecentSymbol | null {
  if (entry === null || typeof entry !== "object") return null;

  const { symbol, name, exchange } = entry as Record<string, unknown>;

  if (typeof symbol !== "string" || typeof name !== "string" || typeof exchange !== "string") return null;

  const upper = symbol.trim().toUpperCase();

  return SYMBOL_PATTERN.test(upper) ? { symbol: upper, name, exchange } : null;
}

export function readRecentSymbols(): RecentSymbol[] {
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
    .filter((entry): entry is RecentSymbol => entry !== null)
    .slice(0, RECENT_SYMBOLS_LIMIT);
}

function write(symbols: RecentSymbol[]): void {
  try {
    window.localStorage.setItem(RECENT_SYMBOLS_STORAGE_KEY, JSON.stringify(symbols));
  } catch {
    return;
  }
}

export function pushRecentSymbol(entry: RecentSymbol): void {
  const normalized = normalize(entry);

  if (normalized === null) return;

  const rest = readRecentSymbols().filter((known) => known.symbol !== normalized.symbol);

  write([normalized, ...rest].slice(0, RECENT_SYMBOLS_LIMIT));
}

export function clearRecentSymbols(): void {
  try {
    window.localStorage.removeItem(RECENT_SYMBOLS_STORAGE_KEY);
  } catch {
    return;
  }
}
