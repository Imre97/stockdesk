import { expect, test, type Page } from "@playwright/test";
import { WRONG_PASSWORD, makeTestUser, openProfileMenu, registerViaApi, type TestUser } from "./helpers";

const EMAIL_LABEL = "Email";
const PASSWORD_LABEL = "Password";
const DISPLAY_NAME_LABEL = "Display name";
const REGISTER_BUTTON = "Create an account";
const LOGIN_BUTTON = "Sign in";
const LOGOUT_ITEM = "Sign out";

const REFRESH_COOKIE_NAME = "refreshToken";
const REFRESH_COOKIE_PATH = "/api/v1/auth";

const LOGIN_URL = /\/login$/;
const REGISTER_URL = /\/register$/;

async function submitRegisterForm(page: Page, user: TestUser): Promise<void> {
  await page.getByLabel(DISPLAY_NAME_LABEL, { exact: true }).fill(user.displayName);
  await page.getByLabel(EMAIL_LABEL, { exact: true }).fill(user.email);
  await page.getByLabel(PASSWORD_LABEL, { exact: true }).fill(user.password);
  await page.getByRole("button", { name: REGISTER_BUTTON, exact: true }).click();
}

async function submitLoginForm(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel(EMAIL_LABEL, { exact: true }).fill(email);
  await page.getByLabel(PASSWORD_LABEL, { exact: true }).fill(password);
  await page.getByRole("button", { name: LOGIN_BUTTON, exact: true }).click();
}

async function loginThroughUi(page: Page, user: TestUser): Promise<void> {
  await page.goto("/login");
  await submitLoginForm(page, user.email, user.password);
  await expect(page).toHaveURL("/");
}

test("registers a new user and lands on the dashboard", async ({ page }) => {
  const user = makeTestUser();

  await page.goto("/register");
  await submitRegisterForm(page, user);

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("button", { name: user.displayName })).toBeVisible();
});

test("rejects a duplicate email", async ({ page, request }) => {
  const user = makeTestUser();
  await registerViaApi(request, user);

  await page.goto("/register");
  await submitRegisterForm(page, user);

  const alert = page.getByRole("alert").first();
  await expect(alert).toBeVisible();
  await expect(alert).not.toBeEmpty();
  await expect(page).toHaveURL(REGISTER_URL);
});

test("logs in with valid credentials and rejects wrong password", async ({ page, request }) => {
  const user = makeTestUser();
  await registerViaApi(request, user);

  await page.goto("/login");
  await submitLoginForm(page, user.email, WRONG_PASSWORD);

  const alert = page.getByRole("alert").first();
  await expect(alert).toBeVisible();
  await expect(alert).not.toBeEmpty();
  await expect(page).toHaveURL(LOGIN_URL);

  await submitLoginForm(page, user.email, user.password);
  await expect(page).toHaveURL("/");
});

test("keeps the session across a full page reload through silent refresh", async ({ page, request }) => {
  const user = makeTestUser();
  await registerViaApi(request, user);
  await loginThroughUi(page, user);

  await page.reload();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("button", { name: user.displayName })).toBeVisible();

  const cookies = await page.context().cookies();
  const refreshCookie = cookies.find((cookie) => cookie.name === REFRESH_COOKIE_NAME);

  expect(refreshCookie).toBeDefined();
  expect(refreshCookie?.httpOnly).toBe(true);
  expect(refreshCookie?.sameSite).toBe("Strict");
  expect(refreshCookie?.path).toBe(REFRESH_COOKIE_PATH);
});

test("redirects an anonymous visitor from a protected page to /login", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(LOGIN_URL);
});

test("logs out and cannot silently refresh afterwards", async ({ page, request }) => {
  const user = makeTestUser();
  await registerViaApi(request, user);
  await loginThroughUi(page, user);

  await openProfileMenu(page, user.displayName);
  await page.getByRole("menuitem", { name: LOGOUT_ITEM, exact: true }).click();
  await expect(page).toHaveURL(LOGIN_URL);

  await page.goto("/");
  await expect(page).toHaveURL(LOGIN_URL);
});
