import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { truncateAll } from "./db.js";
import {
  authHeader,
  createAccount,
  firstOf,
  listAccounts,
  mainAccount,
  registerUser,
  type AccountSummaryBody,
} from "./helpers.js";

const app = createApp({ rateLimit: { enabled: false } });

function rename(token: string, accountId: string, name: string): request.Test {
  return request(app).patch(`/api/v1/accounts/${accountId}`).set(authHeader(token)).send({ name });
}

describe("POST /api/v1/accounts", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("creates an account with zero cash", async () => {
    const registered = await registerUser(app);

    const response = await createAccount(app, registered.accessToken, "  Savings  ");

    expect(response.status).toBe(201);
    const account = (response.body as { account: AccountSummaryBody }).account;
    expect(account.name).toBe("Savings");
    expect(account.cash).toBe("0.00");
    expect(account.equity).toBe("0.00");
  });

  it("rejects a duplicate name with 409 ACCOUNT_NAME_TAKEN", async () => {
    const registered = await registerUser(app);
    expect((await createAccount(app, registered.accessToken, "Savings")).status).toBe(201);

    const response = await createAccount(app, registered.accessToken, "Savings");

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: "ACCOUNT_NAME_TAKEN" } });
  });

  it("rejects an empty name with 422 VALIDATION_ERROR", async () => {
    const registered = await registerUser(app);

    const response = await createAccount(app, registered.accessToken, "   ");

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("rejects the eleventh account with 422 ACCOUNT_LIMIT_REACHED", async () => {
    const registered = await registerUser(app);

    for (let index = 2; index <= 10; index += 1) {
      expect((await createAccount(app, registered.accessToken, `Account ${index}`)).status).toBe(201);
    }

    const response = await createAccount(app, registered.accessToken, "Account 11");

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: "ACCOUNT_LIMIT_REACHED" } });
    expect(await prisma.account.count({ where: { userId: registered.user.id } })).toBe(10);
  });

  it("lets exactly one of two concurrent creates take the last free slot", async () => {
    const registered = await registerUser(app);

    for (let index = 2; index <= 9; index += 1) {
      expect((await createAccount(app, registered.accessToken, `Account ${index}`)).status).toBe(201);
    }

    const [first, second] = await Promise.all([
      createAccount(app, registered.accessToken, "Race A"),
      createAccount(app, registered.accessToken, "Race B"),
    ]);

    const statuses = [first.status, second.status].sort((left, right) => left - right);
    expect(statuses).toEqual([201, 422]);
    expect(await prisma.account.count({ where: { userId: registered.user.id } })).toBe(10);
  });

  it("lets exactly one of two concurrent creates with the same name win", async () => {
    const registered = await registerUser(app);

    const [first, second] = await Promise.all([
      createAccount(app, registered.accessToken, "Twin"),
      createAccount(app, registered.accessToken, "Twin"),
    ]);

    const statuses = [first.status, second.status].sort((left, right) => left - right);
    expect(statuses).toEqual([201, 409]);
    expect(await prisma.account.count({ where: { userId: registered.user.id, name: "Twin" } })).toBe(1);
  });
});

describe("PATCH /api/v1/accounts/:id", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("renames an account", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    const response = await rename(registered.accessToken, account.id, "Primary");

    expect(response.status).toBe(200);
    expect((response.body as { account: AccountSummaryBody }).account.name).toBe("Primary");
    expect((await listAccounts(app, registered.accessToken)).map((item) => item.name)).toEqual(["Primary"]);
  });

  it("returns 200 when renaming to the current name", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    const response = await rename(registered.accessToken, account.id, "Main");

    expect(response.status).toBe(200);
    expect((response.body as { account: AccountSummaryBody }).account.name).toBe("Main");
  });

  it("returns 409 when the new name is already taken", async () => {
    const registered = await registerUser(app);
    expect((await createAccount(app, registered.accessToken, "Savings")).status).toBe(201);
    const account = await mainAccount(app, registered.accessToken);

    const response = await rename(registered.accessToken, account.id, "Savings");

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: "ACCOUNT_NAME_TAKEN" } });
  });

  it("returns 404 for an unknown account", async () => {
    const registered = await registerUser(app);

    const response = await rename(registered.accessToken, "cl-unknown-account", "Primary");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: "ACCOUNT_NOT_FOUND" } });
  });

  it("returns 404 for an account of another user and leaves it unchanged", async () => {
    const owner = await registerUser(app);
    const intruder = await registerUser(app);
    const account = await mainAccount(app, owner.accessToken);

    const response = await rename(intruder.accessToken, account.id, "Stolen");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: "ACCOUNT_NOT_FOUND" } });

    const stored = firstOf(await listAccounts(app, owner.accessToken), "account");
    expect(stored.name).toBe("Main");
  });
});
