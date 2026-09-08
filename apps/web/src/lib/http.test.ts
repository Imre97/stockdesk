import { beforeEach, describe, expect, it, vi } from "vitest";

import { HttpError, configureHttp, getErrorCode, http, resetHttp } from "./http";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(status: number, code: string, details?: unknown): Response {
  return jsonResponse(status, { error: { code, message: "Request rejected", details } });
}

function authHeaderOf(init: RequestInit | undefined): string | null {
  return new Headers(init?.headers).get("Authorization");
}

beforeEach(() => {
  resetHttp();
});

describe("http", () => {
  it("sends credentials and attaches the bearer token from the session", async () => {
    const fetchMock = vi.fn(async (_path: string, _init?: RequestInit) => jsonResponse(200, { ok: true }));
    configureHttp({ fetch: fetchMock, getAccessToken: () => "access-token-1" });

    await http("/api/v1/auth/me");

    const [path, init] = fetchMock.mock.calls[0] ?? [];
    expect(path).toBe("/api/v1/auth/me");
    expect(init?.credentials).toBe("include");
    expect(authHeaderOf(init)).toBe("Bearer access-token-1");
  });

  it("omits the authorization header when there is no token", async () => {
    const fetchMock = vi.fn(async (_path: string, _init?: RequestInit) => jsonResponse(200, { ok: true }));
    configureHttp({ fetch: fetchMock, getAccessToken: () => null });

    await http("/api/v1/auth/me");

    expect(authHeaderOf(fetchMock.mock.calls[0]?.[1])).toBeNull();
  });

  it("serializes the json body and sets the content type", async () => {
    const fetchMock = vi.fn(async (_path: string, _init?: RequestInit) => jsonResponse(200, { ok: true }));
    configureHttp({ fetch: fetchMock });

    await http("/api/v1/auth/login", { method: "POST", json: { email: "trader@example.com" } });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ email: "trader@example.com" }));
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
  });

  it("runs a single refresh for concurrent 401s and retries every request with the new token", async () => {
    let token = "stale-token";
    const fetchMock = vi.fn(async (_path: string, init?: RequestInit) =>
      authHeaderOf(init) === "Bearer fresh-token"
        ? jsonResponse(200, { ok: true })
        : errorResponse(401, "UNAUTHORIZED"),
    );
    const refresh = vi.fn(async () => {
      token = "fresh-token";
    });
    configureHttp({ fetch: fetchMock, getAccessToken: () => token, refresh });

    const results = await Promise.all([http("/a"), http("/b"), http("/c")]);

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(fetchMock.mock.calls.slice(0, 3).map(([, init]) => authHeaderOf(init))).toEqual([
      "Bearer stale-token",
      "Bearer stale-token",
      "Bearer stale-token",
    ]);
    expect(fetchMock.mock.calls.slice(3).map(([, init]) => authHeaderOf(init))).toEqual([
      "Bearer fresh-token",
      "Bearer fresh-token",
      "Bearer fresh-token",
    ]);
  });

  it("releases the in-flight refresh so a later 401 refreshes again", async () => {
    let token = "stale-token";
    const fetchMock = vi.fn(async (_path: string, init?: RequestInit) =>
      authHeaderOf(init) === `Bearer ${token}` && token !== "stale-token"
        ? jsonResponse(200, { ok: true })
        : errorResponse(401, "UNAUTHORIZED"),
    );
    const refresh = vi.fn(async () => {
      token = `fresh-${refresh.mock.calls.length}`;
    });
    configureHttp({ fetch: fetchMock, getAccessToken: () => token, refresh });

    await http("/a");
    token = "stale-token";
    await http("/b");

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("clears the session and rejects every queued request when refresh fails", async () => {
    const fetchMock = vi.fn(async () => errorResponse(401, "UNAUTHORIZED"));
    const refresh = vi.fn(async () => {
      throw new Error("refresh rejected");
    });
    const clearSession = vi.fn();
    configureHttp({ fetch: fetchMock, getAccessToken: () => "stale-token", refresh, clearSession });

    const results = await Promise.allSettled([http("/a"), http("/b")]);

    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(clearSession).toHaveBeenCalled();
    for (const result of results) {
      expect(result.status === "rejected" && result.reason).toBeInstanceOf(HttpError);
      expect(result.status === "rejected" && getErrorCode(result.reason)).toBe("UNAUTHORIZED");
    }
  });

  it("does not refresh when the caller opts out of the retry", async () => {
    const fetchMock = vi.fn(async () => errorResponse(401, "INVALID_CREDENTIALS"));
    const refresh = vi.fn();
    configureHttp({ fetch: fetchMock, getAccessToken: () => "stale-token", refresh });

    await expect(http("/api/v1/auth/login", { method: "POST", skipAuthRetry: true })).rejects.toThrow(HttpError);
    expect(refresh).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("turns the error envelope into an HttpError carrying status, code, and details", async () => {
    const fetchMock = vi.fn(async () => errorResponse(409, "EMAIL_TAKEN", { field: "email" }));
    configureHttp({ fetch: fetchMock });

    const error = await http("/api/v1/auth/register", { method: "POST" }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 409, code: "EMAIL_TAKEN", details: { field: "email" } });
    expect(getErrorCode(error)).toBe("EMAIL_TAKEN");
  });

  it("falls back to an unknown code for a malformed error body", async () => {
    const fetchMock = vi.fn(async () => new Response("<html>gateway</html>", { status: 502 }));
    configureHttp({ fetch: fetchMock });

    const error = await http("/api/v1/auth/register", { method: "POST" }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpError);
    expect(getErrorCode(error)).toBe("UNKNOWN_ERROR");
    expect(error).toMatchObject({ status: 502 });
  });

  it("returns undefined for a 204 response", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    configureHttp({ fetch: fetchMock });

    await expect(http("/api/v1/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  it("passes the response body through the supplied parser", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { accessToken: "access-token-1" }));
    configureHttp({ fetch: fetchMock });

    const parsed = await http<{ token: string }>("/api/v1/auth/refresh", {
      method: "POST",
      parse: (json) => ({ token: (json as { accessToken: string }).accessToken }),
    });

    expect(parsed).toEqual({ token: "access-token-1" });
  });
});

describe("getErrorCode", () => {
  it("returns null for anything that is not an HttpError", () => {
    expect(getErrorCode(new Error("boom"))).toBeNull();
    expect(getErrorCode(null)).toBeNull();
    expect(getErrorCode("EMAIL_TAKEN")).toBeNull();
  });
});
