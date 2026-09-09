import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { wsSession } from "../../lib/ws-session";
import { positionRecordDto } from "../../test/fixtures";
import { useAuthStore } from "../auth/store";
import { usePositionStream } from "./stream";
import { usePositionsStore } from "./store";

class FakeSocket {
  static instances: FakeSocket[] = [];

  readonly sent: string[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor() {
    FakeSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  emit(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

const POSITION_UPDATE = {
  type: "position_update",
  position: positionRecordDto({ accountId: "acc-1", symbol: "TSLA", quantity: "10.000000" }),
};

const CLOSED_UPDATE = {
  type: "position_update",
  position: positionRecordDto({
    accountId: "acc-1",
    symbol: "TSLA",
    quantity: "0.000000",
    closedAt: "2026-09-08T15:00:00.000Z",
  }),
};

const nativeWebSocket = globalThis.WebSocket;

function handshake(): FakeSocket {
  const socket = FakeSocket.instances[FakeSocket.instances.length - 1];

  if (socket === undefined) throw new Error("no socket was created");

  socket.open();
  socket.emit({ type: "auth_ok", userId: "user-1" });

  return socket;
}

beforeEach(() => {
  FakeSocket.instances = [];
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  useAuthStore.setState({ user: null, accessToken: "token-1", status: "authenticated" });
  usePositionsStore.getState().reset();
});

afterEach(() => {
  wsSession.disconnect();
  globalThis.WebSocket = nativeWebSocket;
});

describe("usePositionStream", () => {
  it("routes a position update into the positions store", () => {
    const { unmount } = renderHook(() => usePositionStream());
    const socket = handshake();

    socket.emit(POSITION_UPDATE);

    expect(usePositionsStore.getState().positionsByAccount["acc-1"]?.TSLA?.quantity.toString()).toBe("10");

    unmount();
  });

  it("removes a closed position", () => {
    const { unmount } = renderHook(() => usePositionStream());
    const socket = handshake();

    socket.emit(POSITION_UPDATE);
    socket.emit(CLOSED_UPDATE);

    expect(usePositionsStore.getState().positionsByAccount["acc-1"]).toEqual({});

    unmount();
  });

  it("ignores messages of other channels", () => {
    const { unmount } = renderHook(() => usePositionStream());
    const socket = handshake();

    socket.emit({ type: "account_summary", accounts: [] });

    expect(usePositionsStore.getState().positionsByAccount).toEqual({});

    unmount();
  });

  it("stops applying messages after unmount", () => {
    const { unmount } = renderHook(() => usePositionStream());
    const socket = handshake();

    unmount();
    socket.emit(POSITION_UPDATE);

    expect(usePositionsStore.getState().positionsByAccount).toEqual({});
  });
});
