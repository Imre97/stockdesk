import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { truncateAll } from "./db.js";
import {
  authHeader,
  deposit,
  mainAccount,
  registerUser,
  type CashTransactionBody,
} from "./helpers.js";

const app = createApp({ rateLimit: { enabled: false } });

interface TransactionsPageBody {
  transactions: CashTransactionBody[];
  nextCursor: string | null;
}

function fetchPage(token: string, accountId: string, query = ""): request.Test {
  return request(app).get(`/api/v1/accounts/${accountId}/transactions${query}`).set(authHeader(token));
}

describe("GET /api/v1/accounts/:id/transactions", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("rejects an unauthenticated request", async () => {
    const response = await request(app).get("/api/v1/accounts/any/transactions");

    expect(response.status).toBe(401);
  });

  it("returns the newest transactions first", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    expect((await deposit(app, registered.accessToken, account.id, "10.00", "first")).status).toBe(201);
    expect((await deposit(app, registered.accessToken, account.id, "20.00", "second")).status).toBe(201);

    const response = await fetchPage(registered.accessToken, account.id);

    expect(response.status).toBe(200);
    const page = response.body as TransactionsPageBody;
    expect(page.transactions.map((row) => row.note)).toEqual(["second", "first", "initial funding"]);
    expect(page.transactions.map((row) => row.balanceAfter)).toEqual([
      "100030.00",
      "100010.00",
      "100000.00",
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it("pages through the ledger with an opaque keyset cursor", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    expect((await deposit(app, registered.accessToken, account.id, "10.00", "first")).status).toBe(201);
    expect((await deposit(app, registered.accessToken, account.id, "20.00", "second")).status).toBe(201);

    const firstPage = (await fetchPage(registered.accessToken, account.id, "?limit=2"))
      .body as TransactionsPageBody;

    expect(firstPage.transactions.map((row) => row.note)).toEqual(["second", "first"]);
    expect(typeof firstPage.nextCursor).toBe("string");

    const secondPage = (
      await fetchPage(registered.accessToken, account.id, `?limit=2&cursor=${firstPage.nextCursor ?? ""}`)
    ).body as TransactionsPageBody;

    expect(secondPage.transactions.map((row) => row.note)).toEqual(["initial funding"]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("rejects an invalid limit", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    const response = await fetchPage(registered.accessToken, account.id, "?limit=101");

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("rejects a malformed cursor", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    const response = await fetchPage(registered.accessToken, account.id, "?cursor=not-a-cursor");

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("returns 404 for an account of another user", async () => {
    const owner = await registerUser(app);
    const intruder = await registerUser(app);
    const account = await mainAccount(app, owner.accessToken);

    const response = await fetchPage(intruder.accessToken, account.id);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: "ACCOUNT_NOT_FOUND" } });
  });
});
