# Module 1: Auth

Status: implemented

## Scope

Registration, login, logout, access-token refresh, current-user endpoint. Introduces the `User` model and creates the user's first trading account (`Main`, 100 000.00 USD) plus default settings; the `Account` and `UserSettings` models themselves are specified in Module 2 (`dashboard.md`). Frontend: register page, login page, auth store, protected route layout.

Out of scope: email verification, password reset, OAuth, two-factor authentication, roles.

## Data model (Prisma)

```prisma
model User {
  id            String         @id @default(cuid())
  email         String         @unique
  passwordHash  String
  displayName   String
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  refreshTokens RefreshToken[]
  accounts      Account[]
  settings      UserSettings?
}

model RefreshToken {
  id        String    @id @default(cuid())
  tokenHash String    @unique
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())
}
```

- Registration runs in one transaction: create `User`, create `Account` named `Main` with `cashBalance = 100000`, create a `CashTransaction` of type `DEPOSIT` for `100000` with note `initial funding`, create `UserSettings` with `defaultAccountId` pointing at the account. Models in `dashboard.md`.
- `tokenHash` is the SHA-256 hex digest of the raw refresh token. Raw tokens are never stored.
- Rows with `expiresAt` in the past are deleted at server boot and then every `REFRESH_TOKEN_PRUNE_INTERVAL_MINUTES` by a background job started from `runBootTasks()`. The rotation path never prunes.

## API

Base path: `/api/v1/auth`

| Method | Path | Body | Success | Notes |
|--------|------|------|---------|-------|
| POST | `/register` | `{ email, password, displayName }` | `201 { user, accessToken }` + refresh cookie | Email normalized to lowercase. Password at least 8 characters. `409 EMAIL_TAKEN` on duplicate. |
| POST | `/login` | `{ email, password }` | `200 { user, accessToken }` + refresh cookie | `401 INVALID_CREDENTIALS` for both unknown email and wrong password; identical response shape and timing-safe comparison to avoid user enumeration. |
| POST | `/refresh` | none, refresh cookie | `200 { accessToken }` + new refresh cookie | Rotation: current token revoked, new one issued. Presenting an already revoked token revokes every token of that user and returns `401 REFRESH_REUSED`. Missing or expired cookie: `401 UNAUTHORIZED`. |
| POST | `/logout` | none, refresh cookie | `204` | Deletes the presented refresh token row when it is still live and clears the cookie. Already revoked (rotated) rows are kept as tombstones so reuse detection still fires on a replayed old value. Other sessions of the same user stay live, and a later refresh with the logged-out cookie takes the unknown-token path (`401 UNAUTHORIZED`), not reuse detection. Idempotent. |
| GET | `/me` | none, `Authorization: Bearer` | `200 { user }` | Protected. |

### `user` shape

```json
{
  "id": "clx...",
  "email": "trader@example.com",
  "displayName": "Trader",
  "createdAt": "2026-09-08T10:00:00.000Z"
}
```

Balances are not part of the user shape; they come from `GET /api/v1/accounts` (Module 2). `passwordHash` is never returned.

### Error codes

`VALIDATION_ERROR` (422), `EMAIL_TAKEN` (409), `INVALID_CREDENTIALS` (401), `UNAUTHORIZED` (401), `REFRESH_REUSED` (401), `RATE_LIMITED` (429).

The app shell also emits API-wide codes that no auth handler raises: `NOT_FOUND` (404) for an unknown `/api/v1` path and `INTERNAL_ERROR` (500) for an unhandled error. They live in `API_ERROR_CODES` in `packages/shared/src/api-error.ts`, not in `AUTH_ERROR_CODES`. A third app-wide code, `PAYLOAD_TOO_LARGE` (413), is raised by the JSON body parser when a request body exceeds the 16 kb limit.

## Tokens

### Access token

- JWT, HS256, secret `JWT_ACCESS_SECRET`.
- Claims: `sub` = user id, `iat`, `exp` = now + `JWT_ACCESS_TTL` (default 15 minutes).
- Sent as `Authorization: Bearer <token>`.
- Client keeps it in the Zustand auth store (memory only). Never in `localStorage` or cookies.

### Refresh token

- 32 random bytes, base64url encoded. SHA-256 hash stored in `RefreshToken.tokenHash`.
- Lifetime `REFRESH_TOKEN_TTL_DAYS` (default 7).
- Cookie attributes: `httpOnly`, `sameSite=strict`, `secure` when `NODE_ENV=production`, `path=/api/v1/auth`.
- Rotated on every `/refresh`. Reuse detection revokes the whole user session set.

### Password hashing

`bcrypt` with cost 12. Chosen at implementation on 2026-09-08 because the native `bcrypt` build works cleanly on the target machines; `argon2id` was not adopted.

## WebSocket authentication

Defined here because Module 2 depends on it.

1. Client opens `/ws`.
2. First message within 5 seconds must be `{ "type": "auth", "token": "<accessToken>" }`.
3. Server verifies the JWT. On success replies `{ "type": "auth_ok", "userId": "..." }`. On failure or timeout closes with code `4001` and reason `unauthorized`.
4. Any non-auth message before `auth_ok` closes the connection with `4001`.

Access token expiry does not close an already authenticated socket. Clients reconnect with a fresh token after a disconnect.

