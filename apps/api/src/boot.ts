import type { AppConfig } from "./lib/config.js";
import { createSnapshotJob, type SnapshotJob } from "./modules/accounts/snapshot-job.js";
import type { Broadcast } from "./modules/accounts/snapshot-writer.js";
import { deleteExpiredRefreshTokens } from "./modules/auth/repository.js";
import type { MarketJobs } from "./modules/market/jobs.js";

const MILLISECONDS_PER_MINUTE = 60 * 1000;

export interface BootDependencies {
  pruneExpiredRefreshTokens: () => Promise<number>;
  reportError: (message: string) => void;
  snapshotJob: SnapshotJob;
  marketJobs: MarketJobs;
  broadcast: Broadcast;
  now: () => Date;
}

export interface BootTasks {
  marketReady: Promise<void>;
  stop: () => void;
}

function defaultReportError(message: string): void {
  process.stderr.write(`${message}\n`);
}

export async function runBootTasks(
  config: AppConfig,
  dependencies: Partial<BootDependencies> = {},
): Promise<BootTasks> {
  const prune = dependencies.pruneExpiredRefreshTokens ?? deleteExpiredRefreshTokens;
  const reportError = dependencies.reportError ?? defaultReportError;

  const snapshotJob =
    dependencies.snapshotJob ??
    createSnapshotJob({
      config,
      broadcast: dependencies.broadcast,
      now: dependencies.now,
      reportError,
    });

  const pruneOnce = async (): Promise<void> => {
    try {
      await prune();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      reportError(`Pruning expired refresh tokens failed: ${reason}`);
    }
  };

  await pruneOnce();
  await snapshotJob.runSnapshotTick();
  await snapshotJob.runThinning();
  snapshotJob.start();

  const marketJobs = dependencies.marketJobs;
  const marketReady = runMarketTasks(marketJobs, reportError);

  const timer = setInterval(() => {
    void pruneOnce();
  }, config.refreshTokenPruneIntervalMinutes * MILLISECONDS_PER_MINUTE);

  timer.unref();

  return {
    marketReady,
    stop: () => {
      clearInterval(timer);
      snapshotJob.stop();
      marketJobs?.stop();
    },
  };
}

async function runMarketTasks(
  marketJobs: MarketJobs | undefined,
  reportError: (message: string) => void,
): Promise<void> {
  if (marketJobs === undefined) return;

  marketJobs.start();

  try {
    await marketJobs.runSymbolRefresh();
    await marketJobs.runCandleThinning();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    reportError(`Starting the market data tasks failed: ${reason}`);
  }
}
