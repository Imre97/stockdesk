import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { releaseLock, writeLock } from "../../../scripts/hooks/test-lock.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const schemaPath = path.join("apps", "api", "prisma", "schema.prisma");

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

function migrateTestDatabase(testUrl: string): void {
  const result = spawnSync(process.execPath, [prismaEntryPoint(), "migrate", "deploy", "--schema", schemaPath], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: testUrl, DIRECT_URL: testUrl },
  });

  if (result.status !== 0) {
    throw new Error(
      `prisma migrate deploy failed for the test database.\n${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  }
}

export default function setup(): () => void {
  dotenv.config({ path: path.join(repoRoot, ".env") });

  const testUrl = process.env.DATABASE_URL_TEST;
  const developmentUrl = process.env.DATABASE_URL;

  if (testUrl === undefined || testUrl.length === 0) {
    throw new Error(
      "DATABASE_URL_TEST is not set. The API test suite refuses to run without a dedicated test database.",
    );
  }

  if (testUrl === developmentUrl) {
    throw new Error(
      "DATABASE_URL_TEST equals DATABASE_URL. The API test suite refuses to run against the development database.",
    );
  }

  writeLock(repoRoot, process.pid);

  const teardown = (): void => {
    releaseLock(repoRoot);
  };

  if (process.env.SKIP_DB_SETUP === "1") {
    console.warn(
      "SKIP_DB_SETUP=1: skipping prisma migrate deploy. Database-backed tests will fail until the database is reachable.",
    );
    return teardown;
  }

  try {
    migrateTestDatabase(testUrl);
  } catch (error) {
    teardown();
    throw error;
  }

  return teardown;
}