## Server components

- `requireAuth` middleware: verifies the Bearer JWT, sets `req.user = { id }`, otherwise `401 UNAUTHORIZED`.
- Rate limiting on `/login` and `/register`: 10 requests per 15 minutes per IP via `express-rate-limit`, error code `RATE_LIMITED`. The default is configurable through `AUTH_RATE_LIMIT_MAX` and `AUTH_RATE_LIMIT_WINDOW_MINUTES`. The client address is taken from `TRUST_PROXY_HOPS` trusted proxy hops (`app.set("trust proxy", hops)`, never `true`), which defaults to 1 in production and 0 elsewhere; with 0 the socket address is used and `X-Forwarded-For` is ignored. `render.yaml` still sets it explicitly to 1.
- `helmet`, `cors` with origin from `CORS_ORIGIN`, `cookie-parser`.
- Module files: `apps/api/src/modules/auth/{router,service,repository}.ts`, `apps/api/src/middleware/require-auth.ts`, `apps/api/src/ws/auth-handshake.ts`.

## Shared package

- `packages/shared/src/auth.ts`: `registerSchema`, `loginSchema`, `userSchema`, `authResponseSchema`, inferred types, `AuthErrorCode` union.
- `packages/shared/src/decimal.ts`: configured `Decimal` export, `decimalString` zod schema, `toApiString(value, decimalPlaces)`.

## Frontend

### Routes

```
apps/web/src/routes/
├── __root.tsx            # providers, outlet
├── register.tsx          # /register
├── login.tsx             # /login
├── _authenticated.tsx    # pathless layout, beforeLoad guard
└── _authenticated/
    └── index.tsx         # / dashboard placeholder
```

### Feature files

- `features/auth/store.ts` (Zustand): state `{ user, accessToken, status }` where `status` is `'idle' | 'loading' | 'authenticated' | 'anonymous'`; actions `login()`, `register()`, `logout()`, `refresh()`, `setSession()`, `clearSession()`.
- `features/auth/api.ts`: calls to `/api/v1/auth/*`, responses parsed with shared zod schemas.
- `features/auth/hooks.ts`: `useCurrentUser()`, `useLogout()`, `useLoginForm()`, `useRegisterForm()`.
- `features/auth/mappers.ts`: user DTO to view model.
- `features/auth/components/LoginForm.tsx`, `RegisterForm.tsx`: render and form hook only; validation via shared zod schemas; server error envelope messages displayed.
- `lib/http.ts`: fetch wrapper. Attaches Bearer from the store. On `401` performs a single in-flight `refresh()`, queues concurrent requests, retries them once, and clears the session if refresh fails.

### Guarding

The router receives an auth store accessor through router `context`. `_authenticated.tsx` `beforeLoad` awaits the initial `refresh()` when status is `idle`, then throws `redirect({ to: '/login' })` if status is `anonymous`.

### Styling

Minimal. Design system decision deferred to a later module.

## Environment

`.env.example`:

```
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://stockdesk:stockdesk@localhost:5432/stockdesk
DIRECT_URL=postgresql://stockdesk:stockdesk@localhost:5432/stockdesk
DATABASE_URL_TEST=postgresql://stockdesk:stockdesk@localhost:5432/stockdesk_test
JWT_ACCESS_SECRET=
JWT_ACCESS_TTL=15m
REFRESH_TOKEN_TTL_DAYS=7
REFRESH_TOKEN_PRUNE_INTERVAL_MINUTES=60
CORS_ORIGIN=http://localhost:5173
WEB_DIST_DIR=../web/dist
AUTH_RATE_LIMIT_MAX=10
AUTH_RATE_LIMIT_WINDOW_MINUTES=15
TRUST_PROXY_HOPS=0
```

This module also adds `GET /api/v1/health` (public): `200 { "status": "ok", "database": "ok" }`, `503 { "status": "degraded", "database": "unreachable" }` when the database query fails. Later modules extend the payload.

## Acceptance criteria

1. Register with valid data returns `201`, persists the user, sets the refresh cookie, and creates the `Main` account with `cashBalance` `100000` plus default `UserSettings` in the same transaction.
2. Registering an existing email returns `409 EMAIL_TAKEN`.
3. Login with a wrong password returns `401 INVALID_CREDENTIALS` with the same response shape as an unknown email.
4. `GET /me` without a token returns `401`; with a valid token returns the user without `passwordHash`.
5. `POST /refresh` rotates the token; reusing the previous token returns `401 REFRESH_REUSED` and every session of that user is revoked.
6. `POST /logout` clears the cookie; a following `/refresh` returns `401`.
7. Reloading a protected page in the browser keeps the session through silent refresh.
8. A case-insensitive search for non-English text in the repository returns nothing.
9. No monetary field in any API response is a JSON number (asserted in integration tests; applies to the account created at registration when read through Module 2 endpoints).

## Tests

- API integration (Vitest + supertest, `stockdesk_test` PostgreSQL database in Docker): one test per acceptance criterion 1 to 6 and 9, plus a health endpoint test.
- Shared: unit tests for `registerSchema`, `loginSchema`, `decimalString`, `toApiString`.
- Web: auth store unit tests without React; `lib/http.ts` refresh-queue test; `LoginForm` render test with Testing Library.
