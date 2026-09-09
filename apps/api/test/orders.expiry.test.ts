import type { OrderDto } from "@stockdesk/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { createExpiryJob, type ExpiryJob } from "../src/modules/orders/expiry-job.js";
import { truncateAll } from "./db.js";
import {
  expectLedgerInvariant,
  mainAccount,
  registerUser,
  type RegisteredUser,
} from "./helpers.js";
import { seedSymbols } from "./market-helpers.js";
import { deleteOrder } from "./orders-api.js";
import { createOrdersTestContext, expectReservationInvariant, type OrdersTestContext } from "./orders-helpers.js";
import { lastAccountSummary, orderUpdatesFor, placeAccepted } from "./orders-scenario.js";

const WEDNESDAY_15_00_NY = new Date("2026-09-09T19:00:00.000Z");
const WEDNESDAY_AFTER_CLOSE = new Date("2026-09-09T20:00:01.000Z");
const FRIDAY_17_00_NY = new Date("2026-09-11T21:00:00.000Z");
const SATURDAY_16_00_NY = new Date("2026-09-12T20:00:00.000Z");
const MONDAY_AFTER_CLOSE = new Date("2026-09-14T20:00:01.000Z");
const SYMBOL = "TSLA";
const LAST = "250.0000";
const CHECK_SECONDS = 1;
const MILLISECONDS_PER_SECOND = 1000;

let context: OrdersTestContext;
let owner: RegisteredUser;
let accountId: string;

const DAY_LIMIT_BUY = {
  symbol: SYMBOL,
  side: "BUY",
  type: "LIMIT",
  quantity: "10",
  limitPrice: "180.0000",
  timeInForce: "DAY",
};

const GTC_LIMIT_BUY = {
  symbol: SYMBOL,
  side: "BUY",
  type: "LIMIT",
  quantity: "4",
  limitPrice: "170.0000",
  timeInForce: "GTC",
};

async function start(now: Date): Promise<void> {
  await truncateAll();
  context = await createOrdersTestContext({ now });
  await seedSymbols({ provider: context.simulated });
  await context.ensureStreaming([SYMBOL]);
  context.provider.emit({ symbol: SYMBOL, price: LAST });

  owner = await registerUser(context.app);
  accountId = (await mainAccount(context.app, owner.accessToken)).id;
  context.broadcasts.length = 0;
}

async function place(body: Record<string, unknown>): Promise<OrderDto> {
  return await placeAccepted(context.app, owner.accessToken, accountId, body);
}

function jobFor(checkSeconds = CHECK_SECONDS): ExpiryJob {
  return createExpiryJob({
    ...context.accounts,
    config: { ...context.config, orderExpiryCheckSeconds: checkSeconds },
    engine: context.engine,
  });
}

describe("DAY order expiry job", () => {
  afterEach(async () => {
    vi.useRealTimers();
    await context.close();
  });

  it("expires a due DAY order, releases its reservation and pushes the updates", async () => {
    await start(WEDNESDAY_15_00_NY);

    const day = await place(DAY_LIMIT_BUY);
    const gtc = await place(GTC_LIMIT_BUY);

    expect(day.expiresAt).toBe("2026-09-09T20:00:00.000Z");
    expect(day.reservedCash).toBe("1800.00");
    expect(gtc.expiresAt).toBeNull();

    context.setNow(WEDNESDAY_AFTER_CLOSE);
    context.broadcasts.length = 0;
    await jobFor().runExpiryTick();

    const expired = await prisma.order.findUniqueOrThrow({ where: { id: day.id } });

    expect(expired.status).toBe("EXPIRED");
    expect(expired.reservedCash.toString()).toBe("0");
    expect(expired.version).toBe(2);

    expect(orderUpdatesFor(context, day.id).map((update) => update.status)).toEqual(["EXPIRED"]);
    expect(lastAccountSummary(context, accountId).reservedCash).toBe("680.00");

    const survivor = await prisma.order.findUniqueOrThrow({ where: { id: gtc.id } });

    expect(survivor.status).toBe("OPEN");
    expect(survivor.reservedCash.toString()).toBe("680");

    await expectLedgerInvariant(accountId);
    await expectReservationInvariant(accountId);
  });

  it("keeps a DAY order alive over the weekend and expires it at the Monday close", async () => {
    await start(FRIDAY_17_00_NY);

    const day = await place(DAY_LIMIT_BUY);

    expect(day.expiresAt).toBe("2026-09-14T20:00:00.000Z");

    context.setNow(SATURDAY_16_00_NY);
    await jobFor().runExpiryTick();

    const surviving = await prisma.order.findUniqueOrThrow({ where: { id: day.id } });

    expect(surviving.status).toBe("OPEN");
    expect(surviving.version).toBe(1);

    context.setNow(MONDAY_AFTER_CLOSE);
    await jobFor().runExpiryTick();

    const expired = await prisma.order.findUniqueOrThrow({ where: { id: day.id } });

    expect(expired.status).toBe("EXPIRED");
    expect(expired.reservedCash.toString()).toBe("0");

    await expectReservationInvariant(accountId);
  });

  it("lets either the expiry job or the user cancel win, never both", async () => {
    await start(WEDNESDAY_15_00_NY);

    const day = await place(DAY_LIMIT_BUY);

    context.setNow(WEDNESDAY_AFTER_CLOSE);

    const [, response] = await Promise.all([
      jobFor().runExpiryTick(),
      deleteOrder(context.app, owner.accessToken, accountId, day.id, { version: day.version }),
    ]);

    const row = await prisma.order.findUniqueOrThrow({ where: { id: day.id } });

    if (response.status === 200) {
      expect(row.status).toBe("CANCELLED");
      expect(row.cancelReason).toBe("USER");
    } else {
      expect([409, 422]).toContain(response.status);
      expect(row.status).toBe("EXPIRED");
      expect(row.cancelReason).toBeNull();
    }

    expect(row.version).toBe(2);
    expect(row.reservedCash.toString()).toBe("0");

    await expectReservationInvariant(accountId);
  });

  it("runs on the configured interval and stops on request", async () => {
    await start(WEDNESDAY_15_00_NY);

    let ticks = 0;
    const job = createExpiryJob({
      ...context.accounts,
      config: { ...context.config, orderExpiryCheckSeconds: CHECK_SECONDS },
      engine: context.engine,
      expire: () => {
        ticks += 1;

        return Promise.resolve();
      },
    });

    vi.useFakeTimers();
    job.start();

    await vi.advanceTimersByTimeAsync(CHECK_SECONDS * MILLISECONDS_PER_SECOND);
    expect(ticks).toBe(1);

    await vi.advanceTimersByTimeAsync(CHECK_SECONDS * MILLISECONDS_PER_SECOND);
    expect(ticks).toBe(2);

    job.stop();

    await vi.advanceTimersByTimeAsync(10 * CHECK_SECONDS * MILLISECONDS_PER_SECOND);
    expect(ticks).toBe(2);

    vi.useRealTimers();
  });

  it("reports a failing expiry pass without throwing", async () => {
    await start(WEDNESDAY_15_00_NY);

    const reported: string[] = [];
    const job = createExpiryJob({
      ...context.accounts,
      config: context.config,
      engine: context.engine,
      reportError: (message) => reported.push(message),
      expire: () => Promise.reject(new Error("database unreachable")),
    });

    await job.runExpiryTick();

    expect(reported).toHaveLength(1);
    expect(reported[0]).toContain("database unreachable");
  });
});
