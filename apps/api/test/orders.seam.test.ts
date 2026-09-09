import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { truncateAll } from "./db.js";
import { createOrdersTestContext, type OrdersTestContext } from "./orders-helpers.js";

const WEDNESDAY_15_00_NY = new Date("2026-09-09T19:00:00.000Z");
const WEDNESDAY_20_00_NY = new Date("2026-09-10T00:00:00.000Z");
const SYMBOL = "TSLA";

let context: OrdersTestContext;

describe("orders test seam", () => {
  beforeEach(async () => {
    await truncateAll();
    context = await createOrdersTestContext({ now: WEDNESDAY_15_00_NY });
  });

  afterEach(async () => {
    await context.close();
  });

  it("reports the market open during a New York session", () => {
    expect(context.runtime.priceService.getMarketStatus().status).toBe("open");
  });

  it("reports the market closed after the New York session", () => {
    context.setNow(WEDNESDAY_20_00_NY);

    expect(context.runtime.priceService.getMarketStatus().status).toBe("closed");
  });

  it("lets an emitted trade set the last price of a subscribed symbol", async () => {
    await context.ensureStreaming([SYMBOL]);

    expect(context.provider.subscribedSymbols()).toEqual([SYMBOL]);

    context.provider.emit({ symbol: SYMBOL, price: "182.5000" });

    const price = await context.runtime.priceService.getLastPrice(SYMBOL);

    expect(price?.toString()).toBe("182.5");
  });

  it("ignores an emitted trade for a symbol nobody subscribed to", async () => {
    context.provider.emit({ symbol: SYMBOL, price: "182.5000" });

    expect(await context.runtime.priceService.getLastPrice(SYMBOL)).toBeNull();
  });
});
