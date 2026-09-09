import type { AccountSummaryDto, ServerMessage } from "@stockdesk/shared";
import type { PriceService } from "../market/price-service.js";
import { lastElapsedSessionOpen } from "./ny-time.js";
import { listAccounts, listAllAccounts, type AccountRecord } from "./repository.js";
import { referenceEquities, truncateToSecond, writeSnapshots } from "./snapshot-repository.js";
import { accountEquity, toAccountSummary, valuePositions, type PositionInput } from "./summary.js";

export type Broadcast = (userId: string, message: ServerMessage) => void;

export interface AccountsDependencies {
  broadcast?: Broadcast | undefined;
  now?: (() => Date) | undefined;
  reportError?: ((message: string) => void) | undefined;
  prices?: Pick<PriceService, "getLastPrices" | "getPrevClose"> | undefined;
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
  dependencies: AccountsDependencies = {},
  positionsByAccount: Map<string, PositionInput[]> = new Map(),
): Promise<AccountSummaryDto[]> {
  const references = await referenceEquities(
    accounts.map((account) => account.id),
    lastElapsedSessionOpen(now),
  );

  const summaries: AccountSummaryDto[] = [];

  for (const account of accounts) {
    const values = await valuePositions(
      positionsByAccount.get(account.id) ?? [],
      dependencies.prices,
    );

    summaries.push(toAccountSummary(account, references.get(account.id), values));
  }

  return summaries;
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
    broadcast(userId, {
      type: "account_summary",
      accounts: await summarizeAccounts(owned, now, dependencies),
    });
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
