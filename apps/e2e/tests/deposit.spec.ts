import { expect, test, type Page } from "@playwright/test";
import {
  MAIN_ACCOUNT_NAME,
  createAccountViaApi,
  listAccountsViaApi,
  loginViaUi,
  makeTestUser,
  registerViaApi,
} from "./helpers";

const DEPOSIT_TAB = "Deposit";
const ACCOUNT_LABEL = "Account";
const AMOUNT_LABEL = "Amount";
const DEPOSIT_BUTTON = "Deposit";
const AMOUNT_ERROR = "Enter an amount greater than zero with at most two decimals.";

const SECOND_ACCOUNT_NAME = "Savings";
const INITIAL_EQUITY = /100,000\.00/;
const FUNDED_EQUITY = /105,000\.00/;
const SECOND_ACCOUNT_EQUITY = /250\.00/;
const DEPOSIT_AMOUNT_ROW = /\+\$?5,000\.00/;
const SECOND_DEPOSIT_ROW = /\+\$?250\.00/;

async function openDepositPage(page: Page): Promise<void> {
  await page.getByRole("link", { name: DEPOSIT_TAB, exact: true }).click();
  await expect(page).toHaveURL("/deposit");
}

async function chooseMainAccount(page: Page): Promise<void> {
  await page.getByLabel(ACCOUNT_LABEL, { exact: true }).click();
  await page.getByRole("option", { name: new RegExp(MAIN_ACCOUNT_NAME) }).click();
}

test("credits a deposit to the selected account without a reload", async ({ page, request }) => {
  const user = makeTestUser();
  const session = await registerViaApi(request, user);
  await loginViaUi(page, user);
  await openDepositPage(page);

  await chooseMainAccount(page);
  await page.getByLabel(AMOUNT_LABEL, { exact: true }).fill("5000");
  await page.getByRole("button", { name: DEPOSIT_BUTTON, exact: true }).click();

  await expect(page.getByRole("complementary").getByText(FUNDED_EQUITY)).toBeVisible();

  const newestRow = page.getByRole("row").nth(1);

  await expect(newestRow).toContainText("DEPOSIT");
  await expect(newestRow).toContainText(DEPOSIT_AMOUNT_ROW);

  const accounts = await listAccountsViaApi(request, session.accessToken);
  const main = accounts.find((account) => account.name === MAIN_ACCOUNT_NAME);

  expect(main?.cash).toBe("105000.00");
});

test("deposits into a non-active account and shows its ledger", async ({ page, request }) => {
  const user = makeTestUser();
  const session = await registerViaApi(request, user);
  await createAccountViaApi(request, session.accessToken, SECOND_ACCOUNT_NAME);
  await loginViaUi(page, user);

  const sidebar = page.getByRole("complementary");
  const mainRow = sidebar.getByRole("listitem").filter({
    has: page.getByRole("button", { name: MAIN_ACCOUNT_NAME, exact: true }),
  });
  const savingsRow = sidebar.getByRole("listitem").filter({
    has: page.getByRole("button", { name: SECOND_ACCOUNT_NAME, exact: true }),
  });

  await expect(sidebar.getByRole("button", { name: MAIN_ACCOUNT_NAME, exact: true })).toHaveAttribute(
    "aria-current",
    "true",
  );

  await openDepositPage(page);

  await page.getByLabel(ACCOUNT_LABEL, { exact: true }).click();
  await page.getByRole("option", { name: new RegExp(`^${SECOND_ACCOUNT_NAME}`) }).click();
  await page.getByLabel(AMOUNT_LABEL, { exact: true }).fill("250");
  await page.getByRole("button", { name: DEPOSIT_BUTTON, exact: true }).click();

  const newestRow = page.getByRole("row").nth(1);

  await expect(newestRow).toContainText("DEPOSIT");
  await expect(newestRow).toContainText(SECOND_DEPOSIT_ROW);

  await expect(savingsRow.getByText(SECOND_ACCOUNT_EQUITY)).toBeVisible();
  await expect(mainRow.getByText(INITIAL_EQUITY)).toBeVisible();
  await expect(sidebar.getByRole("button", { name: MAIN_ACCOUNT_NAME, exact: true })).toHaveAttribute(
    "aria-current",
    "true",
  );

  const accounts = await listAccountsViaApi(request, session.accessToken);

  expect(accounts.find((account) => account.name === SECOND_ACCOUNT_NAME)?.cash).toBe("250.00");
  expect(accounts.find((account) => account.name === MAIN_ACCOUNT_NAME)?.cash).toBe("100000.00");
});

test("rejects a zero amount and leaves the balance untouched", async ({ page, request }) => {
  const user = makeTestUser();
  const session = await registerViaApi(request, user);
  await loginViaUi(page, user);
  await openDepositPage(page);

  await chooseMainAccount(page);
  await page.getByLabel(AMOUNT_LABEL, { exact: true }).fill("0");
  await page.getByRole("button", { name: DEPOSIT_BUTTON, exact: true }).click();

  await expect(page.getByRole("alert").first()).toHaveText(AMOUNT_ERROR);
  await expect(page.getByRole("complementary").getByText(INITIAL_EQUITY)).toBeVisible();

  const accounts = await listAccountsViaApi(request, session.accessToken);
  const main = accounts.find((account) => account.name === MAIN_ACCOUNT_NAME);

  expect(main?.cash).toBe("100000.00");
});
