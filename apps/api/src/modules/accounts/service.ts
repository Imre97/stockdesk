import type {
  AccountSummaryDto,
  EquityPointDto,
  EquityRange,
  PositionDto,
  TradesQuery,
  TradesResponseDto,
  TransactionsPageDto,
  TransactionsQuery,
} from "@stockdesk/shared";
import { AppError } from "../../lib/errors.js";
import { listAccountTrades } from "../orders/listing.js";
import { listOpenPositions } from "../orders/positions-repository.js";
import { loadEquityPoints } from "./equity.js";
import { toPositionViews } from "./positions-view.js";
import { decodeCursor, encodeCursor, toCashTransactionDto } from "./ledger.js";
import * as repository from "./repository.js";
import {
  afterCashChange,
  currentTime,
  summarizeAccounts,
  type AccountsDependencies,
} from "./snapshot-writer.js";

export function accountNotFound(): AppError {
  return new AppError(404, "ACCOUNT_NOT_FOUND", "Account not found.");
}

function accountNameTaken(): AppError {
  return new AppError(409, "ACCOUNT_NAME_TAKEN", "An account with this name already exists.");
}

function accountLimitReached(): AppError {
  return new AppError(422, "ACCOUNT_LIMIT_REACHED", "The account limit for this user is reached.");
}

function invalidCursor(): AppError {
  return new AppError(422, "VALIDATION_ERROR", "The transactions cursor is invalid.");
}

export interface AccountsService {
  list: (userId: string) => Promise<AccountSummaryDto[]>;
  create: (userId: string, name: string) => Promise<AccountSummaryDto>;
  rename: (userId: string, accountId: string, name: string) => Promise<AccountSummaryDto>;
  positions: (userId: string, accountId: string) => Promise<PositionDto[]>;
  equity: (userId: string, accountId: string, range: EquityRange) => Promise<EquityPointDto[]>;
  transactions: (
    userId: string,
    accountId: string,
    query: TransactionsQuery,
  ) => Promise<TransactionsPageDto>;
  trades: (userId: string, accountId: string, query: TradesQuery) => Promise<TradesResponseDto>;
}

export async function requireOwnedAccount(
  userId: string,
  accountId: string,
): Promise<repository.AccountRecord> {
  const account = await repository.findAccount(userId, accountId);

  if (account === null) throw accountNotFound();

  return account;
}

export function createAccountsService(dependencies: AccountsDependencies = {}): AccountsService {
  async function summarize(account: repository.AccountRecord): Promise<AccountSummaryDto> {
    const [summary] = await summarizeAccounts([account], currentTime(dependencies), dependencies);

    if (summary === undefined) throw accountNotFound();

    return summary;
  }

  return {
    async list(userId: string): Promise<AccountSummaryDto[]> {
      return await summarizeAccounts(
        await repository.listAccounts(userId),
        currentTime(dependencies),
        dependencies,
      );
    },

    async create(userId: string, name: string): Promise<AccountSummaryDto> {
      const result = await repository.createAccount(userId, name);

      if (result.status === "limit") throw accountLimitReached();
      if (result.status === "nameTaken") throw accountNameTaken();

      await afterCashChange(userId, dependencies);

      return await summarize(result.account);
    },

    async rename(userId: string, accountId: string, name: string): Promise<AccountSummaryDto> {
      const result = await repository.renameAccount(userId, accountId, name);

      if (result.status === "notFound") throw accountNotFound();
      if (result.status === "nameTaken") throw accountNameTaken();

      return await summarize(result.account);
    },

    async positions(userId: string, accountId: string): Promise<PositionDto[]> {
      await requireOwnedAccount(userId, accountId);

      return await toPositionViews(
        await listOpenPositions(accountId),
        dependencies.prices,
        currentTime(dependencies),
      );
    },

    async equity(userId: string, accountId: string, range: EquityRange): Promise<EquityPointDto[]> {
      await requireOwnedAccount(userId, accountId);

      return await loadEquityPoints(accountId, range, currentTime(dependencies));
    },

    async trades(userId: string, accountId: string, query: TradesQuery): Promise<TradesResponseDto> {
      await requireOwnedAccount(userId, accountId);

      return await listAccountTrades(accountId, query);
    },

    async transactions(
      userId: string,
      accountId: string,
      query: TransactionsQuery,
    ): Promise<TransactionsPageDto> {
      await requireOwnedAccount(userId, accountId);

      const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
      if (query.cursor !== undefined && cursor === undefined) throw invalidCursor();

      const rows = await repository.listTransactions(accountId, query.limit + 1, cursor);
      const page = rows.slice(0, query.limit);
      const last = page[page.length - 1];

      return {
        transactions: page.map(toCashTransactionDto),
        nextCursor: rows.length > query.limit && last !== undefined ? encodeCursor(last) : null,
      };
    },
  };
}
