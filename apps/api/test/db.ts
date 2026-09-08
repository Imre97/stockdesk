import { prisma } from "../src/lib/prisma.js";

interface TableRow {
  table_name: string;
}

export async function truncateAll(): Promise<void> {
  const rows = await prisma.$queryRaw<TableRow[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;

  const tables = rows
    .map((row) => row.table_name)
    .filter((name) => name !== "_prisma_migrations")
    .map((name) => `"public"."${name}"`);

  if (tables.length === 0) return;

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`);
}
