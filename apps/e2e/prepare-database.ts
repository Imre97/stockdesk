import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const schemaPath = path.join("apps", "api", "prisma", "schema.prisma");

const TRUNCATE_ALL_TABLES = `
DO $$
DECLARE
  target text;
BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
    INTO target
    FROM pg_tables
   WHERE schemaname = 'public'
     AND tablename <> '_prisma_migrations';

  IF target IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || target || ' RESTART IDENTITY CASCADE';
  END IF;
END $$;
`;

function prismaEntryPoint(): string {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve("prisma/package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { bin?: Record<string, string> | string };
  const entry = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.prisma;

  if (entry === undefined) {
    throw new Error("Unable to locate the Prisma CLI entry point.");
  }

  return path.join(path.dirname(manifestPath), entry);
}

function runPrisma(args: string[], databaseUrl: string, input: string): void {
  const result = spawnSync(process.execPath, [prismaEntryPoint(), ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    input,
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
  });

  if (result.status !== 0) {
    throw new Error(`prisma ${args.join(" ")} failed.\n${result.stdout ?? ""}${result.stderr ?? ""}`);
  }
}

export function resolveDatabaseUrl(): string {
  const e2eUrl = process.env.DATABASE_URL_E2E;

  if (e2eUrl === undefined || e2eUrl.length === 0) {
    throw new Error(
      "DATABASE_URL_E2E is not set. The e2e suite refuses to run without a dedicated end-to-end database.",
    );
  }

  if (e2eUrl === process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL_E2E equals DATABASE_URL. The e2e suite refuses to run against the development database.",
    );
  }

  if (e2eUrl === process.env.DATABASE_URL_TEST) {
    throw new Error(
      "DATABASE_URL_E2E equals DATABASE_URL_TEST. The e2e suite refuses to share the unit test database.",
    );
  }

  return e2eUrl;
}

function requireDatabaseUrl(): string {
  const e2eUrl = process.env.DATABASE_URL_E2E;

  if (e2eUrl === undefined || e2eUrl.length === 0) {
    throw new Error("DATABASE_URL_E2E is not set. The e2e suite refuses to run without a dedicated end-to-end database.");
  }

  return e2eUrl;
}

/**
 * Runs inside the Playwright API web server command, where DATABASE_URL is already the e2e URL,
 * so only presence is checked here; the equality guards run in the Playwright config (parent env).
 */
export function prepareDatabase(): void {
  dotenv.config({ path: path.join(repoRoot, ".env") });

  const databaseUrl = requireDatabaseUrl();

  runPrisma(["migrate", "deploy", "--schema", schemaPath], databaseUrl, "");
  runPrisma(["db", "execute", "--stdin", "--schema", schemaPath], databaseUrl, TRUNCATE_ALL_TABLES);
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareDatabase();
}
