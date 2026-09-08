import { Prisma } from "@prisma/client";
import { ACCOUNT_LIMIT, toApiString, type Decimal } from "@stockdesk/shared";
import { prisma } from "../../lib/prisma.js";

const MONEY_PLACES = 2;

export interface AccountRecord {
  id: string;
  userId: string;
  name: string;
  cashBalance: Prisma.Decimal;
  createdAt: Date;
}

export interface CashTransactionRecord {
  id: string;
  accountId: string;
  type: string;
  amount: Prisma.Decimal;
  balanceAfter: Prisma.Decimal;
  note: string | null;
  referenceId: string | null;
  createdAt: Date;
}

export type CreateAccountResult =
  | { status: "created"; account: AccountRecord }
  | { status: "limit" }
  | { status: "nameTaken" };

export type RenameAccountResult =
  | { status: "renamed"; account: AccountRecord }
  | { status: "notFound" }
  | { status: "nameTaken" };

export type DepositResult =
  | { status: "applied"; account: AccountRecord; transaction: CashTransactionRecord }
  | { status: "notFound" };

export interface TransactionsCursor {
  createdAt: Date;
  id: string;
}

export function isDuplicateAccountNameError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;

  const target = error.meta?.target;
  if (typeof target === "string") return target.includes("name");
  if (Array.isArray(target)) return target.includes("name");

  return false;
}

export async function listAccounts(userId: string): Promise<AccountRecord[]> {
  return await prisma.account.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
}

export async function listAccountsByIds(accountIds: string[]): Promise<AccountRecord[]> {
  return await prisma.account.findMany({
    where: { id: { in: accountIds } },
    orderBy: { createdAt: "asc" },
  });
}

export async function listAllAccounts(): Promise<AccountRecord[]> {
  return await prisma.account.findMany({ orderBy: { createdAt: "asc" } });
}

export async function findAccount(userId: string, accountId: string): Promise<AccountRecord | null> {
  return await prisma.account.findFirst({ where: { id: accountId, userId } });
}

export async function createAccount(userId: string, name: string): Promise<CreateAccountResult> {
  try {
    return await prisma.$transaction(async (tx): Promise<CreateAccountResult> => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;

      const owned = await tx.account.count({ where: { userId } });
      if (owned >= ACCOUNT_LIMIT) return { status: "limit" };

      return { status: "created", account: await tx.account.create({ data: { userId, name } }) };
    });
  } catch (error) {
    if (isDuplicateAccountNameError(error)) return { status: "nameTaken" };
    throw error;
  }
}

export async function renameAccount(
  userId: string,
  accountId: string,
  name: string,
): Promise<RenameAccountResult> {
  try {
    const updated = await prisma.account.updateMany({ where: { id: accountId, userId }, data: { name } });
    if (updated.count === 0) return { status: "notFound" };
  } catch (error) {
    if (isDuplicateAccountNameError(error)) return { status: "nameTaken" };
    throw error;
  }

  const account = await findAccount(userId, accountId);

  return account === null ? { status: "notFound" } : { status: "renamed", account };
}

/**
 * The ledger timestamp is taken after the conditional update returns, not from the transaction start,
 * so concurrent deposits keep the (createdAt desc, id desc) order that Account.cashBalance follows.
 */
export async function applyDeposit(
  userId: string,
  accountId: string,
  amount: Decimal,
  note: string | undefined,
): Promise<DepositResult> {
  const amountText = toApiString(amount, MONEY_PLACES);

  return await prisma.$transaction(async (tx): Promise<DepositResult> => {
    const updated = await tx.$queryRaw<AccountRecord[]>`
      UPDATE "Account"
      SET "cashBalance" = "cashBalance" + ${amountText}::numeric, "updatedAt" = now()
      WHERE "id" = ${accountId} AND "userId" = ${userId}
      RETURNING "id", "userId", "name", "cashBalance", "createdAt"
    `;

    const [account] = updated;
    if (account === undefined) return { status: "notFound" };

    const transaction = await tx.cashTransaction.create({
      data: {
        accountId,
        type: "DEPOSIT",
        amount: amountText,
        balanceAfter: account.cashBalance,
        note: note ?? null,
        createdAt: new Date(),
      },
    });

    return { status: "applied", account, transaction };
  });
}

export async function listTransactions(
  accountId: string,
  limit: number,
  cursor: TransactionsCursor | undefined,
): Promise<CashTransactionRecord[]> {
  const keyset =
    cursor === undefined
      ? {}
      : {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        };

  return await prisma.cashTransaction.findMany({
    where: { accountId, ...keyset },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });
}
