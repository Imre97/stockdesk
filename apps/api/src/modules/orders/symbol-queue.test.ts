import { describe, expect, it } from "vitest";
import { createSymbolQueue } from "./symbol-queue.js";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
}

describe("symbol queue", () => {
  it("serializes two tasks for one symbol", async () => {
    const queue = createSymbolQueue(() => undefined);
    const events: string[] = [];
    const gate = deferred();

    const first = queue.run("TSLA", async () => {
      events.push("first:start");
      await gate.promise;
      events.push("first:end");
    });

    const second = queue.run("TSLA", async () => {
      events.push("second:start");
    });

    await Promise.resolve();

    expect(events).toEqual(["first:start"]);

    gate.resolve();
    await Promise.all([first, second]);

    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("runs tasks for different symbols concurrently", async () => {
    const queue = createSymbolQueue(() => undefined);
    const started: string[] = [];
    const gate = deferred();

    const left = queue.run("TSLA", async () => {
      started.push("TSLA");
      await gate.promise;
    });

    const right = queue.run("AAPL", async () => {
      started.push("AAPL");
      await gate.promise;
    });

    await Promise.resolve();

    expect(started).toEqual(["TSLA", "AAPL"]);

    gate.resolve();
    await Promise.all([left, right]);
  });

  it("waits for queued work in flush", async () => {
    const queue = createSymbolQueue(() => undefined);
    const done: string[] = [];
    const gate = deferred();

    void queue.run("TSLA", async () => {
      await gate.promise;
      done.push("TSLA");
    });

    expect(queue.pending()).toBe(1);

    gate.resolve();
    await queue.flush();

    expect(done).toEqual(["TSLA"]);
    expect(queue.pending()).toBe(0);
  });

  it("logs a failed task and keeps the chain running", async () => {
    const logs: string[] = [];
    const queue = createSymbolQueue((message) => logs.push(message));
    const done: string[] = [];

    await queue.run("TSLA", async () => {
      throw new Error("boom");
    });

    await queue.run("TSLA", async () => {
      done.push("second");
    });

    expect(logs).toEqual(["Processing the order queue of TSLA failed: boom"]);
    expect(done).toEqual(["second"]);
  });
});
