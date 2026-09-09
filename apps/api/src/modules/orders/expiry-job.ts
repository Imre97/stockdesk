import type { AppConfig } from "../../lib/config.js";
import { prisma } from "../../lib/prisma.js";
import { listAccountsByIds } from "../accounts/repository.js";
import {
  afterCashChange,
  currentTime,
  type AccountsDependencies,
} from "../accounts/snapshot-writer.js";
import { publishOrderUpdate } from "./engine-events.js";
import { expireDayOrders } from "./order-writes.js";
import { listDueDayOrders, listOrdersByIdsAndStatus, type OrderRow } from "./repository.js";
import { toOrderDto } from "./serializers.js";

const MILLISECONDS_PER_SECOND = 1000;

export interface ExpiryEnginePort {
  indexRemove: (orderId: string) => void;
}

export interface ExpiryJobOptions extends AccountsDependencies {
  config: AppConfig;
  engine: ExpiryEnginePort;
  expire?: ((now: Date) => Promise<void>) | undefined;
}

export interface ExpiryJob {
  runExpiryTick: () => Promise<void>;
  start: () => void;
  stop: () => void;
}

function defaultReportError(message: string): void {
  process.stderr.write(`${message}\n`);
}

async function ownersOf(accountIds: string[]): Promise<Map<string, string>> {
  const accounts = await listAccountsByIds(accountIds);

  return new Map(accounts.map((account) => [account.id, account.userId]));
}

/**
 * The due rows are read first only to bound the statement that expires them; the single conditional
 * update decides every race, and the rows that carry the new status are read back for the pushes.
 */
export function createExpiryJob(options: ExpiryJobOptions): ExpiryJob {
  const reportError = options.reportError ?? defaultReportError;
  const timers: NodeJS.Timeout[] = [];

  async function publish(expired: OrderRow[]): Promise<void> {
    const accountIds = [...new Set(expired.map((order) => order.accountId))];
    const owners = await ownersOf(accountIds);
    const affected = new Set<string>();

    for (const order of expired) {
      options.engine.indexRemove(order.id);

      const userId = owners.get(order.accountId);
      if (userId === undefined) continue;

      publishOrderUpdate(options, userId, toOrderDto(order));
      affected.add(userId);
    }

    for (const userId of affected) await afterCashChange(userId, options);
  }

  async function expireDue(now: Date): Promise<void> {
    const due = await listDueDayOrders(now);
    if (due.length === 0) return;

    const orderIds = due.map((order) => order.id);
    if ((await expireDayOrders(prisma, orderIds, now)) === 0) return;

    const expired = await listOrdersByIdsAndStatus(orderIds, "EXPIRED");
    if (expired.length === 0) return;

    await publish(expired);
  }

  const expire = options.expire ?? expireDue;

  async function runExpiryTick(): Promise<void> {
    try {
      await expire(currentTime(options));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      reportError(`Expiring the due DAY orders failed: ${reason}`);
    }
  }

  return {
    runExpiryTick,

    start(): void {
      const timer = setInterval(() => {
        void runExpiryTick();
      }, options.config.orderExpiryCheckSeconds * MILLISECONDS_PER_SECOND);

      timer.unref();
      timers.push(timer);
    },

    stop(): void {
      for (const timer of timers) clearInterval(timer);
      timers.length = 0;
    },
  };
}
