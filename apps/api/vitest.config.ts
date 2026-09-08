import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

dotenv.config({ path: path.join(repoRoot, ".env") });

const testDatabaseUrl = process.env.DATABASE_URL_TEST ?? "";

export default defineConfig({
  resolve: {
    alias: {
      "@stockdesk/shared": path.join(repoRoot, "packages", "shared", "src", "index.ts"),
    },
  },
  test: {
    environment: "node",
    passWithNoTests: true,
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    env: {
      DATABASE_URL: testDatabaseUrl,
      DIRECT_URL: testDatabaseUrl,
      TZ: "UTC",
    },
  },
});
