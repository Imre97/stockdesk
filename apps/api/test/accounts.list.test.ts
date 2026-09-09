import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { truncateAll } from "./db.js";
import {
  authHeader,
  createAccount,
  expectLedgerInvariant,
  expectNoMonetaryNumbers,
  firstOf,
  listAccounts,
  registerUser,
  type AccountSummaryBody,
} from "./helpers.js";

const app = createApp({ rateLimit: { enabled: false } });

describe("GET /api/v1/accounts", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("rejects an unauthenticated request", async () => {
    const response = await request(app).get("/api/v1/accounts");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("returns the funded Main account created at registration", async () => {
    const registered = await registerUser(app);

    const response = await request(app).get("/api/v1/accounts").set(authHeader(registered.accessToken));

    expect(response.status).toBe(200);

    const accounts = (response.body as { accounts: AccountSummaryBody[] }).accounts;
    expect(accounts).toHaveLength(1);

    const account = firstOf(accounts, "account");
    expect(account.name).toBe("Main");
    expect(account.cash).toBe("100000.00");
    expect(account.positionsValue).toBe("0.00");
    expect(account.equity).toBe("100000.00");
    expect(account.unrealizedPnl).toBe("0.00");
    expect(account.unrealizedPnlPct).toBe("0.00");
    expect(account.dailyPnl).toBe("0.00");
    expect(account.dailyPnlPct).toBe("0.00");
    expect(account.longValue).toBe("0.00");
    expect(account.shortValue).toBe("0.00");
    expect(account.shortMargin).toBe("0.00");
    expect(account.reservedCash).toBe("0.00");
    expect(account.buyingPower).toBe("100000.00");
    expect(account.marginDeficit).toBe(false);
    expect(typeof account.createdAt).toBe("string");
  });

  it("creates default settings pointing at the Main account", async () => {
    const registered = await registerUser(app);
    const account = firstOf(await listAccounts(app, registered.accessToken), "account");

    const response = await request(app).get("/api/v1/settings").set(authHeader(registered.accessToken));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      settings: { language: "en", theme: "system", defaultAccountId: account.id },
    });
  });

  it("records exactly one initial DEPOSIT transaction of 100000.00", async () => {
    const registered = await registerUser(app);
    const account = firstOf(await listAccounts(app, registered.accessToken), "account");

    const rows = await prisma.cashTransaction.findMany({ where: { accountId: account.id } });

    expect(rows).toHaveLength(1);
    const row = firstOf(rows, "transaction");
    expect(row.type).toBe("DEPOSIT");
    expect(row.amount.toString()).toBe("100000");
    expect(row.balanceAfter.toString()).toBe("100000");
    expect(row.note).toBe("initial funding");
    await expectLedgerInvariant(account.id);
  });

  it("writes one equity snapshot for the funded account at registration", async () => {
    const registered = await registerUser(app);
    const account = firstOf(await listAccounts(app, registered.accessToken), "account");

    const snapshots = await prisma.accountEquitySnapshot.findMany({ where: { accountId: account.id } });

    expect(snapshots).toHaveLength(1);
    expect(firstOf(snapshots, "snapshot").equity.toString()).toBe("100000");
  });

  it("returns only the accounts of the caller, ordered by creation time", async () => {
    const owner = await registerUser(app);
    const other = await registerUser(app);

    expect((await createAccount(app, owner.accessToken, "Savings")).status).toBe(201);
    expect((await createAccount(app, other.accessToken, "Foreign")).status).toBe(201);

    const accounts = await listAccounts(app, owner.accessToken);

    expect(accounts.map((account) => account.name)).toEqual(["Main", "Savings"]);
  });

  it("sends every monetary field as a string", async () => {
    const registered = await registerUser(app);

    const response = await request(app).get("/api/v1/accounts").set(authHeader(registered.accessToken));

    expectNoMonetaryNumbers(response.body);
  });
});
