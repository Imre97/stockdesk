# Conventions

## Language

English only. Applies to documentation, code comments, identifiers, placeholders, seed data, fixture names, test descriptions, commit messages, and branch names.

Single exception: translated UI strings in `apps/web/src/i18n/locales/<lang>/*.json` for non-English locales. Keys inside those files stay English.

## i18n

- Library: i18next + react-i18next. Setup in `apps/web/src/i18n/index.ts`.
- One JSON file per namespace per locale: `locales/en/dashboard.json`, `locales/hu/dashboard.json`. Namespaces follow feature names.
- Keys: English, dotted, camelCase, describing the place and meaning (`accounts.sidebar.unrealizedPnl`), never the English text itself.
- Every locale has the same key set. A unit test compares `en` against every other locale and fails on missing or extra keys.
- No string literals shown to the user inside components; everything goes through `t()`.
- Numbers, dates, and currencies are formatted with the active locale through the shared `format.ts` helpers, never with hand-written separators.

## Styling

- Tailwind utility classes in JSX. No CSS modules, no inline `style` except for values computed at runtime (chart container sizes).
- shadcn/ui components live in `apps/web/src/components/ui/` and are edited in place when needed.
- Colors come from CSS variables defined for `:root` and `.dark`. Semantic tokens for finance: `--gain`, `--loss`, `--neutral`. Never hard-code green or red.
- Theme switching toggles the `dark` class on `<html>`.

## Naming

- Files and folders: `kebab-case` (`auth-store.ts`, `login-form.tsx`). Exception: React component files and TanStack route files may use `PascalCase` or router-mandated names (`__root.tsx`, `_authenticated.tsx`).
- React components: `PascalCase`.
- Variables, functions, hooks: `camelCase`; hooks start with `use`.
- Types and interfaces: `PascalCase`, no `I` prefix.
- Constants: `UPPER_SNAKE_CASE` only for true compile-time constants.
- Zustand stores: `use<Domain>Store` exported from `features/<domain>/store.ts`.
- Database models: singular `PascalCase` (`User`, `Order`). Columns `camelCase`.

## Code structure

### Web

```
apps/web/src/
├── routes/                 # route files: compose feature components, no logic
├── components/             # pure presentational, reusable (Button, Input, Card...)
├── features/<domain>/
│   ├── store.ts            # zustand store (state + actions)
│   ├── api.ts              # fetch calls, returns parsed shared types
│   ├── hooks.ts            # hooks bridging store/api to components
│   ├── mappers.ts          # DTO -> view model (Decimal parsing, formatting)
│   └── components/         # feature-specific UI, render only
└── lib/                    # http client, decimal helpers, router context
```

Rules:

- `.tsx` files contain JSX and hook calls only. No fetch calls, no business rules, no calculations in render bodies.
- Business logic lives in `.ts` files (store, hooks, services, mappers) and is unit-testable without React.
- Zustand for client and session state and for WebSocket-fed live data. TanStack Query for request/response data.
- Route files under `src/routes/` compose feature components. `routeTree.gen.ts` is generated and committed, never edited by hand.
- Protected pages sit under the pathless layout `_authenticated.tsx`.

### API

```
apps/api/src/modules/<domain>/
├── router.ts       # Express router, request parsing with shared zod schemas, response mapping
├── service.ts      # business rules, no Express types
└── repository.ts   # Prisma access
```

Routers stay thin. Services throw typed `AppError` instances; a single error middleware maps them to the error envelope.

## File size

Soft limit 300 lines, hard limit 400 lines for every `.ts` and `.tsx` file. Enforced by ESLint `max-lines: 400`. Split by responsibility before crossing the soft limit.

## Comments

- No inline comments by default. Prefer self-explanatory names and small functions.
- One short block comment above a function is allowed only when the algorithm or edge case is genuinely non-obvious.
- No commented-out code. No `TODO` without an issue reference.

## Numbers

