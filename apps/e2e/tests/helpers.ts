import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const API_BASE_URL = "http://localhost:3000";
export const TEST_PASSWORD = "Password123!";
export const WRONG_PASSWORD = "WrongPassword123!";

export const MAIN_ACCOUNT_NAME = "Main";
export const SIDEBAR_STORAGE_KEY = "stockdesk.sidebarCollapsed";
export const SETTINGS_STORAGE_KEY = "stockdesk.settings";

const EMAIL_LABEL = "Email";
const PASSWORD_LABEL = "Password";
const LOGIN_BUTTON = "Sign in";

const here = path.dirname(fileURLToPath(import.meta.url));
const huLocalesDirectory = path.resolve(here, "..", "..", "web", "src", "i18n", "locales", "hu");

export interface TestUser {
  email: string;
  password: string;
  displayName: string;
}

export interface TestSession {
  accessToken: string;
}

export interface AccountSummaryJson {
  id: string;
  name: string;
  cash: string;
  equity: string;
}

let sequence = 0;

export function uniqueEmail(): string {
  sequence += 1;
  return `e2e-${Date.now()}-${sequence}@example.com`;
}

export function makeTestUser(): TestUser {
  return { email: uniqueEmail(), password: TEST_PASSWORD, displayName: "E2E Trader" };
}

export async function registerViaApi(request: APIRequestContext, user: TestUser): Promise<TestSession> {
  const response = await request.post(`${API_BASE_URL}/api/v1/auth/register`, {
    data: { email: user.email, password: user.password, displayName: user.displayName },
  });

  if (!response.ok()) {
    throw new Error(
      `Registration through the API failed with status ${response.status()}: ${await response.text()}`,
    );
  }

  const body = (await response.json()) as { accessToken: string };

  return { accessToken: body.accessToken };
}

export async function loginViaUi(page: Page, user: TestUser): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(EMAIL_LABEL, { exact: true }).fill(user.email);
  await page.getByLabel(PASSWORD_LABEL, { exact: true }).fill(user.password);
  await page.getByRole("button", { name: LOGIN_BUTTON, exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("button", { name: user.displayName })).toBeVisible();
}

export async function openProfileMenu(page: Page, displayName: string): Promise<void> {
  await page.getByRole("button", { name: displayName }).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

export async function listAccountsViaApi(
  request: APIRequestContext,
  accessToken: string,
): Promise<AccountSummaryJson[]> {
  const response = await request.get(`${API_BASE_URL}/api/v1/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok()) {
    throw new Error(
      `Reading the accounts through the API failed with status ${response.status()}: ${await response.text()}`,
    );
  }

  const body = (await response.json()) as { accounts: AccountSummaryJson[] };

  return body.accounts;
}

export async function createAccountViaApi(
  request: APIRequestContext,
  accessToken: string,
  name: string,
): Promise<AccountSummaryJson> {
  const response = await request.post(`${API_BASE_URL}/api/v1/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { name },
  });

  if (!response.ok()) {
    throw new Error(
      `Creating the account through the API failed with status ${response.status()}: ${await response.text()}`,
    );
  }

  const body = (await response.json()) as { account: AccountSummaryJson };

  return body.account;
}

export async function depositViaApi(
  request: APIRequestContext,
  accessToken: string,
  accountId: string,
  amount: string,
): Promise<void> {
  const response = await request.post(`${API_BASE_URL}/api/v1/accounts/${accountId}/deposits`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { amount },
  });

  if (!response.ok()) {
    throw new Error(
      `The deposit through the API failed with status ${response.status()}: ${await response.text()}`,
    );
  }
}

export function readStorage(page: Page, key: string): Promise<string | null> {
  return page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key);
}

export async function readStoredSettings(page: Page): Promise<Record<string, unknown>> {
  const raw = await readStorage(page, SETTINGS_STORAGE_KEY);

  if (raw === null) return {};

  return JSON.parse(raw) as Record<string, unknown>;
}

export function readHuCatalog(namespace: string): Record<string, string> {
  const file = path.join(huLocalesDirectory, `${namespace}.json`);

  return JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;
}

export function huString(namespace: string, key: string): string {
  const value = readHuCatalog(namespace)[key];

  if (value === undefined) {
    throw new Error(`The key ${key} is missing from the translated ${namespace} catalog.`);
  }

  return value;
}
