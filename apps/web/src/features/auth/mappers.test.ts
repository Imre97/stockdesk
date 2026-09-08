import { describe, expect, it } from "vitest";

import { toUserViewModel } from "./mappers";

const USER = {
  id: "clx0000000000000000000000",
  email: "trader@example.com",
  displayName: "Ada Lovelace",
  createdAt: "2026-09-08T10:00:00.000Z",
};

describe("toUserViewModel", () => {
  it("copies the identity fields and converts createdAt to a Date", () => {
    const viewModel = toUserViewModel(USER);

    expect(viewModel.id).toBe(USER.id);
    expect(viewModel.email).toBe(USER.email);
    expect(viewModel.displayName).toBe(USER.displayName);
    expect(viewModel.createdAt).toBeInstanceOf(Date);
    expect(viewModel.createdAt.toISOString()).toBe(USER.createdAt);
  });

  it.each([
    ["Ada Lovelace", "AL"],
    ["Trader", "T"],
    ["ada lovelace", "AL"],
    ["  Ada   Byron   Lovelace  ", "AB"],
    ["", ""],
    ["   ", ""],
  ])("derives the initials %s -> %s", (displayName, expected) => {
    expect(toUserViewModel({ ...USER, displayName }).initials).toBe(expected);
  });
});
