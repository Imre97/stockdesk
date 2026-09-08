import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  goToRegisterFromLogin,
  headerSearchInput,
  headerSearchListbox,
  huString,
  keyStatValue,
  loginViaUi,
  logoutViaUi,
  makeTestUser,
  openHeaderSearch,
  openProfileMenu,
  openSymbolPage,
  pickTickerFromHeaderSearch,
  readStorage,
  registerViaApi,
  registerViaUi,
  searchOption,
  searchTicker,
  sidebarAccountNames,
} from "./helpers";

const TESLA_SYMBOL = "TSLA";
const TESLA_NAME = "Tesla, Inc.";
const TESLA_EXCHANGE = "NASDAQ";
const APPLE_SYMBOL = "AAPL";
const APPLE_NAME = "Apple Inc.";
const MICROSOFT_SYMBOL = "MSFT";
const UNKNOWN_SYMBOL = "XXXX";

const NO_RESULTS = "No symbol matches this search.";
const RECENT_HEADING = "Recent symbols";
const NOT_FOUND_TITLE = "Symbol not found";
const NOT_FOUND_BODY = "No active symbol matches this ticker. Search for another one.";
const KEY_STATS_TITLE = "Key stats";
const MISSING_VALUE = "No data";
const PREV_CLOSE_LABEL = "Prev close";
const MARKET_CAP_LABEL = "Market cap";
const PE_RATIO_LABEL = "P/E";
const POSITION_TAB = "Position";
const TRADES_TAB = "Trade history";
const POSITION_EMPTY = "No position in this symbol on the active account.";
const TRADES_EMPTY = "No trades in this symbol on the active account.";
const INTERVAL_GROUP = "Interval";
const CHART_TYPE_GROUP = "Chart type";
const CANDLE_TOGGLE = "Candles";
const LINE_TOGGLE = "Line";
const BUY_BUTTON = "Buy";
const SELL_BUTTON = "Sell";
const ORDER_SLOT = "New order";
const BACK_TO_STATS = "Back to key stats";
const NEW_ACCOUNT_BUTTON = "New account";
const ACCOUNT_NAME_LABEL = "Account name";
const CREATE_ACCOUNT_BUTTON = "Create account";
const PORTFOLIO_TAB = "Portfolio";
const HUNGARIAN_OPTION = "Hungarian";

const PRICE_TEXT = /^\$[\d,]+\.\d{2}$/;
const RECENT_SYMBOLS_STORAGE_KEY = "recentSymbols";
const AUTH_NAMESPACE = "auth";
const LOGIN_TITLE_KEY = "login.title";
const LOGIN_URL = /\/login$/;

const DEFAULT_INTERVAL = "1D";
const FIVE_MINUTE_INTERVAL = "5m";

function intervalButton(page: Page, interval: string): Locator {
  return page.getByRole("group", { name: INTERVAL_GROUP, exact: true }).getByRole("button", {
    name: interval,
    exact: true,
  });
}

function chartTypeButton(page: Page, chartType: string): Locator {
  return page.getByRole("group", { name: CHART_TYPE_GROUP, exact: true }).getByRole("button", {
    name: chartType,
    exact: true,
  });
}

function notFoundSearchInput(page: Page): Locator {
  return page.getByRole("main").getByRole("combobox");
}

test("finds a symbol from the header search and opens its page", async ({ page, request }) => {
  const user = makeTestUser();
  await registerViaApi(request, user);
  await loginViaUi(page, user);

  const listbox = await searchTicker(page, "tsl");
  const teslaOption = searchOption(listbox, TESLA_SYMBOL).first();

  await expect(teslaOption).toBeVisible();
  await expect(teslaOption).toContainText(TESLA_NAME);

  await headerSearchInput(page).press("ArrowDown");
  await headerSearchInput(page).press("Enter");

  await expect(page).toHaveURL(`/symbols/${TESLA_SYMBOL}`);
  await expect(page.getByRole("heading", { level: 1, name: TESLA_SYMBOL, exact: true })).toBeVisible();

  const recentListbox = await openHeaderSearch(page);
  const recentTesla = searchOption(recentListbox, TESLA_SYMBOL).first();

  await expect(recentListbox).toContainText(RECENT_HEADING);
  await expect(recentTesla).toContainText(TESLA_NAME);
  await expect(recentTesla).toContainText(TESLA_EXCHANGE);
});

