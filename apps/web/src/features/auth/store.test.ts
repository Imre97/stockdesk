import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({
  register: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  refresh: vi.fn(),
  me: vi.fn(),
}));

import * as api from "./api";
import { useAuthStore } from "./store";

const USER = {
  id: "clx0000000000000000000000",
  email: "trader@example.com",
  displayName: "Trader",
  createdAt: "2026-09-08T10:00:00.000Z",
};

const LOGIN_INPUT = { email: "trader@example.com", password: "correct-horse" };
const REGISTER_INPUT = { ...LOGIN_INPUT, displayName: "Trader" };

const INITIAL_SNAPSHOT = {
  user: useAuthStore.getState().user,
  accessToken: useAuthStore.getState().accessToken,
  status: useAuthStore.getState().status,
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: null, accessToken: null, status: "idle" });
});

describe("useAuthStore", () => {
  it("starts anonymous-unknown with an idle status and no token", () => {
    expect(INITIAL_SNAPSHOT).toEqual({ user: null, accessToken: null, status: "idle" });
  });

  it("stores the user, the token, and an authenticated status after login", async () => {
    vi.mocked(api.login).mockResolvedValue({ user: USER, accessToken: "access-token-1" });

    await useAuthStore.getState().login(LOGIN_INPUT);

    expect(api.login).toHaveBeenCalledWith(LOGIN_INPUT);
    expect(useAuthStore.getState()).toMatchObject({
      user: USER,
      accessToken: "access-token-1",
      status: "authenticated",
    });
  });

  it("stores the session after register", async () => {
    vi.mocked(api.register).mockResolvedValue({ user: USER, accessToken: "access-token-2" });

    await useAuthStore.getState().register(REGISTER_INPUT);

    expect(api.register).toHaveBeenCalledWith(REGISTER_INPUT);
    expect(useAuthStore.getState()).toMatchObject({
      user: USER,
      accessToken: "access-token-2",
      status: "authenticated",
    });
  });

  it("clears the session and rethrows when login fails", async () => {
    vi.mocked(api.login).mockRejectedValue(new Error("invalid credentials"));

    await expect(useAuthStore.getState().login(LOGIN_INPUT)).rejects.toThrow("invalid credentials");
    expect(useAuthStore.getState()).toMatchObject({ user: null, accessToken: null, status: "anonymous" });
  });

  it("calls the logout endpoint and clears the session", async () => {
    vi.mocked(api.logout).mockResolvedValue(undefined);
    useAuthStore.setState({ user: USER, accessToken: "access-token-1", status: "authenticated" });

    await useAuthStore.getState().logout();

    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({ user: null, accessToken: null, status: "anonymous" });
  });

  it("clears the session even when the logout endpoint fails", async () => {
    vi.mocked(api.logout).mockRejectedValue(new Error("network down"));
    useAuthStore.setState({ user: USER, accessToken: "access-token-1", status: "authenticated" });

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState()).toMatchObject({ user: null, accessToken: null, status: "anonymous" });
  });

  it("populates the token and loads the user through me on refresh", async () => {
    vi.mocked(api.refresh).mockResolvedValue({ accessToken: "access-token-3" });
    vi.mocked(api.me).mockResolvedValue({ user: USER });

    await useAuthStore.getState().refresh();

    expect(api.me).toHaveBeenCalledWith("access-token-3");
    expect(useAuthStore.getState()).toMatchObject({
      user: USER,
      accessToken: "access-token-3",
      status: "authenticated",
    });
  });

  it("skips me when the store already knows the user", async () => {
    vi.mocked(api.refresh).mockResolvedValue({ accessToken: "access-token-4" });
    useAuthStore.setState({ user: USER, accessToken: "access-token-1", status: "authenticated" });

    await useAuthStore.getState().refresh();

    expect(api.me).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({ user: USER, accessToken: "access-token-4" });
  });

  it("becomes anonymous with empty session values when refresh fails", async () => {
    vi.mocked(api.refresh).mockRejectedValue(new Error("unauthorized"));
    useAuthStore.setState({ user: USER, accessToken: "access-token-1", status: "authenticated" });

    await expect(useAuthStore.getState().refresh()).rejects.toThrow("unauthorized");
    expect(useAuthStore.getState()).toMatchObject({ user: null, accessToken: null, status: "anonymous" });
  });

  it("clears the session when me fails after a successful refresh", async () => {
    vi.mocked(api.refresh).mockResolvedValue({ accessToken: "access-token-5" });
    vi.mocked(api.me).mockRejectedValue(new Error("unauthorized"));

    await expect(useAuthStore.getState().refresh()).rejects.toThrow("unauthorized");
    expect(useAuthStore.getState()).toMatchObject({ user: null, accessToken: null, status: "anonymous" });
  });

  it("sets and clears the session through the plain actions", () => {
    useAuthStore.getState().setSession({ user: USER, accessToken: "access-token-6" });
    expect(useAuthStore.getState().status).toBe("authenticated");

    useAuthStore.getState().clearSession();
    expect(useAuthStore.getState()).toMatchObject({ user: null, accessToken: null, status: "anonymous" });
  });
});
