import { Decimal, type ServerMessage } from "@stockdesk/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/lib/config.js";
import { prisma } from "../src/lib/prisma.js";
import { createSnapshotJob } from "../src/modules/accounts/snapshot-job.js";
import { truncateAll } from "./db.js";
import { deposit, firstOf, mainAccount, registerUser } from "./helpers.js";

const FIXED_NOW = new Date("2026-09-08T18:00:00.750Z");
const baseConfig = loadConfig(process.env);
const app = createApp({ rateLimit: { enabled: false } });

interface Broadcast {
  userId: string;
  message: ServerMessage;
}

function jobFor(broadcasts: Broadcast[], now: Date = FIXED_NOW): ReturnType<typeof createSnapshotJob> {
  return createSnapshotJob({
    config: baseConfig,
    now: () => now,
    broadcast: (userId: string, message: ServerMessage) => {
      broadcasts.push({ userId, message });
    },
  });
}

async function seedSnapshot(accountId: string, at: string, equity: string): Promise<void> {
  await prisma.accountEquitySnapshot.create({
    data: {
      accountId,
      at: new Date(at),
      cash: new Decimal(equity),
      positionsValue: new Decimal(0),
      equity: new Decimal(equity),
    },
  });
}

describe("snapshot job", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes one snapshot per account and broadcasts to the owner only", async () => {
    const owner = await registerUser(app);
    const other = await registerUser(app);
    const account = await mainAccount(app, owner.accessToken);
    const broadcasts: Broadcast[] = [];
    await prisma.accountEquitySnapshot.deleteMany();

    await jobFor(broadcasts).runSnapshotTick();

    const rows = await prisma.accountEquitySnapshot.findMany({ where: { accountId: account.id } });
    expect(rows).toHaveLength(1);

    const row = firstOf(rows, "snapshot");
    expect(row.at.toISOString()).toBe("2026-09-08T18:00:00.000Z");
    expect(new Decimal(row.cash.toString()).equals("100000.00")).toBe(true);
    expect(new Decimal(row.positionsValue.toString()).isZero()).toBe(true);
    expect(
      new Decimal(row.equity.toString()).equals(
        new Decimal(row.cash.toString()).plus(row.positionsValue.toString()),
      ),
    ).toBe(true);

    expect(broadcasts.filter((entry) => entry.userId === owner.user.id)).toHaveLength(1);
    expect(broadcasts.filter((entry) => entry.userId === other.user.id)).toHaveLength(1);

    const message = firstOf(broadcasts, "broadcast").message;
    expect(message.type).toBe("account_summary");
  });

  it("keeps a single row when two ticks fall into the same second", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);
    const broadcasts: Broadcast[] = [];
    const job = jobFor(broadcasts);
    await prisma.accountEquitySnapshot.deleteMany();

    await job.runSnapshotTick();
    await job.runSnapshotTick();

    expect(await prisma.accountEquitySnapshot.count({ where: { accountId: account.id } })).toBe(1);
  });

  it("records the committed cash after a deposit", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);
    expect((await deposit(app, registered.accessToken, account.id, "5000.00")).status).toBe(201);
    await prisma.accountEquitySnapshot.deleteMany();

    await jobFor([]).runSnapshotTick();

    const row = firstOf(
      await prisma.accountEquitySnapshot.findMany({
        where: { accountId: account.id, at: new Date("2026-09-08T18:00:00.000Z") },
      }),
      "snapshot",
    );

    expect(new Decimal(row.equity.toString()).equals("105000.00")).toBe(true);
  });

  it("thins old snapshots to one per New York hour and drops the coarse tail", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);
    await prisma.accountEquitySnapshot.deleteMany();

    await seedSnapshot(account.id, "2026-07-01T12:00:00.000Z", "1.00");
    await seedSnapshot(account.id, "2026-08-20T14:00:00.000Z", "2.00");
    await seedSnapshot(account.id, "2026-08-20T14:30:00.000Z", "3.00");
    await seedSnapshot(account.id, "2026-08-20T14:59:00.000Z", "4.00");
    await seedSnapshot(account.id, "2026-08-20T15:10:00.000Z", "5.00");
    await seedSnapshot(account.id, "2026-09-08T14:00:10.000Z", "6.00");
    await seedSnapshot(account.id, "2026-09-08T14:00:20.000Z", "7.00");

    const ledgerRows = await prisma.cashTransaction.count();

    const job = createSnapshotJob({
      config: { ...baseConfig, snapshotFineRetentionDays: 7, snapshotCoarseRetentionDays: 30 },
      now: () => FIXED_NOW,
    });

    await job.runThinning();

    const remaining = await prisma.accountEquitySnapshot.findMany({
      where: { accountId: account.id },
      orderBy: { at: "asc" },
    });

    expect(remaining.map((row) => row.at.toISOString())).toEqual([
      "2026-08-20T14:59:00.000Z",
      "2026-08-20T15:10:00.000Z",
      "2026-09-08T14:00:10.000Z",
      "2026-09-08T14:00:20.000Z",
    ]);
    expect(await prisma.cashTransaction.count()).toBe(ledgerRows);
  });

  it("runs on the configured interval and stops on request", async () => {
    vi.useFakeTimers();

    let ticks = 0;
    let thinnings = 0;

    const job = createSnapshotJob({
      config: { ...baseConfig, snapshotIntervalSeconds: 30, snapshotThinningIntervalHours: 1 },
      now: () => FIXED_NOW,
      takeSnapshots: () => {
        ticks += 1;
        return Promise.resolve();
      },
      thin: () => {
        thinnings += 1;
        return Promise.resolve();
      },
    });

    job.start();
    expect(ticks).toBe(0);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(ticks).toBe(1);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(ticks).toBe(121);
    expect(thinnings).toBe(1);

    job.stop();

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(ticks).toBe(121);
    expect(thinnings).toBe(1);
  });

  it("reports a failing tick without throwing", async () => {
    const reported: string[] = [];

    const job = createSnapshotJob({
      config: baseConfig,
      now: () => FIXED_NOW,
      reportError: (message: string) => reported.push(message),
      takeSnapshots: () => Promise.reject(new Error("database unreachable")),
    });

    await job.runSnapshotTick();

    expect(reported).toHaveLength(1);
    expect(reported[0]).toContain("database unreachable");
  });
});
