import type { AppConfig } from "./lib/config.js";
import { createSnapshotJob, type SnapshotJob } from "./modules/accounts/snapshot-job.js";
import type { AccountsDependencies, Broadcast } from "./modules/accounts/snapshot-writer.js";
import { deleteExpiredRefreshTokens } from "./modules/auth/repository.js";
import type { MarketJobs } from "./modules/market/jobs.js";
import { alwaysReady, type Readiness } from "./readiness.js";

const MILLISECONDS_PER_MINUTE = 60 * 1000;

export interface BootDependencies {
  pruneExpiredRefreshTokens: () => Promise<number>;
  reportError: (message: string) => void;
  snapshotJob: SnapshotJob;
  marketJobs: MarketJobs;
  broadcast: Broadcast;
  prices: NonNullable<AccountsDependencies["prices"]>;
  now: () => Date;
  readiness: Readiness;
}

export interface BootTasks {
  marketReady: Promise<void>;
  stop: () => void;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
      prices: dependencies.prices,
      now: dependencies.now,
      reportError,
    });

  const pruneOnce = async (): Promise<void> => {
    try {
      await prune();
    } catch (error) {
      reportError(`Pruning expired refresh tokens failed: ${describe(error)}`);
    }
  };

  await pruneOnce();
  await snapshotJob.runSnapshotTick();
  await snapshotJob.runThinning();
  snapshotJob.start();

  const marketJobs = dependencies.marketJobs;
  const readiness = dependencies.readiness ?? alwaysReady;
  const marketReady = runMarketTasks(marketJobs, reportError);

  void marketReady.then(
    () => readiness.markReady(),
    (error: unknown) => {
      reportError(`The market boot tasks failed before readiness: ${describe(error)}`);
      readiness.markReady();
    },
  );

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
    reportError(`Starting the market data tasks failed: ${describe(error)}`);
  }
}
