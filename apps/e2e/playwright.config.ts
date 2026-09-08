import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

dotenv.config({ path: path.join(repoRoot, ".env") });

const webBaseUrl = "http://localhost:5173";
const apiBaseUrl = "http://localhost:3000";
const e2eDatabaseUrl = process.env.DATABASE_URL_E2E ?? "";
const isCi = process.env.CI !== undefined && process.env.CI !== "";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./global-setup.ts",
  use: {
    baseURL: webBaseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run dev --workspace @stockdesk/api",
      cwd: repoRoot,
      url: `${apiBaseUrl}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        NODE_ENV: "test",
        PORT: "3000",
        DATABASE_URL: e2eDatabaseUrl,
        DIRECT_URL: e2eDatabaseUrl,
        JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? "e2e-test-secret",
        CORS_ORIGIN: webBaseUrl,
        AUTH_RATE_LIMIT_MAX: "1000",
      },
    },
    {
      command: "npm run dev --workspace @stockdesk/web",
      cwd: repoRoot,
      url: webBaseUrl,
      reuseExistingServer: !isCi,
      timeout: 120_000,
    },
  ],
});
