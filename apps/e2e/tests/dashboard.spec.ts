import { expect, test } from "@playwright/test";
import {
  MAIN_ACCOUNT_NAME,
  SIDEBAR_STORAGE_KEY,
  loginViaUi,
  makeTestUser,
  readStorage,
  registerViaApi,
} from "./helpers";

const COLLAPSE_SIDEBAR = "Collapse sidebar";
const EXPAND_SIDEBAR = "Expand sidebar";
const OPEN_NAVIGATION = "Open the navigation";
const CLOSE_NAVIGATION = "Close the navigation";
const ACCOUNTS_RAIL = "Accounts";
const NEW_ACCOUNT_BUTTON = "New account";
const ACCOUNT_NAME_LABEL = "Account name";
const CREATE_ACCOUNT_BUTTON = "Create account";
const SECOND_ACCOUNT_NAME = "Savings";
const POSITIONS_EMPTY = "No open positions on this account.";

const DRAWER_VIEWPORT = { width: 800, height: 900 };

const TABS = [
  { name: "Portfolio", url: "/" },
  { name: "Reports", url: "/reports" },
  { name: "Deposit", url: "/deposit" },
] as const;

test("switches between the navigation tabs while the sidebar stays visible", async ({ page, request }) => {
  const user = makeTestUser();
  await registerViaApi(request, user);
  await loginViaUi(page, user);

  for (const tab of TABS) {
    const link = page.getByRole("link", { name: tab.name, exact: true });

    await expect(link).toBeVisible();
    await link.click();

    await expect(page).toHaveURL(tab.url);
    await expect(link).toHaveAttribute("data-status", "active");
    await expect(page.getByRole("complementary")).toBeVisible();
  }
});

test("remembers the collapsed sidebar across a reload", async ({ page, request }) => {
  const user = makeTestUser();
  await registerViaApi(request, user);
  await loginViaUi(page, user);

  await page.getByRole("button", { name: COLLAPSE_SIDEBAR, exact: true }).click();

  await expect(page.getByRole("button", { name: EXPAND_SIDEBAR, exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: ACCOUNTS_RAIL, exact: true })).toBeVisible();
  expect(await readStorage(page, SIDEBAR_STORAGE_KEY)).toBe("true");

  await page.reload();

  await expect(page.getByRole("button", { name: EXPAND_SIDEBAR, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: COLLAPSE_SIDEBAR, exact: true })).toHaveCount(0);
  await expect(page.getByRole("list", { name: ACCOUNTS_RAIL, exact: true })).toBeVisible();
  expect(await readStorage(page, SIDEBAR_STORAGE_KEY)).toBe("true");
});

test("hides the sidebar below the large breakpoint until the drawer is opened", async ({ page, request }) => {
  const user = makeTestUser();
  await registerViaApi(request, user);
  await loginViaUi(page, user);

  await page.setViewportSize(DRAWER_VIEWPORT);

  const sidebarRow = page.getByRole("button", { name: MAIN_ACCOUNT_NAME, exact: true });

  await expect(page.getByRole("complementary")).toBeHidden();
  await expect(sidebarRow).toBeHidden();

  await page.getByRole("button", { name: OPEN_NAVIGATION, exact: true }).click();

  await expect(page.getByRole("button", { name: CLOSE_NAVIGATION, exact: true }).first()).toBeVisible();
  await expect(sidebarRow).toBeVisible();
});

test("switches the dashboard to the account selected in the sidebar", async ({ page, request }) => {
  const user = makeTestUser();
  await registerViaApi(request, user);
  await loginViaUi(page, user);

  await page.getByRole("button", { name: NEW_ACCOUNT_BUTTON, exact: true }).click();
  await page.getByLabel(ACCOUNT_NAME_LABEL, { exact: true }).fill(SECOND_ACCOUNT_NAME);
  await page.getByRole("button", { name: CREATE_ACCOUNT_BUTTON, exact: true }).click();

  const sidebar = page.getByRole("complementary");
  const oneDay = page.getByRole("button", { name: "1D", exact: true });
  const oneWeek = page.getByRole("button", { name: "1W", exact: true });

  await expect(sidebar.getByRole("button", { name: SECOND_ACCOUNT_NAME, exact: true })).toBeVisible();

  await sidebar.getByRole("button", { name: MAIN_ACCOUNT_NAME, exact: true }).click();
  await expect(page.getByRole("heading", { name: MAIN_ACCOUNT_NAME, exact: true })).toBeVisible();

  await sidebar.getByRole("button", { name: SECOND_ACCOUNT_NAME, exact: true }).click();
  await expect(page.getByRole("heading", { name: SECOND_ACCOUNT_NAME, exact: true })).toBeVisible();
  await expect(page.getByText(POSITIONS_EMPTY)).toBeVisible();
  await expect(oneDay).toHaveAttribute("aria-pressed", "true");

  await oneWeek.click();

  await expect(oneWeek).toHaveAttribute("aria-pressed", "true");
  await expect(oneDay).toHaveAttribute("aria-pressed", "false");
});
