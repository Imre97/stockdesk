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
- Prisma columns are `Decimal`. On SQLite Prisma stores them as `DECIMAL` and returns `Prisma.Decimal`, which is a decimal.js instance.
- API JSON transports them as strings. Shared zod helper `decimalString` validates the format and transforms to `Decimal`. Serialize with `toApiString(value, decimalPlaces)`.
- Display precision: money 2 decimals, prices 4 decimals, share quantities up to 6 decimals with trailing zeros trimmed. Position quantities are signed; negative means short.

## API

- Base path `/api/v1`, JSON request and response bodies.
- Error envelope: `{ "error": { "code": string, "message": string, "details"?: unknown } }`.
- Error codes are `UPPER_SNAKE_CASE` and listed per module in the module spec.
- Request and response shapes are zod schemas in `packages/shared`; both sides import them.
- Timestamps are ISO 8601 UTC strings in JSON, `DateTime` in Prisma.

## Environment

- Secrets and machine-specific values come from `.env` (gitignored). `.env.example` documents every variable and is committed.
- Configuration is parsed and validated once at startup with zod; the app refuses to start on invalid config.

## Testing

- Test-driven: tests are written before the production code they cover. Order per task: derive test cases from the module spec's acceptance criteria, write them, run them and see them fail for the expected reason, implement, run green, refactor.
- Test files live next to the code they test (`service.ts` and `service.test.ts`), integration tests under `apps/api/test/`.
- Vitest everywhere.
- API: integration tests with supertest against a dedicated SQLite test database, one test per acceptance criterion.
- Shared: unit tests for zod schemas and Decimal helpers.
- Web: store and hook unit tests without React where possible; component render tests with Testing Library.
- Playwright e2e added once the first vertical slice exists.

## Git

- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`).
- Subject line 50 characters or fewer, imperative mood, English.
