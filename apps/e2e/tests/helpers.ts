import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

export const API_BASE_URL = "http://localhost:3000";
export const TEST_PASSWORD = "Password123!";
export const WRONG_PASSWORD = "WrongPassword123!";

export const MAIN_ACCOUNT_NAME = "Main";
export const SIDEBAR_STORAGE_KEY = "stockdesk.sidebarCollapsed";
export const SETTINGS_STORAGE_KEY = "stockdesk.settings";

const EMAIL_LABEL = "Email";
const PASSWORD_LABEL = "Password";
const DISPLAY_NAME_LABEL = "Display name";
const LOGIN_BUTTON = "Sign in";
const REGISTER_BUTTON = "Create an account";
const REGISTER_LINK = "Create an account";
const LOGOUT_ITEM = "Sign out";
const DASHBOARD_URL = "/";
const LOGIN_URL = /\/login$/;

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

export function makeTestUser(displayName = "E2E Trader"): TestUser {
  return { email: uniqueEmail(), password: TEST_PASSWORD, displayName };
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

export async function registerViaUi(page: Page, user: TestUser): Promise<void> {
  await page.getByLabel(DISPLAY_NAME_LABEL, { exact: true }).fill(user.displayName);
  await page.getByLabel(EMAIL_LABEL, { exact: true }).fill(user.email);
  await page.getByLabel(PASSWORD_LABEL, { exact: true }).fill(user.password);
  await page.getByRole("button", { name: REGISTER_BUTTON, exact: true }).click();
  await expect(page).toHaveURL(DASHBOARD_URL);
  await expect(page.getByRole("button", { name: user.displayName })).toBeVisible();
}

export async function goToRegisterFromLogin(page: Page): Promise<void> {
  await page.getByRole("link", { name: REGISTER_LINK, exact: true }).click();
  await expect(page.getByRole("button", { name: REGISTER_BUTTON, exact: true })).toBeVisible();
}

export async function logoutViaUi(page: Page, displayName: string): Promise<void> {
  await openProfileMenu(page, displayName);
  await page.getByRole("menuitem", { name: LOGOUT_ITEM, exact: true }).click();
  await expect(page).toHaveURL(LOGIN_URL);
}

export function headerSearchInput(page: Page): Locator {
  return page.getByRole("banner").getByRole("combobox");
}

export function headerSearchListbox(page: Page): Locator {
  return page.getByRole("banner").getByRole("listbox");
}

export function searchOption(listbox: Locator, symbol: string): Locator {
  return listbox.getByRole("option").filter({ hasText: symbol });
}

export async function openHeaderSearch(page: Page): Promise<Locator> {
  const input = headerSearchInput(page);

  await input.blur();
  await input.click();

  const listbox = headerSearchListbox(page);
  await expect(listbox).toBeVisible();

  return listbox;
}

export async function searchTicker(page: Page, text: string): Promise<Locator> {
  const input = headerSearchInput(page);

  await input.click();
  await input.fill(text);

  const listbox = headerSearchListbox(page);
  await expect(listbox).toBeVisible();

  return listbox;
}

export async function pickTickerFromHeaderSearch(page: Page, text: string, symbol: string): Promise<void> {
  const listbox = await searchTicker(page, text);

  await expect(searchOption(listbox, symbol).first()).toBeVisible();
  await headerSearchInput(page).press("ArrowDown");
  await headerSearchInput(page).press("Enter");
  await expect(page).toHaveURL(`/symbols/${symbol}`);
}

export async function openSymbolPage(page: Page, symbol: string): Promise<void> {
  await page.goto(`/symbols/${symbol}`);
  await expect(page.getByRole("heading", { level: 1, name: symbol.toUpperCase(), exact: true })).toBeVisible();
}

export function keyStatValue(page: Page, label: string): Locator {
  return page.locator(`dt:text-is("${label}") + dd`);
}

export function sidebarAccountNames(page: Page): Promise<string[]> {
  return page.getByRole("complementary").getByRole("button").allInnerTexts();
}
