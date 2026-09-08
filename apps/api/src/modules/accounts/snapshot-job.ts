import type { AppConfig } from "../../lib/config.js";
import { deleteCoarseSnapshots, retentionCutoff, thinFineSnapshots } from "./snapshot-repository.js";
import { currentTime, snapshotAllAccounts, type AccountsDependencies } from "./snapshot-writer.js";

const MILLISECONDS_PER_SECOND = 1000;
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

export interface SnapshotJobOptions extends AccountsDependencies {
  config: AppConfig;
  takeSnapshots?: ((now: Date) => Promise<void>) | undefined;
  thin?: ((now: Date) => Promise<void>) | undefined;
}

export interface SnapshotJob {
  runSnapshotTick: () => Promise<void>;
  runThinning: () => Promise<void>;
  start: () => void;
  stop: () => void;
}

function defaultReportError(message: string): void {
  process.stderr.write(`${message}\n`);
}

export function createSnapshotJob(options: SnapshotJobOptions): SnapshotJob {
  const config = options.config;
  const reportError = options.reportError ?? defaultReportError;
  const timers: NodeJS.Timeout[] = [];

  const takeSnapshots = options.takeSnapshots ?? ((): Promise<void> => snapshotAllAccounts(options));

  const thin =
    options.thin ??
    (async (now: Date): Promise<void> => {
      await deleteCoarseSnapshots(retentionCutoff(now, config.snapshotCoarseRetentionDays));
      await thinFineSnapshots(retentionCutoff(now, config.snapshotFineRetentionDays));
    });

  async function guarded(label: string, run: (now: Date) => Promise<void>): Promise<void> {
    try {
      await run(currentTime(options));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      reportError(`${label}: ${reason}`);
    }
  }

  async function runSnapshotTick(): Promise<void> {
    await guarded("Taking the equity snapshots failed", takeSnapshots);
  }

  async function runThinning(): Promise<void> {
    await guarded("Thinning the equity snapshots failed", thin);
  }

  function schedule(intervalMs: number, run: () => Promise<void>): void {
    const timer = setInterval(() => {
      void run();
    }, intervalMs);

    timer.unref();
    timers.push(timer);
  }

  return {
    runSnapshotTick,
    runThinning,
    start(): void {
      schedule(config.snapshotIntervalSeconds * MILLISECONDS_PER_SECOND, runSnapshotTick);
      schedule(config.snapshotThinningIntervalHours * MILLISECONDS_PER_HOUR, runThinning);
    },
    stop(): void {
      for (const timer of timers) clearInterval(timer);
      timers.length = 0;
    },
  };
}
