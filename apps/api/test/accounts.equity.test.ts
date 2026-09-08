import { Decimal } from "@stockdesk/shared";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { truncateAll } from "./db.js";
import { authHeader, createAccount, mainAccount, registerUser, type AccountSummaryBody } from "./helpers.js";

const FIXED_NOW = new Date("2026-09-08T18:00:00.000Z");
const NEXT_DAY_NOW = new Date("2026-09-09T18:00:00.000Z");

const app = createApp({ rateLimit: { enabled: false }, deps: { now: () => FIXED_NOW } });
const nextDayApp = createApp({ rateLimit: { enabled: false }, deps: { now: () => NEXT_DAY_NOW } });

interface EquityPointBody {
  at: string;
  equity: string;
}

async function seed(accountId: string, points: [string, string][]): Promise<void> {
  await prisma.accountEquitySnapshot.deleteMany({ where: { accountId } });
  await prisma.accountEquitySnapshot.createMany({
    data: points.map(([at, equity]) => ({
      accountId,
      at: new Date(at),
      cash: new Decimal(equity),
      positionsValue: new Decimal(0),
      equity: new Decimal(equity),
    })),
  });
}

function fetchEquity(token: string, accountId: string, range?: string): request.Test {
  const query = range === undefined ? "" : `?range=${range}`;
  return request(app).get(`/api/v1/accounts/${accountId}/equity${query}`).set(authHeader(token));
}

function points(response: request.Response): EquityPointBody[] {
  return (response.body as { points: EquityPointBody[] }).points;
}

describe("GET /api/v1/accounts/:id/equity", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("rejects an unauthenticated request", async () => {
    const response = await request(app).get("/api/v1/accounts/any/equity?range=1D");

    expect(response.status).toBe(401);
  });

  it("downsamples the current trading day into one-minute buckets", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    await seed(account.id, [
      ["2026-09-08T14:00:10.000Z", "100.00"],
      ["2026-09-08T14:00:50.000Z", "200.00"],
      ["2026-09-08T14:01:30.000Z", "300.00"],
      ["2026-09-07T14:00:10.000Z", "999.00"],
    ]);

    const response = await fetchEquity(registered.accessToken, account.id, "1D");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ range: "1D" });
    expect(points(response)).toEqual([
      { at: "2026-09-08T14:00:50.000Z", equity: "200.00" },
      { at: "2026-09-08T14:01:30.000Z", equity: "300.00" },
    ]);
  });

  it("downsamples the last five weekdays into five-minute buckets", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    await seed(account.id, [
      ["2026-09-04T14:01:00.000Z", "400.00"],
      ["2026-09-04T14:03:00.000Z", "500.00"],
      ["2026-09-04T14:06:00.000Z", "600.00"],
      ["2026-09-08T14:00:10.000Z", "100.00"],
      ["2026-09-08T14:01:30.000Z", "300.00"],
      ["2026-08-25T14:00:00.000Z", "111.00"],
    ]);

    const response = await fetchEquity(registered.accessToken, account.id, "5D");

    expect(response.status).toBe(200);
    expect(points(response)).toEqual([
      { at: "2026-09-04T14:03:00.000Z", equity: "500.00" },
      { at: "2026-09-04T14:06:00.000Z", equity: "600.00" },
      { at: "2026-09-08T14:01:30.000Z", equity: "300.00" },
    ]);
  });

  it("downsamples a week into fifteen-minute buckets", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    await seed(account.id, [
      ["2026-09-07T14:01:00.000Z", "10.00"],
      ["2026-09-07T14:14:00.000Z", "20.00"],
      ["2026-09-07T14:16:00.000Z", "30.00"],
    ]);

    const response = await fetchEquity(registered.accessToken, account.id, "1W");

    expect(points(response)).toEqual([
      { at: "2026-09-07T14:14:00.000Z", equity: "20.00" },
      { at: "2026-09-07T14:16:00.000Z", equity: "30.00" },
    ]);
  });

  it("buckets a New York day by the New York clock, not by the UTC clock", async () => {
    const registered = await registerUser(nextDayApp);
    const account = await mainAccount(nextDayApp, registered.accessToken);

    await seed(account.id, [
      ["2026-09-08T19:00:00.000Z", "10.00"],
      ["2026-09-08T21:00:00.000Z", "20.00"],
      ["2026-09-09T01:00:00.000Z", "30.00"],
      ["2026-09-09T14:00:00.000Z", "40.00"],
    ]);

    const response = await request(nextDayApp)
      .get(`/api/v1/accounts/${account.id}/equity?range=1Y`)
      .set(authHeader(registered.accessToken));

    expect(response.status).toBe(200);
    expect(points(response)).toEqual([
      { at: "2026-09-09T01:00:00.000Z", equity: "30.00" },
      { at: "2026-09-09T14:00:00.000Z", equity: "40.00" },
    ]);
  });

  it("returns an empty array for a range without snapshots", async () => {
    const registered = await registerUser(app);
    const created = await createAccount(app, registered.accessToken, "Savings");
    const account = (created.body as { account: AccountSummaryBody }).account;

    const response = await fetchEquity(registered.accessToken, account.id, "1Y");

    expect(response.status).toBe(200);
    expect(points(response)).toEqual([]);
  });

  it("defaults to the 1D range when none is given", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    const response = await fetchEquity(registered.accessToken, account.id);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ range: "1D" });
  });

  it("rejects an invalid range with 422 VALIDATION_ERROR", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    const response = await fetchEquity(registered.accessToken, account.id, "3D");

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("returns 404 for an account of another user", async () => {
    const owner = await registerUser(app);
    const intruder = await registerUser(app);
    const account = await mainAccount(app, owner.accessToken);

    const response = await fetchEquity(intruder.accessToken, account.id, "1D");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: "ACCOUNT_NOT_FOUND" } });
  });
});
