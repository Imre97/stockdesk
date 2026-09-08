import type { AccountSummaryDto, ServerMessage } from "@stockdesk/shared";
import { lastElapsedSessionOpen } from "./ny-time.js";
import { listAccounts, listAllAccounts, type AccountRecord } from "./repository.js";
import { referenceEquities, truncateToSecond, writeSnapshots } from "./snapshot-repository.js";
import { accountEquity, toAccountSummary } from "./summary.js";

export type Broadcast = (userId: string, message: ServerMessage) => void;

export interface AccountsDependencies {
  broadcast?: Broadcast | undefined;
  now?: (() => Date) | undefined;
  reportError?: ((message: string) => void) | undefined;
}

export function currentTime(dependencies: AccountsDependencies): Date {
  return (dependencies.now ?? (() => new Date()))();
}

function defaultReportError(message: string): void {
  process.stderr.write(`${message}\n`);
}

export async function summarizeAccounts(
  accounts: AccountRecord[],
  now: Date,
): Promise<AccountSummaryDto[]> {
  const references = await referenceEquities(
    accounts.map((account) => account.id),
    lastElapsedSessionOpen(now),
  );

  return accounts.map((account) => toAccountSummary(account, references.get(account.id)));
}

function groupByUser(accounts: AccountRecord[]): Map<string, AccountRecord[]> {
  const grouped = new Map<string, AccountRecord[]>();

  for (const account of accounts) {
    const owned = grouped.get(account.userId) ?? [];
    owned.push(account);
    grouped.set(account.userId, owned);
  }

  return grouped;
}

async function snapshotAndBroadcast(
  accounts: AccountRecord[],
  dependencies: AccountsDependencies,
): Promise<void> {
  if (accounts.length === 0) return;

  const now = currentTime(dependencies);
  const at = truncateToSecond(now);

  await writeSnapshots(
    accounts.map((account) => ({ accountId: account.id, at, ...accountEquity(account) })),
  );

  const broadcast = dependencies.broadcast;
  if (broadcast === undefined) return;

  for (const [userId, owned] of groupByUser(accounts)) {
    broadcast(userId, { type: "account_summary", accounts: await summarizeAccounts(owned, now) });
  }
}

export async function snapshotAllAccounts(dependencies: AccountsDependencies): Promise<void> {
  await snapshotAndBroadcast(await listAllAccounts(), dependencies);
}

export async function afterCashChange(
  userId: string,
  dependencies: AccountsDependencies,
): Promise<void> {
  try {
    await snapshotAndBroadcast(await listAccounts(userId), dependencies);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    (dependencies.reportError ?? defaultReportError)(`Writing the equity snapshot failed: ${reason}`);
  }
}
