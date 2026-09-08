import { describe, expect, it, vi } from "vitest";

import { resolveAuthGuard } from "./guard";
import type { AuthState, AuthStatus } from "./store";

function createFakeStore(initialStatus: AuthStatus, statusAfterRefresh?: AuthStatus) {
  let status = initialStatus;
  const refresh = vi.fn(async () => {
    if (statusAfterRefresh === undefined) {
      status = "anonymous";
      throw new Error("refresh rejected");
    }
    status = statusAfterRefresh;
  });

  const read = (): AuthState => ({
    user: null,
    accessToken: null,
    status,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refresh,
    setSession: vi.fn(),
    clearSession: vi.fn(),
  });

  return { read, refresh };
}

describe("resolveAuthGuard", () => {
  it("allows an already authenticated session without refreshing", async () => {
    const store = createFakeStore("authenticated");

    await expect(resolveAuthGuard(store.read)).resolves.toBe("allow");
    expect(store.refresh).not.toHaveBeenCalled();
  });

  it("redirects an anonymous session without refreshing", async () => {
    const store = createFakeStore("anonymous");

    await expect(resolveAuthGuard(store.read)).resolves.toBe("redirect");
    expect(store.refresh).not.toHaveBeenCalled();
  });

  it("refreshes an idle session and allows it when the refresh authenticates", async () => {
    const store = createFakeStore("idle", "authenticated");

    await expect(resolveAuthGuard(store.read)).resolves.toBe("allow");
    expect(store.refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes an idle session and redirects when the refresh leaves it anonymous", async () => {
    const store = createFakeStore("idle", "anonymous");

    await expect(resolveAuthGuard(store.read)).resolves.toBe("redirect");
    expect(store.refresh).toHaveBeenCalledTimes(1);
  });

  it("redirects when the refresh rejects", async () => {
    const store = createFakeStore("idle");

    await expect(resolveAuthGuard(store.read)).resolves.toBe("redirect");
    expect(store.refresh).toHaveBeenCalledTimes(1);
  });
});
