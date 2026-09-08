# Technical Debt Register

Last updated: 2026-09-08

## Summary
- Open: 10 (high 0, medium 2, low 8)
- Fixed since last update: 3
- Trend: Module 2 (dashboard) closed the two auth-review items it was blocked on (centered card, AC9 vacuity) and turned the i18n locale-loading item into a maintenance improvement without removing the eager bundling it was filed for, so TD-5 stays open; new debt is concentrated in web/e2e test-infra friction rather than in application logic.
- Recommended next: TD-4 (production static-serving path still untested end to end), TD-22 (fix e2e webServer/migration ordering, currently just noisy), TD-24 (revisit trading-day approximation in Module 3).

## Open
| Id | Area | Summary | Impact | Effort | Timing | Source | Status |
|----|------|---------|--------|--------|--------|--------|--------|
| TD-4 | infra | Production static-serving path (helmet CSP + `express.static` SPA fallback + one-origin cookie) is only covered by a non-helmet unit test, never exercised end to end | medium | M | later | docs/reviews/2026-09-08-auth.md | open |
| TD-5 | web | `apps/web/src/i18n/index.ts` still eager-loads every locale catalog into the main chunk (`import.meta.glob(..., { eager: true })`); Module 2 replaced the hand-written per-namespace imports with auto-discovery via glob, which removes the manual-edit burden but keeps every catalog in the main bundle, so the bundle-growth concern is unresolved | medium | S | module: next module that adds a namespace | docs/reviews/2026-09-08-auth.md | open |
| TD-16 | api | Logout presented with an already-rotated cookie returns `204` while the successor session survives; documented no-op, but a client with a stale cookie gets a silent logout that doesn't logout | low | S | later | docs/reviews/2026-09-08-auth-4.md | open |
| TD-17 | api | Revoked refresh-token tombstones live until `expiresAt`, so per-user row count grows with rotation frequency inside one TTL window | low | S | later | docs/reviews/2026-09-08-auth-4.md | open |
| TD-18 | api | Boot-task scheduling failure (`server.ts` `.catch`) logs to stderr and keeps serving with no prune timer installed, so token-row growth resumes silently until the next deploy; decide between exit non-zero and retry | low | S | later | docs/reviews/2026-09-08-auth-6.md | open |
| TD-19 | infra | Language guard repo mode is selected by `root === repoRoot` or the test-only `CHECK_LANGUAGE_GIT` flag; detect a `.git` root instead and drop the env hook | low | S | later | docs/reviews/2026-09-08-auth-6.md | open |
| TD-20 | infra | `check-language.test.ts` ignores the `git init` exit status; an absent git surfaces as a missing-substring assertion instead of a clear failure | low | S | later | docs/reviews/2026-09-08-auth-6.md | open |
| TD-21 | web/test | Radix dropdown-menu content in jsdom takes 2 to 20 s per open render and triggers vitest RPC timeouts, so `ProfileMenu` open-state is not unit-tested (menu logic covered via `useProfileMenu` hook test, open menu via e2e) | low | S | later | docs/modules/dashboard.md implementation, 2026-09-08 | open |
| TD-22 | e2e | The Playwright API webServer boots before `globalSetup` runs `prisma migrate deploy`, so the boot snapshot and thinning jobs log `table AccountEquitySnapshot does not exist` against a fresh stockdesk_e2e (harmless, noisy) | low | S | later | docs/modules/dashboard.md implementation, 2026-09-08 | open |
| TD-23 | e2e/infra | On Windows a Playwright webServer `tsx watch src/server.ts` process survived the run once (orphan on port 3000 blocked the next run; killed manually); consider `tsx src/server.ts` without watch or an explicit teardown that kills the port | low | S | later | docs/modules/dashboard.md implementation, 2026-09-08 | open |
| TD-24 | api | Trading day is approximated as Monday to Friday in New York with no holiday calendar until Module 3's market status (recorded decision, revisit in Module 3) | low | S | module: market-status | docs/modules/dashboard.md implementation, 2026-09-08 | accepted |

## Closed
| Id | Area | Summary | Fixed in | Closed on |
|----|------|---------|----------|-----------|
| TD-1 | api | AC9 (no monetary field is a JSON number) was asserted over responses with no monetary fields, vacuous until Module 2 exposed accounts | `5df5bac` (`GET /api/v1/accounts` returns monetary fields; `apps/api/test/accounts.list.test.ts` asserts `expectNoMonetaryNumbers` with the widened `MONETARY_KEY_PATTERN` in `apps/api/test/helpers.ts`) | 2026-09-08 |
| TD-3 | web | `LoginForm.tsx` used raw Tailwind palette classes instead of tokens; login/register also needed to be centered in a card | `8af9d47` (`apps/web/src/components/AuthLayout.tsx` centers auth forms in a shadcn `Card` using tokens) | 2026-09-08 |
| TD-2 | api | AC8 (case-insensitive search over non-English text finds nothing) has no automated guard, only a manual scan | `249ab11` (`scripts/check-language.mjs`, `apps/api/test/check-language.test.ts`, wired into `lint:language` and CI) | 2026-09-08 |
| TD-6 | api | `express.json()` uses the 100 kb default limit on endpoints whose largest body is three short strings | `249ab11` (16 kb limit, `PAYLOAD_TOO_LARGE`, `apps/api/test/payload-limit.test.ts`) | 2026-09-08 |
| TD-9 | shared | Dead exports without consumers: `resetConfigCache`, `useAuth`, `useRequireAuth`, `isDecimalString`, `wsAuthenticatedUserId` | `249ab11` (removed from `apps/web/src/features/auth/hooks.ts`, `packages/shared/src/decimal.ts`, `apps/api/src/lib/config.ts`) | 2026-09-08 |
| TD-10 | api | `trust proxy` hop count was hard-coded instead of read from config | `249ab11` (`config.ts` `TRUST_PROXY_HOPS`, `apps/api/test/auth.rate-limit.test.ts`) | 2026-09-08 |
| TD-11 | api | Three `as RotationResult` casts in `repository.ts` defeated return-type checking inside the rotation transaction | `249ab11` (`repository.ts:99` typed `$transaction` callback return) | 2026-09-08 |
| TD-12 | api | Boot-time refresh-token pruning was untestable because `server.ts` starts listening on import | `249ab11` (`apps/api/src/boot.ts` `runBootTasks`, `apps/api/test/boot.test.ts`) | 2026-09-08 |
| TD-13 | api | `eslint.config.js` test override also disabled `no-restricted-syntax`, letting test files do `parseFloat`/`toFixed` money math | `249ab11` (`eslint.config.js` `testGlobs` includes `apps/api/test/**` under the decimal rule) | 2026-09-08 |
| TD-14 | api | Every successful refresh rotation awaited an extra `DELETE` round trip in the request path | `249ab11` (`boot.ts` interval job; rotation path in `repository.ts` no longer prunes) | 2026-09-08 |
| TD-15 | api | The refresh-reuse race test repeated 5 iterations at bcrypt cost 12 | `249ab11` (`apps/api/test/auth.refresh.test.ts:58` loops 2 iterations) | 2026-09-08 |
| TD-7 | api | `RefreshToken` rows were never pruned; every login/refresh inserted a row and only flipped `revokedAt`, unbounded growth on Neon free | `6bfe977` (`repository.ts:91-95,126`, `server.ts:22`, test `auth.refresh.test.ts:78`) | 2026-09-08 |
| TD-8 | api | `RefreshToken` had no index on `userId`, but reuse detection and cascade delete both filter by it | `6bfe977` (migration `20260908084827_refresh_token_user_index`) | 2026-09-08 |
