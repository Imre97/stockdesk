import { isApiErrorEnvelope } from "@stockdesk/shared";

export const UNKNOWN_ERROR_CODE = "UNKNOWN_ERROR";

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getErrorCode(error: unknown): string | null {
  return error instanceof HttpError ? error.code : null;
}

export type FetchLike = (path: string, init?: RequestInit) => Promise<Response>;

export interface HttpConfig {
  fetch: FetchLike;
  getAccessToken: () => string | null;
  refresh: () => Promise<void>;
  clearSession: () => void;
}

export interface HttpOptions<T = unknown> extends Omit<RequestInit, "body"> {
  json?: unknown;
  skipAuthRetry?: boolean;
  parse?: (json: unknown) => T;
}

const UNAUTHORIZED_STATUS = 401;
const NO_CONTENT_STATUS = 204;

function defaultConfig(): HttpConfig {
  return {
    fetch: (path, init) => globalThis.fetch(path, init),
    getAccessToken: () => null,
    refresh: () => Promise.reject(new HttpError(UNAUTHORIZED_STATUS, "UNAUTHORIZED", "No refresh handler configured")),
    clearSession: () => undefined,
  };
}

let config = defaultConfig();
let inFlightRefresh: Promise<void> | null = null;

export function configureHttp(overrides: Partial<HttpConfig>): void {
  config = { ...config, ...overrides };
}

export function resetHttp(): void {
  config = defaultConfig();
  inFlightRefresh = null;
}

function buildHeaders(options: HttpOptions<unknown>): Headers {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const token = config.getAccessToken();
  if (token !== null && token !== "" && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return headers;
}

function send(path: string, options: HttpOptions<unknown>): Promise<Response> {
  const { json, skipAuthRetry: _skipAuthRetry, parse: _parse, headers: _headers, ...rest } = options;

  return config.fetch(path, {
    ...rest,
    headers: buildHeaders(options),
    credentials: "include",
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  });
}

/** Shares one refresh between every caller that hit a 401 while the refresh was still running. */
function refreshOnce(): Promise<void> {
  if (inFlightRefresh === null) {
    inFlightRefresh = config.refresh().finally(() => {
      inFlightRefresh = null;
    });
  }

  return inFlightRefresh;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

async function toHttpError(response: Response): Promise<HttpError> {
  const body = await readJson(response);

  if (isApiErrorEnvelope(body)) {
    return new HttpError(response.status, body.error.code, body.error.message, body.error.details);
  }

  return new HttpError(response.status, UNKNOWN_ERROR_CODE, `Request failed with status ${response.status}`);
}

export async function http<T = unknown>(path: string, options: HttpOptions<T> = {}): Promise<T> {
  let response = await send(path, options);

  if (response.status === UNAUTHORIZED_STATUS && options.skipAuthRetry !== true) {
    const refreshed = await refreshOnce().then(
      () => true,
      () => false,
    );

    if (!refreshed) {
      config.clearSession();
      throw await toHttpError(response);
    }

    response = await send(path, options);
  }

  if (!response.ok) {
    throw await toHttpError(response);
  }

  if (response.status === NO_CONTENT_STATUS) {
    return undefined as T;
  }

  const body = await readJson(response);

  return options.parse === undefined ? (body as T) : options.parse(body);
}
