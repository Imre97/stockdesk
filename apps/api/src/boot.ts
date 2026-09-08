import type { AppConfig } from "./lib/config.js";
import { createSnapshotJob, type SnapshotJob } from "./modules/accounts/snapshot-job.js";
import type { Broadcast } from "./modules/accounts/snapshot-writer.js";
import { deleteExpiredRefreshTokens } from "./modules/auth/repository.js";

const MILLISECONDS_PER_MINUTE = 60 * 1000;

export interface BootDependencies {
  pruneExpiredRefreshTokens: () => Promise<number>;
  reportError: (message: string) => void;
  snapshotJob: SnapshotJob;
  broadcast: Broadcast;
  now: () => Date;
}

export interface BootTasks {
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

  const timer = setInterval(() => {
    void pruneOnce();
  }, config.refreshTokenPruneIntervalMinutes * MILLISECONDS_PER_MINUTE);

  timer.unref();

  return {
    stop: () => {
      clearInterval(timer);
      snapshotJob.stop();
    },
  };
}
