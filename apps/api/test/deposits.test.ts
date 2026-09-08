import { Decimal, toApiString, type ServerMessage } from "@stockdesk/shared";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { truncateAll } from "./db.js";
import {
  deposit,
  expectLedgerInvariant,
  expectNoMonetaryNumbers,
  firstOf,
  mainAccount,
  registerUser,
  type AccountSummaryBody,
  type CashTransactionBody,
} from "./helpers.js";

interface Broadcast {
  userId: string;
  message: ServerMessage;
}

const broadcasts: Broadcast[] = [];

const app = createApp({
  rateLimit: { enabled: false },
  deps: {
    broadcast: (userId: string, message: ServerMessage) => {
      broadcasts.push({ userId, message });
    },
  },
});

describe("POST /api/v1/accounts/:id/deposits", () => {
  beforeEach(async () => {
    await truncateAll();
    broadcasts.length = 0;
  });

  it("credits the account, writes the ledger row and broadcasts the summary", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);
    broadcasts.length = 0;

    const response = await deposit(app, registered.accessToken, account.id, "5000.00", "  salary  ");

    expect(response.status).toBe(201);

    const body = response.body as { account: AccountSummaryBody; transaction: CashTransactionBody };
    expect(body.account.cash).toBe("105000.00");
    expect(body.account.equity).toBe("105000.00");
    expect(body.transaction.type).toBe("DEPOSIT");
    expect(body.transaction.amount).toBe("5000.00");
    expect(body.transaction.balanceAfter).toBe("105000.00");
    expect(body.transaction.note).toBe("salary");
    expect(body.transaction.referenceId).toBeNull();
    expectNoMonetaryNumbers(response.body);

    const rows = await prisma.cashTransaction.findMany({ where: { accountId: account.id } });
    expect(rows).toHaveLength(2);
    await expectLedgerInvariant(account.id);

    const owned = broadcasts.filter((entry) => entry.userId === registered.user.id);
    expect(owned.length).toBeGreaterThanOrEqual(1);
    const last = owned[owned.length - 1];
    expect(last?.message.type).toBe("account_summary");
  });

  it("keeps the ledger consistent under two concurrent deposits", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    const [first, second] = await Promise.all([
      deposit(app, registered.accessToken, account.id, "5000.00"),
      deposit(app, registered.accessToken, account.id, "5000.00"),
    ]);

    expect([first.status, second.status]).toEqual([201, 201]);

    const stored = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
    expect(new Decimal(stored.cashBalance.toString()).equals("110000.00")).toBe(true);

    const rows = await prisma.cashTransaction.findMany({
      where: { accountId: account.id, note: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => toApiString(row.balanceAfter.toString(), 2)).sort()).toEqual([
      "105000.00",
      "110000.00",
    ]);

    await expectLedgerInvariant(account.id);
  });

  it("rejects an amount of zero", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    const response = await deposit(app, registered.accessToken, account.id, "0");

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    await expectLedgerInvariant(account.id);
  });

  it("rejects a negative amount", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    const response = await deposit(app, registered.accessToken, account.id, "-1");

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("rejects more than two decimal places", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    const response = await deposit(app, registered.accessToken, account.id, "1.234");

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("rejects an amount that is not a decimal string", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    const response = await request(app)
      .post(`/api/v1/accounts/${account.id}/deposits`)
      .set("Authorization", `Bearer ${registered.accessToken}`)
      .send({ amount: 5000 });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("rejects an amount above the deposit limit with DEPOSIT_LIMIT_EXCEEDED", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    const response = await deposit(app, registered.accessToken, account.id, "1000000.01");

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: "DEPOSIT_LIMIT_EXCEEDED" } });
    await expectLedgerInvariant(account.id);
  });

  it("accepts an amount exactly at the deposit limit", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    const response = await deposit(app, registered.accessToken, account.id, "1000000.00");

    expect(response.status).toBe(201);
    await expectLedgerInvariant(account.id);
  });

  it("rejects a note longer than 200 characters", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    const response = await deposit(app, registered.accessToken, account.id, "10.00", "x".repeat(201));

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("returns 404 for an account of another user without moving cash", async () => {
    const owner = await registerUser(app);
    const intruder = await registerUser(app);
    const account = await mainAccount(app, owner.accessToken);

    const response = await deposit(app, intruder.accessToken, account.id, "5000.00");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: "ACCOUNT_NOT_FOUND" } });

    const stored = firstOf(await prisma.account.findMany({ where: { id: account.id } }), "account");
    expect(new Decimal(stored.cashBalance.toString()).equals("100000.00")).toBe(true);
    await expectLedgerInvariant(account.id);
  });
});