- Use `Decimal` from `@stockdesk/shared` for every monetary, price, and quantity value. Native `number` is forbidden for these.
- Shared package configures once: `Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN })`.
- Prisma columns are `Decimal` with an explicit PostgreSQL type: `@db.Decimal(20, 8)` for prices and quantities, `@db.Decimal(20, 2)` for cash amounts. Prisma returns `Prisma.Decimal`, which is a decimal.js instance.
- API JSON transports them as strings. Shared zod helper `decimalString` validates the format and transforms to `Decimal`. Serialize with `toApiString(value, decimalPlaces)`.
- Display precision: money 2 decimals, prices 4 decimals, share quantities up to 6 decimals with trailing zeros trimmed. Position quantities are signed; negative means short.

## API

- Base path `/api/v1`, JSON request and response bodies.
- Error envelope: `{ "error": { "code": string, "message": string, "details"?: unknown } }`.
- Error codes are `UPPER_SNAKE_CASE` and listed per module in the module spec.
- Request and response shapes are zod schemas in `packages/shared`; both sides import them.
- Timestamps are ISO 8601 UTC strings in JSON, `DateTime` in Prisma.

## Environment and secrets

- Secrets and machine-specific values come from `.env` (gitignored). `.env.example` documents every variable by name with an empty or placeholder value and is committed.
- Configuration is parsed and validated once at startup with zod in `apps/api/src/lib/config.ts`; the app refuses to start on invalid or missing required values. No other file reads `process.env`.
- Database URLs: `DATABASE_URL` for the application (pooled in production), `DIRECT_URL` for migrations, `DATABASE_URL_TEST` for the test suite. The local Docker credentials in `.env.example` are not secrets; every production value is.
- Never hard-code a secret, even in tests. Tests use obviously fake values (`test-secret`, `sk_test_placeholder`) that never match a real key format.
- Never log a secret, a token, a cookie value, or a full `Authorization` header. Log the presence, not the value.
- The web app receives only public configuration through `VITE_*` variables; nothing under `VITE_` may be secret.
- `scripts/hooks/check-secrets.mjs` runs before every `git commit` and blocks the commit when a staged file matches a secret pattern or when a `.env` file other than `.env.example` is staged. Fix the content; never bypass the hook. Connection strings pointing at `localhost`, `127.0.0.1`, or the Docker service names `postgres`, `db`, `database` are treated as local development defaults and allowed; any other host with a password is blocked.
- A leaked secret is rotated first, removed from history second. Stop and tell the user before doing either.

## Decisions and blockers

- Do not guess. Errors with an unclear cause, spec ambiguities, dependency conflicts, security concerns, and design choices with several defensible answers are raised to the user with the options listed, then work waits for the answer.
- Never weaken or skip a failing test to make the suite green, never edit a spec to match code, never work around a blocker silently. Each of those is a decision for the user.

## Testing

- Test-driven: tests are written before the production code they cover. Order per task: derive test cases from the module spec's acceptance criteria, write them, run them and see them fail for the expected reason, implement, run green, refactor.
- Test files live next to the code they test (`service.ts` and `service.test.ts`), integration tests under `apps/api/test/`.
- Vitest everywhere.
- API: integration tests with supertest against the `stockdesk_test` PostgreSQL database in the local Docker container (`DATABASE_URL_TEST`), one test per acceptance criterion. The suite runs `prisma migrate deploy` once, truncates all tables between tests, and never touches the development database.
- Database migrations: created with `prisma migrate dev`, committed under `apps/api/prisma/migrations/`, applied in production with `prisma migrate deploy`. No destructive migration without a note in the pull request.
- Shared: unit tests for zod schemas and Decimal helpers.
- Web: store and hook unit tests without React where possible; component render tests with Testing Library.
- End-to-end: Playwright in its own workspace `apps/e2e`, one spec per user-visible flow, against the dedicated `stockdesk_e2e` database (`DATABASE_URL_E2E`) so it never shares state with the unit test or development databases. The suite has no `test` script, so `npm test` and the test hook skip it; the Playwright global setup runs `prisma migrate deploy` and truncates every table before the run, and the config starts the API and the Vite dev server itself.
- Run it locally with `npm run e2e` (once per machine `npm run e2e:install` for the chromium binary); in CI `.github/workflows/ci.yml` runs it on every push to `main` and every pull request and uploads the HTML report as an artifact when it fails.

## Git

- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`).
- Subject line 50 characters or fewer, imperative mood, English.
