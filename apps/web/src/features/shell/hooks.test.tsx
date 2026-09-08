import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const logout = vi.fn();

vi.mock("../auth/hooks", async () => {
  const actual = await vi.importActual<typeof import("../auth/hooks")>("../auth/hooks");
  return { ...actual, useLogout: () => logout };
});

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));

import { useAuthStore } from "../auth/store";
import { useProfileMenu } from "./hooks";

const USER = {
  id: "user-1",
  email: "trader@example.com",
  displayName: "Ada Trader",
  createdAt: "2026-09-08T10:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: USER, accessToken: "token-1", status: "authenticated" });
});

describe("useProfileMenu", () => {
  it("exposes the display name and the initials of the signed in user", () => {
    const { result } = renderHook(() => useProfileMenu());

    expect(result.current.displayName).toBe("Ada Trader");
    expect(result.current.initials).toBe("AT");
  });

  it("signs the user out", () => {
    const { result } = renderHook(() => useProfileMenu());

    result.current.signOut();

    expect(logout).toHaveBeenCalled();
  });

  it("falls back to an empty name when nobody is signed in", () => {
    useAuthStore.setState({ user: null, accessToken: null, status: "anonymous" });

    const { result } = renderHook(() => useProfileMenu());

    expect(result.current.displayName).toBe("");
  });
});
