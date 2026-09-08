import { describe, expect, it } from "vitest";

import { userScopedKey } from "./query-keys";

describe("userScopedKey", () => {
  it("puts the user id in front of every part", () => {
    expect(userScopedKey("user-1", "settings")).toEqual(["user", "user-1", "settings"]);
  });

  it("keeps the remaining parts in order", () => {
    expect(userScopedKey("user-1", "market", "bars", "TSLA", "1m")).toEqual([
      "user",
      "user-1",
      "market",
      "bars",
      "TSLA",
      "1m",
    ]);
  });

  it("separates two users that ask for the same resource", () => {
    expect(userScopedKey("user-1", "positions", "acc-1")).not.toEqual(
      userScopedKey("user-2", "positions", "acc-1"),
    );
  });

  it("scopes an anonymous caller under a null user", () => {
    expect(userScopedKey(null, "settings")).toEqual(["user", null, "settings"]);
  });
});
