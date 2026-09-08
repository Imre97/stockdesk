import { expect, test } from "@playwright/test";
import {
  huString,
  loginViaUi,
  makeTestUser,
  openProfileMenu,
  readStoredSettings,
  registerViaApi,
} from "./helpers";

const PORTFOLIO_TAB = "Portfolio";
const HUNGARIAN_OPTION = "Hungarian";
const DARK_OPTION = "Dark";
const LANGUAGE_LABEL = "Language";
const THEME_LABEL = "Theme";
const DARK_CLASS = /dark/;

const NAV_PORTFOLIO_KEY = "nav.portfolio";
const SHELL_NAMESPACE = "shell";
const SETTINGS_NAMESPACE = "settings";
const SAVE_KEY = "save";

test("switches every visible string when the profile menu language changes", async ({ page, request }) => {
  const user = makeTestUser();
  await registerViaApi(request, user);
  await loginViaUi(page, user);

  const translatedPortfolio = huString(SHELL_NAMESPACE, NAV_PORTFOLIO_KEY);

  await expect(page.getByRole("link", { name: PORTFOLIO_TAB, exact: true })).toBeVisible();

  await openProfileMenu(page, user.displayName);
  await page.getByRole("menuitemradio", { name: HUNGARIAN_OPTION, exact: true }).click();

  await expect(page.getByRole("link", { name: translatedPortfolio, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: PORTFOLIO_TAB, exact: true })).toHaveCount(0);
  expect(await readStoredSettings(page)).toMatchObject({ language: "hu" });
});

test("applies the dark theme picked in the profile menu", async ({ page, request }) => {
  const user = makeTestUser();
  await registerViaApi(request, user);
  await loginViaUi(page, user);

  await openProfileMenu(page, user.displayName);
  await page.getByRole("menuitemradio", { name: DARK_OPTION, exact: true }).click();

  await expect(page.locator("html")).toHaveClass(DARK_CLASS);
  expect(await readStoredSettings(page)).toMatchObject({ theme: "dark" });
});

test("keeps the saved language and dark theme after a reload without a flash", async ({ page, request }) => {
  const user = makeTestUser();
  await registerViaApi(request, user);
  await loginViaUi(page, user);
  await page.goto("/settings");

  await page.getByLabel(THEME_LABEL, { exact: true }).click();
  await page.getByRole("option", { name: DARK_OPTION, exact: true }).click();
  await expect(page.locator("html")).toHaveClass(DARK_CLASS);

  await page.getByLabel(LANGUAGE_LABEL, { exact: true }).click();
  await page.getByRole("option", { name: HUNGARIAN_OPTION, exact: true }).click();

  const translatedPortfolio = huString(SHELL_NAMESPACE, NAV_PORTFOLIO_KEY);
  const translatedSave = huString(SETTINGS_NAMESPACE, SAVE_KEY);

  await expect(page.getByRole("link", { name: translatedPortfolio, exact: true })).toBeVisible();
  await page.getByRole("button", { name: translatedSave, exact: true }).click();

  await page.goto("/", { waitUntil: "domcontentloaded" });

  expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);

  await expect(page.getByRole("link", { name: translatedPortfolio, exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(DARK_CLASS);
  expect(await readStoredSettings(page)).toMatchObject({ language: "hu", theme: "dark" });
});

test("keeps a profile menu language switch after a reload", async ({ page, request }) => {
  const user = makeTestUser();
  await registerViaApi(request, user);
  await loginViaUi(page, user);

  await openProfileMenu(page, user.displayName);
  await page.getByRole("menuitemradio", { name: HUNGARIAN_OPTION, exact: true }).click();

  const translatedPortfolio = huString(SHELL_NAMESPACE, NAV_PORTFOLIO_KEY);

  await expect(page.getByRole("link", { name: translatedPortfolio, exact: true })).toBeVisible();

  await page.reload();

  await expect(page.getByRole("link", { name: translatedPortfolio, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: PORTFOLIO_TAB, exact: true })).toHaveCount(0);
  expect(await readStoredSettings(page)).toMatchObject({ language: "hu" });
});

test("keeps a profile menu theme switch after a reload", async ({ page, request }) => {
  const user = makeTestUser();
  await registerViaApi(request, user);
  await loginViaUi(page, user);

  await openProfileMenu(page, user.displayName);
  await page.getByRole("menuitemradio", { name: DARK_OPTION, exact: true }).click();

  await expect(page.locator("html")).toHaveClass(DARK_CLASS);

  await page.goto("/", { waitUntil: "domcontentloaded" });

  expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);

  await expect(page.locator("html")).toHaveClass(DARK_CLASS);
  expect(await readStoredSettings(page)).toMatchObject({ theme: "dark" });
});
