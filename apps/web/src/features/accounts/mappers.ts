import {
  Decimal,
  accountSummarySchema,
  formatMoney,
  formatPercent,
  formatSignedMoney,
  type AccountSummary,
  type AccountSummaryDto,
  type DecimalValue,
  type Language,
} from "@stockdesk/shared";

export type PnlTone = "gain" | "loss" | "neutral";

export type AccountSummaryInput = AccountSummaryDto | AccountSummary;

export interface AccountViewModel {
  id: string;
  name: string;
  initials: string;
  cash: string;
  equity: string;
  unrealizedPnl: string;
  unrealizedPnlPct: string;
  unrealizedTone: PnlTone;
  dailyPnl: string;
  dailyPnlPct: string;
  dailyTone: PnlTone;
}

const LOCALES: Record<Language, string> = { en: "en-US", hu: "hu-HU" };
const TONE_CLASSES: Record<PnlTone, string> = {
  gain: "text-gain",
  loss: "text-loss",
  neutral: "text-neutral",
};
const MAX_INITIALS = 2;

export function localeForLanguage(language: Language): string {
  return LOCALES[language];
}

export function pnlTone(value: DecimalValue): PnlTone {
  if (value.isZero()) return "neutral";

  return value.isNegative() ? "loss" : "gain";
}

export function toneClass(tone: PnlTone): string {
  return TONE_CLASSES[tone];
}

export function toAccountInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, MAX_INITIALS)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

function isParsed(account: AccountSummaryInput): account is AccountSummary {
  return account.equity instanceof Decimal;
}

export function parseAccountSummaries(accounts: AccountSummaryInput[]): AccountSummary[] {
  return accounts.map((account) => (isParsed(account) ? account : accountSummarySchema.parse(account)));
}

export function sortByCreatedAt(accounts: AccountSummary[]): AccountSummary[] {
  return [...accounts].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function resolveActiveAccountId(
  accounts: AccountSummary[],
  currentId: string | null,
  defaultAccountId: string | null,
): string | null {
  const has = (candidate: string | null): boolean =>
    candidate !== null && accounts.some((account) => account.id === candidate);

  if (has(currentId)) return currentId;
  if (has(defaultAccountId)) return defaultAccountId;

  return sortByCreatedAt(accounts)[0]?.id ?? null;
}

export function toAccountViewModel(account: AccountSummary, locale: string): AccountViewModel {
  return {
    id: account.id,
    name: account.name,
    initials: toAccountInitials(account.name),
    cash: formatMoney(account.cash, locale),
    equity: formatMoney(account.equity, locale),
    unrealizedPnl: formatSignedMoney(account.unrealizedPnl, locale),
    unrealizedPnlPct: formatPercent(account.unrealizedPnlPct, locale),
    unrealizedTone: pnlTone(account.unrealizedPnl),
    dailyPnl: formatSignedMoney(account.dailyPnl, locale),
    dailyPnlPct: formatPercent(account.dailyPnlPct, locale),
    dailyTone: pnlTone(account.dailyPnl),
  };
}
