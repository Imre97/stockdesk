import { Decimal } from "@stockdesk/shared";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { truncateAll } from "./db.js";
import {
  DEFAULT_PASSWORD,
  expectNoMonetaryNumbers,
  findRefreshCookieHeader,
  firstOf,
  registerUser,
  uniqueEmail,
} from "./helpers.js";

const app = createApp({ rateLimit: { enabled: false } });

describe("POST /api/v1/auth/register", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("creates the user, funds the Main account and sets the refresh cookie", async () => {
    const email = uniqueEmail();

    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: email.toUpperCase(), password: DEFAULT_PASSWORD, displayName: "  Trader  " });

    expect(response.status).toBe(201);

    const body = response.body as {
      user: Record<string, unknown>;
      accessToken: unknown;
    };

    expect(body.user.email).toBe(email);
    expect(body.user.displayName).toBe("Trader");
    expect(typeof body.user.id).toBe("string");
    expect(typeof body.user.createdAt).toBe("string");
    expect(body.user).not.toHaveProperty("passwordHash");
    expect(typeof body.accessToken).toBe("string");
    expect((body.accessToken as string).length).toBeGreaterThan(0);

    const cookie = findRefreshCookieHeader(response);
    expect(cookie).toContain("refreshToken=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/api/v1/auth");

    const users = await prisma.user.findMany();
    expect(users).toHaveLength(1);
    const user = firstOf(users, "user");
    expect(user.email).toBe(email);
    expect(user.passwordHash).not.toBe(DEFAULT_PASSWORD);

    const accounts = await prisma.account.findMany();
    expect(accounts).toHaveLength(1);
    const account = firstOf(accounts, "account");
    expect(account.userId).toBe(user.id);
    expect(account.name).toBe("Main");
    expect(account.cashBalance.equals(new Decimal("100000"))).toBe(true);

    const transactions = await prisma.cashTransaction.findMany();
    expect(transactions).toHaveLength(1);
    const transaction = firstOf(transactions, "cash transaction");
    expect(transaction.accountId).toBe(account.id);
    expect(transaction.type).toBe("DEPOSIT");
    expect(transaction.amount.equals(new Decimal("100000"))).toBe(true);
    expect(transaction.balanceAfter.equals(new Decimal("100000"))).toBe(true);
    expect(transaction.note).toBe("initial funding");

    const settings = await prisma.userSettings.findMany();
    expect(settings).toHaveLength(1);
    const userSettings = firstOf(settings, "user settings row");
    expect(userSettings.userId).toBe(user.id);
    expect(userSettings.defaultAccountId).toBe(account.id);
  });

  it("rejects a duplicate email regardless of casing", async () => {
    const email = uniqueEmail();
    await registerUser(app, { email });

    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: email.toUpperCase(), password: DEFAULT_PASSWORD, displayName: "Other" });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: "EMAIL_TAKEN" } });
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it("rejects a password shorter than eight characters", async () => {
    const email = uniqueEmail("short");

    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({ email, password: "1234567", displayName: "Trader" });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it("rejects an invalid email", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "not-an-email", password: DEFAULT_PASSWORD, displayName: "Trader" });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("returns no monetary JSON numbers", async () => {
    const registered = await registerUser(app);

    expectNoMonetaryNumbers(registered.response.body);
  });
});