test("shows a no-results row and closes the header search on Escape", async ({ page, request }) => {
  const user = makeTestUser();
  await registerViaApi(request, user);
  await loginViaUi(page, user);

  const listbox = await searchTicker(page, "zzzz");

  await expect(listbox).toContainText(NO_RESULTS);
  await expect(listbox.getByRole("option")).toHaveCount(0);

  await headerSearchInput(page).press("Escape");

  await expect(headerSearchListbox(page)).toHaveCount(0);
});

test("renders the symbol page header, chart, key stats and empty panels", async ({ page, request }) => {
  const user = makeTestUser();
  await registerViaApi(request, user);
  await loginViaUi(page, user);
  await openSymbolPage(page, APPLE_SYMBOL);

  await expect(page.getByRole("main").getByText(APPLE_NAME, { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("symbol-price")).toHaveText(PRICE_TEXT);

  await expect(page.getByTestId("price-chart").locator("canvas").first()).toBeVisible();

  await expect(intervalButton(page, DEFAULT_INTERVAL)).toHaveAttribute("aria-pressed", "true");

  for (const label of [PREV_CLOSE_LABEL, MARKET_CAP_LABEL, PE_RATIO_LABEL]) {
    const value = keyStatValue(page, label);

    await expect(value).toBeVisible();
    await expect(value).not.toBeEmpty();
    await expect(value).not.toHaveText(MISSING_VALUE);
  }

  await expect(page.getByText(POSITION_EMPTY)).toBeVisible();

  await page.getByRole("tab", { name: TRADES_TAB, exact: true }).click();

  await expect(page.getByText(TRADES_EMPTY)).toBeVisible();

  await page.getByRole("tab", { name: POSITION_TAB, exact: true }).click();

  await expect(page.getByText(POSITION_EMPTY)).toBeVisible();
});

test("reloads the bars when the interval changes and keeps the chart type after a reload", async ({
  page,
  request,
}) => {
  const user = makeTestUser();
  await registerViaApi(request, user);
  await loginViaUi(page, user);
  await openSymbolPage(page, APPLE_SYMBOL);

  await expect(intervalButton(page, DEFAULT_INTERVAL)).toHaveAttribute("aria-pressed", "true");

  const barsResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/market/symbols/${APPLE_SYMBOL}/bars`) &&
      response.url().includes(`timeframe=${FIVE_MINUTE_INTERVAL}`) &&
      response.status() === 200,
  );

  await intervalButton(page, FIVE_MINUTE_INTERVAL).click();
  await barsResponse;

  await expect(intervalButton(page, FIVE_MINUTE_INTERVAL)).toHaveAttribute("aria-pressed", "true");
  await expect(intervalButton(page, DEFAULT_INTERVAL)).toHaveAttribute("aria-pressed", "false");

  await chartTypeButton(page, LINE_TOGGLE).click();

  await expect(chartTypeButton(page, LINE_TOGGLE)).toHaveAttribute("aria-pressed", "true");

  await page.reload();

  await expect(chartTypeButton(page, LINE_TOGGLE)).toHaveAttribute("aria-pressed", "true");
  await expect(chartTypeButton(page, CANDLE_TOGGLE)).toHaveAttribute("aria-pressed", "false");
  await expect(intervalButton(page, FIVE_MINUTE_INTERVAL)).toHaveAttribute("aria-pressed", "true");
});

test("swaps the key stats for the order slot when Buy or Sell is pressed", async ({ page, request }) => {
  const user = makeTestUser();
  await registerViaApi(request, user);
  await loginViaUi(page, user);
  await openSymbolPage(page, APPLE_SYMBOL);

  const keyStats = page.getByRole("heading", { name: KEY_STATS_TITLE, exact: true });
  const orderSlot = page.getByRole("region", { name: ORDER_SLOT, exact: true });

  await expect(keyStats).toBeVisible();

  await page.getByRole("button", { name: BUY_BUTTON, exact: true }).click();

  await expect(orderSlot).toBeVisible();
  await expect(orderSlot.getByText(BUY_BUTTON, { exact: true })).toBeVisible();
  await expect(orderSlot).toContainText(APPLE_SYMBOL);
  await expect(keyStats).toHaveCount(0);

  await page.getByRole("button", { name: BACK_TO_STATS, exact: true }).click();

  await expect(keyStats).toBeVisible();
  await expect(orderSlot).toHaveCount(0);

  await page.getByRole("button", { name: SELL_BUTTON, exact: true }).click();

  await expect(orderSlot).toBeVisible();
  await expect(orderSlot.getByText(SELL_BUTTON, { exact: true })).toBeVisible();
});

test("renders the not-found state for an unknown symbol and searches from it", async ({ page, request }) => {
  const user = makeTestUser();
  await registerViaApi(request, user);
  await loginViaUi(page, user);

  await page.goto(`/symbols/${UNKNOWN_SYMBOL}`);

  await expect(page.getByRole("heading", { name: NOT_FOUND_TITLE, exact: true })).toBeVisible();
  await expect(page.getByText(NOT_FOUND_BODY)).toBeVisible();

  const input = notFoundSearchInput(page);

  await expect(input).toBeVisible();
  await input.click();
  await input.fill("aap");

  const listbox = page.getByRole("main").getByRole("listbox");
  const appleOption = searchOption(listbox, APPLE_SYMBOL).first();

  await expect(appleOption).toBeVisible();
  await appleOption.click();

  await expect(page).toHaveURL(`/symbols/${APPLE_SYMBOL}`);
  await expect(page.getByRole("heading", { level: 1, name: APPLE_SYMBOL, exact: true })).toBeVisible();
});

test("upper-cases a lower-case symbol route", async ({ page, request }) => {
  const user = makeTestUser();
  await registerViaApi(request, user);
  await loginViaUi(page, user);

  await page.goto(`/symbols/${MICROSOFT_SYMBOL.toLowerCase()}`);

  await expect(page).toHaveURL(`/symbols/${MICROSOFT_SYMBOL}`);
  await expect(page.getByRole("heading", { level: 1, name: MICROSOFT_SYMBOL, exact: true })).toBeVisible();
});

test("leaves nothing of the first user behind when a second user signs up in the same tab", async ({
  page,
  request,
}) => {
  const first = makeTestUser("First Trader");
  const second = makeTestUser("Second Trader");
  const privateAccountName = `First private ${String(Date.now())}`;

  await registerViaApi(request, first);
  await loginViaUi(page, first);

  await page.getByRole("button", { name: NEW_ACCOUNT_BUTTON, exact: true }).click();
  await page.getByLabel(ACCOUNT_NAME_LABEL, { exact: true }).fill(privateAccountName);
  await page.getByRole("button", { name: CREATE_ACCOUNT_BUTTON, exact: true }).click();

  const sidebar = page.getByRole("complementary");

  await expect(sidebar.getByRole("button", { name: privateAccountName, exact: true })).toBeVisible();

  await pickTickerFromHeaderSearch(page, "tsl", TESLA_SYMBOL);

  await page.getByRole("link", { name: PORTFOLIO_TAB, exact: true }).click();
  await expect(page).toHaveURL("/");

  const firstAccountNames = await sidebarAccountNames(page);

  expect(firstAccountNames).toContain(privateAccountName);

  await logoutViaUi(page, first.displayName);
  await goToRegisterFromLogin(page);
  await registerViaUi(page, second);

  await expect(page.getByRole("button", { name: second.displayName })).toBeVisible();
  await expect(page.getByRole("button", { name: first.displayName })).toHaveCount(0);

  const recentListbox = await openHeaderSearch(page);

  await expect(recentListbox.getByRole("option")).toHaveCount(0);
  await expect(recentListbox).not.toContainText(TESLA_SYMBOL);
  expect(await readStorage(page, RECENT_SYMBOLS_STORAGE_KEY)).toBeNull();

  await headerSearchInput(page).press("Escape");

  await expect(sidebar.getByRole("button", { name: privateAccountName, exact: true })).toHaveCount(0);

  const secondAccountNames = await sidebarAccountNames(page);

  expect(secondAccountNames).not.toContain(privateAccountName);
});

test("keeps the chosen language on the login page after the session expires", async ({ page, request }) => {
  const user = makeTestUser();
  await registerViaApi(request, user);
  await loginViaUi(page, user);

  await openProfileMenu(page, user.displayName);
  await page.getByRole("menuitemradio", { name: HUNGARIAN_OPTION, exact: true }).click();

  const translatedPortfolio = huString("shell", "nav.portfolio");

  await expect(page.getByRole("link", { name: translatedPortfolio, exact: true })).toBeVisible();

  await page.context().clearCookies();
  await page.reload();

  await expect(page).toHaveURL(LOGIN_URL);
  await expect(
    page.getByRole("heading", { name: huString(AUTH_NAMESPACE, LOGIN_TITLE_KEY), exact: true }),
  ).toBeVisible();
});
