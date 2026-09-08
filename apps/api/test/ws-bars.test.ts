import {
  barMessageSchema,
  toApiString,
  wsErrorMessageSchema,
  type Decimal,
  type ServerMessage,
} from "@stockdesk/shared";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { truncateAll } from "./db.js";
import { authHeader, registerUser } from "./helpers.js";
import {
  connectMarketSocket,
  createTestMarketServer,
  seedSymbols,
  type TestMarketServer,
  type TestSocket,
} from "./market-helpers.js";

const PRICE_PLACES = 4;
const BAR_START = new Date("2026-09-08T18:00:30.000Z");
const FIRST_BUCKET = "2026-09-08T18:00:00.000Z";
const SECOND_BUCKET = "2026-09-08T18:01:00.000Z";
const NEXT_MINUTE = new Date("2026-09-08T18:01:05.000Z");
const DAY_BUCKET = "2026-09-08T04:00:00.000Z";

const servers: TestMarketServer[] = [];
const clients: TestSocket[] = [];

function isBar(message: ServerMessage): boolean {
  return message.type === "bar";
}

function firstTrade(trades: { price: Decimal }[]): { price: Decimal } {
  const [trade] = trades;
  if (trade === undefined) throw new Error("The simulated provider produced no trade.");

  return trade;
}

async function startServer(): Promise<TestMarketServer> {
  const server = await createTestMarketServer({ now: BAR_START });
  servers.push(server);
  await seedSymbols(server);

  return server;
}

async function connect(server: TestMarketServer, token: string): Promise<TestSocket> {
  const client = await connectMarketSocket(server.url, token);
  clients.push(client);

  return client;
}

async function subscribeBars(
  server: TestMarketServer,
  client: TestSocket,
  timeframe: string,
): Promise<void> {
  await server.provider.subscribeTrades(["TSLA"]);
  server.provider.emitTick();
  client.send({ type: "subscribe", channel: "bars", symbol: "TSLA", timeframe });
  client.send({ type: "subscribe", channel: "quotes", symbols: ["TSLA"] });
  await client.next((message) => message.type === "quote");
}

beforeEach(async () => {
  await truncateAll();
});

afterEach(async () => {
  for (const client of clients.splice(0)) await client.close();
  for (const server of servers.splice(0)) await server.close();
});

describe("bars channel", () => {
  it("streams a forming bar on every trade and a final bar at the rollover", async () => {
    const server = await startServer();
    const user = await registerUser(server.app);
    const client = await connect(server, user.accessToken);

    await subscribeBars(server, client, "1m");

    const ticked = firstTrade(server.provider.emitTick());
    const forming = barMessageSchema.parse(await client.next(isBar));

    expect(forming.isFinal).toBe(false);
    expect(forming.timeframe).toBe("1m");
    expect(forming.bar.time).toBe(FIRST_BUCKET);
    expect(forming.bar.close).toBe(toApiString(ticked.price, PRICE_PLACES));

    server.setNow(NEXT_MINUTE);
    await server.sweep();

    const closed = barMessageSchema.parse(await client.next((message) => message.type === "bar"));

    expect(closed.isFinal).toBe(true);
    expect(closed.bar.time).toBe(FIRST_BUCKET);
    expect(closed.bar.close).toBe(toApiString(ticked.price, PRICE_PLACES));

    const row = await prisma.candle.findFirst({
      where: { timeframe: "1m", time: new Date(FIRST_BUCKET) },
    });

    expect(row?.isFinal).toBe(true);

    server.provider.emitTick();
    await server.flush();

    const opened = barMessageSchema.parse(await client.next(isBar));

    expect(opened.isFinal).toBe(false);
    expect(opened.bar.time).toBe(SECOND_BUCKET);
  });

  it("ignores a bars subscription with an unsupported timeframe and keeps the socket usable", async () => {
    const server = await startServer();
    const user = await registerUser(server.app);
    const client = await connect(server, user.accessToken);

    client.send({ type: "subscribe", channel: "bars", symbol: "TSLA", timeframe: "2m" });
    await client.none((message) => message.type === "error", 200);

    await subscribeBars(server, client, "5m");
    server.provider.emitTick();

    const forming = barMessageSchema.parse(await client.next(isBar));

    expect(forming.timeframe).toBe("5m");
  });

  it("writes the live daily bar on the bucket the cached provider bars use", async () => {
    const server = await startServer();
    const user = await registerUser(server.app);
    const client = await connect(server, user.accessToken);

    const warmed = await request(server.app)
      .get("/api/v1/market/symbols/TSLA/bars?timeframe=1D&limit=5")
      .set(authHeader(user.accessToken));

    expect(warmed.status).toBe(200);

    await subscribeBars(server, client, "1m");
    await server.flush();

    const daily = await prisma.candle.findMany({
      where: { timeframe: "1D", time: new Date(DAY_BUCKET) },
    });

    expect(daily).toHaveLength(1);
    expect(daily[0]?.isFinal).toBe(false);

    const page = await request(server.app)
      .get("/api/v1/market/symbols/TSLA/bars?timeframe=1D&limit=5")
      .set(authHeader(user.accessToken));

    const times = (page.body as { bars: { time: string }[] }).bars.map((bar) => bar.time);

    expect(times).toContain(DAY_BUCKET);
    expect(new Set(times).size).toBe(times.length);
  });

  it("reports an unknown symbol on the bars channel", async () => {
    const server = await startServer();
    const user = await registerUser(server.app);
    const client = await connect(server, user.accessToken);

    client.send({ type: "subscribe", channel: "bars", symbol: "XXXX", timeframe: "1m" });

    const message = await client.next((value) => value.type === "error");

    expect(wsErrorMessageSchema.parse(message)).toEqual({
      type: "error",
      code: "SYMBOL_NOT_FOUND",
      symbol: "XXXX",
    });
  });

  it("refuses a sixth bar subscription on one socket", async () => {
    const server = await startServer();
    const user = await registerUser(server.app);
    const client = await connect(server, user.accessToken);

    for (const timeframe of ["1m", "5m", "15m", "1h", "1D", "1W"]) {
      client.send({ type: "subscribe", channel: "bars", symbol: "TSLA", timeframe });
    }

    const message = await client.next((value) => value.type === "error");

    expect(wsErrorMessageSchema.parse(message)).toEqual({
      type: "error",
      code: "SUBSCRIPTION_LIMIT",
    });
  });
});
