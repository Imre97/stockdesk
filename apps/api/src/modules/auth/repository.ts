import { Prisma } from "@prisma/client";
import { Decimal } from "@stockdesk/shared";
import { prisma } from "../../lib/prisma.js";

const MAIN_ACCOUNT_NAME = "Main";
const INITIAL_CASH = "100000";
const INITIAL_FUNDING_NOTE = "initial funding";

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  createdAt: Date;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
}

export interface RefreshTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export type RotationResult =
  | { status: "rotated"; userId: string }
  | { status: "reused" }
  | { status: "invalid" };

export function isDuplicateEmailError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;

  const target = error.meta?.target;
  if (typeof target === "string") return target.includes("email");
  if (Array.isArray(target)) return target.includes("email");

  return false;
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  return await prisma.user.findUnique({ where: { email } });
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  return await prisma.user.findUnique({ where: { id } });
}

export async function createUserWithFundedAccount(input: CreateUserInput): Promise<UserRecord> {
  return await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: input.email, passwordHash: input.passwordHash, displayName: input.displayName },
    });

    const initialCash = new Decimal(INITIAL_CASH);

    const account = await tx.account.create({
      data: { userId: user.id, name: MAIN_ACCOUNT_NAME, cashBalance: initialCash },
    });

    await tx.cashTransaction.create({
      data: {
        accountId: account.id,
        type: "DEPOSIT",
        amount: initialCash,
        balanceAfter: initialCash,
        note: INITIAL_FUNDING_NOTE,
      },
    });

    await tx.userSettings.create({ data: { userId: user.id, defaultAccountId: account.id } });

    return user;
  });
}

export async function createRefreshToken(input: RefreshTokenInput): Promise<void> {
  await prisma.refreshToken.create({ data: input });
}

export async function revokeRefreshToken(tokenHash: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function deleteExpiredRefreshTokens(now: Date = new Date()): Promise<number> {
  const result = await prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } });

  return result.count;
}

export async function rotateRefreshToken(
  presentedHash: string,
  nextHash: string,
  expiresAt: Date,
): Promise<RotationResult> {
  const result = await prisma.$transaction(async (tx) => {
    const presented = await tx.refreshToken.findUnique({ where: { tokenHash: presentedHash } });
    const now = new Date();

    if (presented === null || presented.expiresAt < now) return { status: "invalid" } as RotationResult;

    const claimed = await tx.refreshToken.updateMany({
      where: { id: presented.id, revokedAt: null },
      data: { revokedAt: now },
    });

    if (claimed.count === 0) {
      await tx.refreshToken.updateMany({
        where: { userId: presented.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      return { status: "reused" } as RotationResult;
    }

    await tx.refreshToken.create({ data: { userId: presented.userId, tokenHash: nextHash, expiresAt } });

    return { status: "rotated", userId: presented.userId } as RotationResult;
  });

  if (result.status === "rotated") await deleteExpiredRefreshTokens();

  return result;
}
