import { Decimal } from "@stockdesk/shared";
import type { Express } from "express";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { referenceEquities } from "../src/modules/accounts/snapshot-repository.js";
import { truncateAll } from "./db.js";
import { listAccounts, mainAccount, registerUser, type AccountSummaryBody } from "./helpers.js";

const DST_START_NOW = new Date("2026-03-09T18:00:00.000Z");
const DST_END_NOW = new Date("2026-11-02T18:00:00.000Z");
const WEEKEND_NOW = new Date("2026-03-08T18:00:00.000Z");
const DST_END_SUNDAY_NOW = new Date("2026-11-01T18:00:00.000Z");
const DST_END_PRE_OPEN_NOW = new Date("2026-11-02T13:00:00.000Z");

const AROUND_LAST_OCTOBER_SESSION: [string, string][] = [
  ["2026-10-30T13:29:00.000Z", "70000.00"],
  ["2026-10-30T13:31:00.000Z", "60000.00"],
  ["2026-10-31T18:00:00.000Z", "50000.00"],
];

function appAt(now: Date): Express {
  return createApp({ rateLimit: { enabled: false }, deps: { now: () => now } });
}

async function seed(accountId: string, points: [string, string][]): Promise<void> {
  await prisma.accountEquitySnapshot.deleteMany({ where: { accountId } });
  await prisma.accountEquitySnapshot.createMany({
    data: points.map(([at, equity]) => ({
      accountId,
      at: new Date(at),
      cash: new Decimal(equity),
      positionsValue: new Decimal("0"),
      equity: new Decimal(equity),
    })),
  });
}

async function summaryFor(app: Express, token: string, accountId: string): Promise<AccountSummaryBody> {
  const accounts = await listAccounts(app, token);
  const account = accounts.find((item) => item.id === accountId);

  if (account === undefined) throw new Error("The account is missing from the list response.");

  return account;
}

describe("daily profit and loss reference", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("uses the last snapshot strictly before 09:30 New York on a daylight saving start week", async () => {
    const app = appAt(DST_START_NOW);
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    await seed(account.id, [
      ["2026-03-09T13:29:59.000Z", "90000.00"],
      ["2026-03-09T13:30:00.000Z", "95000.00"],
      ["2026-03-09T17:00:00.000Z", "99999.00"],
    ]);

    const summary = await summaryFor(app, registered.accessToken, account.id);

    expect(summary.equity).toBe("100000.00");
    expect(summary.dailyPnl).toBe("10000.00");
    expect(summary.dailyPnlPct).toBe("11.11");
  });

  it("uses the standard time boundary after daylight saving ends", async () => {
    const app = appAt(DST_END_NOW);
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    await seed(account.id, [
      ["2026-11-02T13:30:00.000Z", "10000.00"],
      ["2026-11-02T14:29:59.000Z", "80000.00"],
      ["2026-11-02T15:00:00.000Z", "70000.00"],
    ]);

    const summary = await summaryFor(app, registered.accessToken, account.id);

    expect(summary.dailyPnl).toBe("20000.00");
    expect(summary.dailyPnlPct).toBe("25.00");
  });

  it("reaches back to the Friday boundary on a weekend", async () => {
    const app = appAt(WEEKEND_NOW);
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    await seed(account.id, [
      ["2026-03-06T14:29:00.000Z", "50000.00"],
      ["2026-03-06T15:00:00.000Z", "60000.00"],
    ]);

    const summary = await summaryFor(app, registered.accessToken, account.id);

    expect(summary.dailyPnl).toBe("50000.00");
    expect(summary.dailyPnlPct).toBe("100.00");
  });

  it("reaches back to the Friday boundary on the day daylight saving ends", async () => {
    const app = appAt(DST_END_SUNDAY_NOW);
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    await seed(account.id, AROUND_LAST_OCTOBER_SESSION);

    const summary = await summaryFor(app, registered.accessToken, account.id);

    expect(summary.dailyPnl).toBe("30000.00");
    expect(summary.dailyPnlPct).toBe("42.86");
  });

  it("keeps the Friday boundary before Monday 09:30 New York", async () => {
    const app = appAt(DST_END_PRE_OPEN_NOW);
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    await seed(account.id, [
      ...AROUND_LAST_OCTOBER_SESSION,
      ["2026-11-02T12:00:00.000Z", "10000.00"],
    ]);

    const summary = await summaryFor(app, registered.accessToken, account.id);

    expect(summary.dailyPnl).toBe("30000.00");
    expect(summary.dailyPnlPct).toBe("42.86");
  });

  it("reports zero without a snapshot before the boundary", async () => {
    const app = appAt(DST_START_NOW);
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    await seed(account.id, [["2026-03-09T17:00:00.000Z", "99999.00"]]);

    const summary = await summaryFor(app, registered.accessToken, account.id);

    expect(summary.dailyPnl).toBe("0.00");
    expect(summary.dailyPnlPct).toBe("0.00");
  });
});

describe("referenceEquities", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("returns the last equity strictly before the boundary per account", async () => {
    const app = appAt(DST_START_NOW);
    const owner = await registerUser(app);
    const other = await registerUser(app);
    const first = await mainAccount(app, owner.accessToken);
    const second = await mainAccount(app, other.accessToken);

    await seed(first.id, [
      ["2026-03-09T13:00:00.000Z", "10.00"],
      ["2026-03-09T13:29:59.000Z", "20.00"],
      ["2026-03-09T13:30:00.000Z", "30.00"],
    ]);
    await seed(second.id, [["2026-03-09T14:00:00.000Z", "40.00"]]);

    const references = await referenceEquities(
      [first.id, second.id],
      new Date("2026-03-09T13:30:00.000Z"),
    );

    expect(references.get(first.id)?.equals("20.00")).toBe(true);
    expect(references.has(second.id)).toBe(false);
  });

  it("returns an empty map without account ids", async () => {
    expect(await referenceEquities([], new Date("2026-03-09T13:30:00.000Z"))).toEqual(new Map());
  });
});
