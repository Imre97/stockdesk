import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runBootTasks } from "../src/boot.js";
import type { SnapshotJob } from "../src/modules/accounts/snapshot-job.js";
import type { MarketJobs } from "../src/modules/market/jobs.js";
import { loadConfig } from "../src/lib/config.js";
import { prisma } from "../src/lib/prisma.js";
import { truncateAll } from "./db.js";
import { uniqueEmail } from "./helpers.js";

const MILLISECONDS_PER_MINUTE = 60 * 1000;

const config = loadConfig(process.env);

interface JobCalls {
  ticks: number;
  thinnings: number;
  starts: number;
  stops: number;
}

function stubSnapshotJob(calls: JobCalls): SnapshotJob {
  return {
    runSnapshotTick: () => {
      calls.ticks += 1;
      return Promise.resolve();
    },
    runThinning: () => {
      calls.thinnings += 1;
      return Promise.resolve();
    },
    start: () => {
      calls.starts += 1;
    },
    stop: () => {
      calls.stops += 1;
    },
  };
}

interface MarketCalls {
  refreshes: number;
  thinnings: number;
  starts: number;
  stops: number;
}

function stubMarketJobs(calls: MarketCalls, failing = false): MarketJobs {
  return {
    runSymbolRefresh: () => {
      calls.refreshes += 1;
      return failing ? Promise.reject(new Error("provider unreachable")) : Promise.resolve();
    },
    runCandleThinning: () => {
      calls.thinnings += 1;
      return Promise.resolve();
    },
    start: () => {
      calls.starts += 1;
    },
    stop: () => {
      calls.stops += 1;
    },
  };
}

async function createUserId(): Promise<string> {
  const user = await prisma.user.create({
    data: { email: uniqueEmail("boot"), passwordHash: "not-a-real-hash", displayName: "Trader" },
  });

  return user.id;
}

describe("runBootTasks", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("removes expired refresh tokens at boot and keeps live ones", async () => {
    const userId = await createUserId();

    const expired = await prisma.refreshToken.create({
      data: { userId, tokenHash: "boot-expired-hash", expiresAt: new Date(Date.now() - 60_000) },
    });
    const live = await prisma.refreshToken.create({
      data: { userId, tokenHash: "boot-live-hash", expiresAt: new Date(Date.now() + 600_000) },
    });
    const tombstone = await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: "boot-revoked-hash",
        expiresAt: new Date(Date.now() + 600_000),
        revokedAt: new Date(),
      },
    });

    const tasks = await runBootTasks(config);
    tasks.stop();

    expect(await prisma.refreshToken.findUnique({ where: { id: expired.id } })).toBeNull();
    expect(await prisma.refreshToken.findUnique({ where: { id: live.id } })).not.toBeNull();
    expect(await prisma.refreshToken.findUnique({ where: { id: tombstone.id } })).not.toBeNull();
  });

  it("prunes again on the configured interval and stops on request", async () => {
    vi.useFakeTimers();

    let pruneCalls = 0;
    const intervalConfig = { ...config, refreshTokenPruneIntervalMinutes: 30 };

    const calls: JobCalls = { ticks: 0, thinnings: 0, starts: 0, stops: 0 };

    const tasks = await runBootTasks(intervalConfig, {
      snapshotJob: stubSnapshotJob(calls),
      pruneExpiredRefreshTokens: () => {
        pruneCalls += 1;
        return Promise.resolve(0);
      },
    });

    expect(pruneCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(30 * MILLISECONDS_PER_MINUTE);
    expect(pruneCalls).toBe(2);

    await vi.advanceTimersByTimeAsync(30 * MILLISECONDS_PER_MINUTE);
    expect(pruneCalls).toBe(3);

    tasks.stop();

    await vi.advanceTimersByTimeAsync(120 * MILLISECONDS_PER_MINUTE);
    expect(pruneCalls).toBe(3);
  });

  it("takes one snapshot, thins once and starts the snapshot job at boot", async () => {
    const calls: JobCalls = { ticks: 0, thinnings: 0, starts: 0, stops: 0 };

    const tasks = await runBootTasks(config, {
      snapshotJob: stubSnapshotJob(calls),
      pruneExpiredRefreshTokens: () => Promise.resolve(0),
    });

    expect(calls).toEqual({ ticks: 1, thinnings: 1, starts: 1, stops: 0 });

    tasks.stop();
    expect(calls.stops).toBe(1);
  });

  it("refreshes the symbol master, thins the candles and starts the market jobs", async () => {
    const calls: MarketCalls = { refreshes: 0, thinnings: 0, starts: 0, stops: 0 };

    const tasks = await runBootTasks(config, {
      snapshotJob: stubSnapshotJob({ ticks: 0, thinnings: 0, starts: 0, stops: 0 }),
      pruneExpiredRefreshTokens: () => Promise.resolve(0),
      marketJobs: stubMarketJobs(calls),
    });

    await tasks.marketReady;
    expect(calls).toEqual({ refreshes: 1, thinnings: 1, starts: 1, stops: 0 });

    tasks.stop();
    expect(calls.stops).toBe(1);
  });

  it("keeps serving when the market boot tasks fail", async () => {
    const reported: string[] = [];
    const calls: MarketCalls = { refreshes: 0, thinnings: 0, starts: 0, stops: 0 };

    const tasks = await runBootTasks(config, {
      snapshotJob: stubSnapshotJob({ ticks: 0, thinnings: 0, starts: 0, stops: 0 }),
      pruneExpiredRefreshTokens: () => Promise.resolve(0),
      marketJobs: stubMarketJobs(calls, true),
      reportError: (message) => reported.push(message),
    });

    await tasks.marketReady;
    tasks.stop();

    expect(calls.thinnings).toBe(0);
    expect(reported.some((message) => message.includes("provider unreachable"))).toBe(true);
  });

  it("reports a failing prune without throwing", async () => {
    const reported: string[] = [];

    const tasks = await runBootTasks(config, {
      snapshotJob: stubSnapshotJob({ ticks: 0, thinnings: 0, starts: 0, stops: 0 }),
      pruneExpiredRefreshTokens: () => Promise.reject(new Error("database unreachable")),
      reportError: (message) => reported.push(message),
    });
    tasks.stop();

    expect(reported).toHaveLength(1);
    expect(reported[0]).toContain("refresh tokens");
    expect(reported[0]).toContain("database unreachable");
  });
});
