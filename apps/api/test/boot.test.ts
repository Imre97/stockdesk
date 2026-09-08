import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runBootTasks } from "../src/boot.js";
import { loadConfig } from "../src/lib/config.js";
import { prisma } from "../src/lib/prisma.js";
import { truncateAll } from "./db.js";
import { uniqueEmail } from "./helpers.js";

const MILLISECONDS_PER_MINUTE = 60 * 1000;

const config = loadConfig(process.env);

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

    const tasks = await runBootTasks(config);
    tasks.stop();

    expect(await prisma.refreshToken.findUnique({ where: { id: expired.id } })).toBeNull();
    expect(await prisma.refreshToken.findUnique({ where: { id: live.id } })).not.toBeNull();
  });

  it("prunes again on the configured interval and stops on request", async () => {
    vi.useFakeTimers();

    let pruneCalls = 0;
    const intervalConfig = { ...config, refreshTokenPruneIntervalMinutes: 30 };

    const tasks = await runBootTasks(intervalConfig, {
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

  it("reports a failing prune without throwing", async () => {
    const reported: string[] = [];

    const tasks = await runBootTasks(config, {
      pruneExpiredRefreshTokens: () => Promise.reject(new Error("database unreachable")),
      reportError: (message) => reported.push(message),
    });
    tasks.stop();

    expect(reported).toHaveLength(1);
    expect(reported[0]).toContain("refresh tokens");
  });
});
