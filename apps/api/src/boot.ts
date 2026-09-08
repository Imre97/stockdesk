import type { AppConfig } from "./lib/config.js";
import { deleteExpiredRefreshTokens } from "./modules/auth/repository.js";

const MILLISECONDS_PER_MINUTE = 60 * 1000;

export interface BootDependencies {
  pruneExpiredRefreshTokens: () => Promise<number>;
  reportError: (message: string) => void;
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

  const pruneOnce = async (): Promise<void> => {
    try {
      await prune();
    } catch {
      reportError("Pruning expired refresh tokens failed.");
    }
  };

  await pruneOnce();

  const timer = setInterval(() => {
    void pruneOnce();
  }, config.refreshTokenPruneIntervalMinutes * MILLISECONDS_PER_MINUTE);

  timer.unref();

  return {
    stop: () => {
      clearInterval(timer);
    },
  };
}
