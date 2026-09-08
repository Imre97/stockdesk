import { PrismaClient } from "@prisma/client";

interface PrismaGlobal {
  stockdeskPrisma?: PrismaClient;
}

const globalForPrisma = globalThis as unknown as PrismaGlobal;

export const prisma: PrismaClient = globalForPrisma.stockdeskPrisma ?? new PrismaClient();

globalForPrisma.stockdeskPrisma = prisma;
