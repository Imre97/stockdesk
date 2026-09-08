import { prisma } from "../../lib/prisma.js";

export interface SettingsRecord {
  language: string;
  theme: string;
  defaultAccountId: string | null;
}

export interface SettingsPatch {
  language?: string | undefined;
  theme?: string | undefined;
  defaultAccountId?: string | undefined;
}

interface SettingsFields {
  language?: string;
  theme?: string;
  defaultAccountId?: string;
}

function definedFields(patch: SettingsPatch): SettingsFields {
  const fields: SettingsFields = {};

  if (patch.language !== undefined) fields.language = patch.language;
  if (patch.theme !== undefined) fields.theme = patch.theme;
  if (patch.defaultAccountId !== undefined) fields.defaultAccountId = patch.defaultAccountId;

  return fields;
}

export type UpdateSettingsResult =
  | { status: "updated"; settings: SettingsRecord }
  | { status: "accountNotFound" };

export async function findSettings(userId: string): Promise<SettingsRecord | null> {
  return await prisma.userSettings.findUnique({
    where: { userId },
    select: { language: true, theme: true, defaultAccountId: true },
  });
}

export async function accountExists(userId: string, accountId: string): Promise<boolean> {
  const account = await prisma.account.findFirst({ where: { id: accountId, userId }, select: { id: true } });

  return account !== null;
}

export async function oldestAccountId(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });

  return account?.id ?? null;
}

export async function updateSettings(
  userId: string,
  patch: SettingsPatch,
): Promise<UpdateSettingsResult> {
  return await prisma.$transaction(async (tx): Promise<UpdateSettingsResult> => {
    if (patch.defaultAccountId !== undefined) {
      const owned = await tx.account.findFirst({
        where: { id: patch.defaultAccountId, userId },
        select: { id: true },
      });

      if (owned === null) return { status: "accountNotFound" };
    }

    const fields = definedFields(patch);

    const settings = await tx.userSettings.upsert({
      where: { userId },
      create: { userId, ...fields },
      update: fields,
      select: { language: true, theme: true, defaultAccountId: true },
    });

    return { status: "updated", settings };
  });
}
