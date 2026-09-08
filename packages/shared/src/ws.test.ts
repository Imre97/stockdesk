import { describe, expect, it } from "vitest";

import {
  accountSummaryMessageSchema,
  authOkMessageSchema,
  clientAuthMessageSchema,
  serverMessageSchema,
} from "./ws.js";

const ACCOUNT_SUMMARY = {
  id: "clx0000000000000000000001",
  name: "Main",
  cash: "100000.00",
  positionsValue: "0.00",
  equity: "100000.00",
  unrealizedPnl: "0.00",
  unrealizedPnlPct: "0.00",
  dailyPnl: "0.00",
  dailyPnlPct: "0.00",
  createdAt: "2026-09-08T10:00:00.000Z",
};

const AUTH_OK = { type: "auth_ok", userId: "clx0000000000000000000000" };
const ACCOUNT_SUMMARY_MESSAGE = { type: "account_summary", accounts: [ACCOUNT_SUMMARY] };

describe("clientAuthMessageSchema", () => {
  it("accepts the handshake message", () => {
    expect(clientAuthMessageSchema.parse({ type: "auth", token: "header.payload.signature" })).toEqual({
      type: "auth",
      token: "header.payload.signature",
    });
  });

  it("rejects an empty token", () => {
    expect(clientAuthMessageSchema.safeParse({ type: "auth", token: "" }).success).toBe(false);
  });

  it("rejects another message type", () => {
    expect(clientAuthMessageSchema.safeParse({ type: "auth_ok", token: "t" }).success).toBe(false);
  });
});

describe("authOkMessageSchema", () => {
  it("accepts the handshake acknowledgement", () => {
    expect(authOkMessageSchema.parse(AUTH_OK)).toEqual(AUTH_OK);
  });

  it("rejects an acknowledgement without a user id", () => {
    expect(authOkMessageSchema.safeParse({ type: "auth_ok" }).success).toBe(false);
  });
});

describe("accountSummaryMessageSchema", () => {
  it("keeps the monetary fields as strings on the wire", () => {
    const result = accountSummaryMessageSchema.parse(ACCOUNT_SUMMARY_MESSAGE);

    expect(result.accounts[0]?.equity).toBe("100000.00");
    expect(typeof result.accounts[0]?.cash).toBe("string");
  });

  it("accepts a message with no accounts", () => {
    expect(accountSummaryMessageSchema.parse({ type: "account_summary", accounts: [] }).accounts).toEqual([]);
  });

  it("rejects an account with a malformed decimal string", () => {
    const result = accountSummaryMessageSchema.safeParse({
      type: "account_summary",
      accounts: [{ ...ACCOUNT_SUMMARY, cash: "1e5" }],
    });

    expect(result.success).toBe(false);
  });
});

describe("serverMessageSchema", () => {
  it("discriminates the handshake acknowledgement", () => {
    const result = serverMessageSchema.parse(AUTH_OK);

    if (result.type !== "auth_ok") throw new Error("expected an auth_ok message");

    expect(result.userId).toBe(AUTH_OK.userId);
  });

  it("discriminates the account summary message", () => {
    const result = serverMessageSchema.parse(ACCOUNT_SUMMARY_MESSAGE);

    if (result.type !== "account_summary") throw new Error("expected an account_summary message");

    expect(result.accounts).toHaveLength(1);
  });

  it.each([
    ["an unknown type", { type: "quote", symbol: "AAPL" }],
    ["a missing type", { accounts: [] }],
    ["a client message", { type: "auth", token: "t" }],
    ["a string body", "boom"],
    ["null", null],
  ])("rejects %s", (_label, input) => {
    expect(serverMessageSchema.safeParse(input).success).toBe(false);
  });
});
