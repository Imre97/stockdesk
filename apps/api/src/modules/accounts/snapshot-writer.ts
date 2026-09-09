import { Decimal, type AccountSummaryDto, type ServerMessage } from "@stockdesk/shared";
import { getConfig } from "../../lib/config.js";
import type { PriceService } from "../market/price-service.js";
import {
  listOpenPositionsByAccounts,
  sumReservedCashByAccounts,
} from "../orders/positions-repository.js";
import { lastElapsedSessionOpen } from "./ny-time.js";
import { listAccounts, listAllAccounts, type AccountRecord } from "./repository.js";
import { referenceEquities, truncateToSecond, writeSnapshots } from "./snapshot-repository.js";
import {
  accountEquity,
  marginRatesOf,
  toAccountSummary,
  valuePositions,
  NO_POSITIONS,
  type MarginRates,
  type PositionValues,
} from "./summary.js";

export type Broadcast = (userId: string, message: ServerMessage) => void;

export interface AccountsDependencies {
  broadcast?: Broadcast | undefined;
  now?: (() => Date) | undefined;
  reportError?: ((message: string) => void) | undefined;
  prices?: Pick<PriceService, "getLastPrices" | "getPrevClose"> | undefined;
  rates?: MarginRates | undefined;
}

export interface AccountValues {
  positions: Map<string, PositionValues>;
  reserved: Map<string, Decimal>;
}

export function currentTime(dependencies: AccountsDependencies): Date {
  return (dependencies.now ?? (() => new Date()))();
}

function ratesOf(dependencies: AccountsDependencies): MarginRates {
  return dependencies.rates ?? marginRatesOf(getConfig());
}

function defaultReportError(message: string): void {
  process.stderr.write(`${message}\n`);
}

export async function valueAccounts(
  accountIds: string[],
  dependencies: AccountsDependencies,
): Promise<AccountValues> {
  const [rows, reserved] = await Promise.all([
    listOpenPositionsByAccounts(accountIds),
    sumReservedCashByAccounts(accountIds),
  ]);

  const positions = new Map<string, PositionValues>();

  for (const accountId of accountIds) {
    positions.set(
      accountId,
      await valuePositions(rows.get(accountId) ?? [], dependencies.prices),
    );
  }

  return { positions, reserved };
}

export async function summarizeAccounts(
  accounts: AccountRecord[],
  now: Date,
  dependencies: AccountsDependencies = {},
  values?: AccountValues,
): Promise<AccountSummaryDto[]> {
  const accountIds = accounts.map((account) => account.id);
  const resolved = values ?? (await valueAccounts(accountIds, dependencies));
  const references = await referenceEquities(accountIds, lastElapsedSessionOpen(now));
  const rates = ratesOf(dependencies);

  return accounts.map((account) =>
    toAccountSummary(account, {
      referenceEquity: references.get(account.id),
      values: resolved.positions.get(account.id) ?? NO_POSITIONS,
      reservedCash: resolved.reserved.get(account.id) ?? new Decimal("0"),
      rates,
    }),
  );
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
  const values = await valueAccounts(
    accounts.map((account) => account.id),
    dependencies,
  );

  await writeSnapshots(
    accounts.map((account) => ({
      accountId: account.id,
      at,
      ...accountEquity(account, values.positions.get(account.id) ?? NO_POSITIONS),
    })),
  );

  const broadcast = dependencies.broadcast;
  if (broadcast === undefined) return;

  for (const [userId, owned] of groupByUser(accounts)) {
    broadcast(userId, {
      type: "account_summary",
      accounts: await summarizeAccounts(owned, now, dependencies, values),
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
