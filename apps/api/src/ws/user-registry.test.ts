import type { ServerMessage } from "@stockdesk/shared";
import { describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createUserRegistry } from "./user-registry.js";

const MESSAGE: ServerMessage = { type: "account_summary", accounts: [] };

interface StubSocket {
  socket: WebSocket;
  sent: string[];
}

function stubSocket(readyState: number = WebSocket.OPEN): StubSocket {
  const sent: string[] = [];
  const socket = {
    readyState,
    send: (payload: string): void => {
      sent.push(payload);
    },
  };

  return { socket: socket as unknown as WebSocket, sent };
}

describe("createUserRegistry", () => {
  it("delivers a message to every open socket of the user", () => {
    const registry = createUserRegistry();
    const first = stubSocket();
    const second = stubSocket();

    registry.add("user-1", first.socket);
    registry.add("user-1", second.socket);

    expect(registry.socketCount("user-1")).toBe(2);

    registry.broadcastToUser("user-1", MESSAGE);

    expect(first.sent).toEqual([JSON.stringify(MESSAGE)]);
    expect(second.sent).toEqual([JSON.stringify(MESSAGE)]);
  });

  it("skips a socket that is not open", () => {
    const registry = createUserRegistry();
    const open = stubSocket();
    const closing = stubSocket(WebSocket.CLOSING);
    const closed = stubSocket(WebSocket.CLOSED);

    registry.add("user-1", open.socket);
    registry.add("user-1", closing.socket);
    registry.add("user-1", closed.socket);

    registry.broadcastToUser("user-1", MESSAGE);

    expect(open.sent).toHaveLength(1);
    expect(closing.sent).toHaveLength(0);
    expect(closed.sent).toHaveLength(0);
  });

  it("never delivers to another user", () => {
    const registry = createUserRegistry();
    const owner = stubSocket();
    const other = stubSocket();

    registry.add("user-1", owner.socket);
    registry.add("user-2", other.socket);

    registry.broadcastToUser("user-1", MESSAGE);

    expect(owner.sent).toHaveLength(1);
    expect(other.sent).toHaveLength(0);
  });

  it("forgets a removed socket and the user once the last one is gone", () => {
    const registry = createUserRegistry();
    const first = stubSocket();
    const second = stubSocket();

    registry.add("user-1", first.socket);
    registry.add("user-1", second.socket);
    registry.remove("user-1", first.socket);

    expect(registry.socketCount("user-1")).toBe(1);

    registry.broadcastToUser("user-1", MESSAGE);
    expect(first.sent).toHaveLength(0);
    expect(second.sent).toHaveLength(1);

    registry.remove("user-1", second.socket);
    expect(registry.socketCount("user-1")).toBe(0);

    registry.broadcastToUser("user-1", MESSAGE);
    expect(second.sent).toHaveLength(1);
  });

  it("ignores an unknown user", () => {
    const registry = createUserRegistry();
    const orphan = stubSocket();

    registry.remove("user-1", orphan.socket);
    registry.broadcastToUser("user-1", MESSAGE);

    expect(registry.socketCount("user-1")).toBe(0);
    expect(orphan.sent).toHaveLength(0);
  });
});
