# Technical Debt Register

Last updated: 2026-09-08

## Summary
- Open: 13 (high 0, medium 8, low 5)
- Fixed since last update: 2
- Trend: the auth review's second pass closed both `now`-timing items (RefreshToken pruning and its `userId` index); remaining open items are deferred polish and maintainability items, none blocking.
- Recommended next: TD-2 (AC8 has no automated guard), TD-4 (production static-serving path untested end to end), TD-5 (i18n locale catalogs statically bundled).

## Open
| Id | Area | Summary | Impact | Effort | Timing | Source | Status |
|----|------|---------|--------|--------|--------|--------|--------|
| TD-1 | api | AC9 (no monetary field is a JSON number) is asserted over responses with no monetary fields, vacuous until Module 2 exposes accounts | medium | S | module: accounts | docs/reviews/2026-09-08-auth.md | open |
| TD-2 | api | AC8 (case-insensitive search over non-English text finds nothing) has no automated guard, only a manual scan | medium | S | later | docs/reviews/2026-09-08-auth.md | open |
| TD-3 | web | `LoginForm.tsx` uses raw Tailwind palette classes (`text-red-700`, `bg-neutral-900`) instead of CSS-variable tokens, no `.dark` variant | low | S | later | docs/reviews/2026-09-08-auth.md | open |
| TD-4 | infra | Production static-serving path (helmet CSP + `express.static` SPA fallback + one-origin cookie) is only covered by a non-helmet unit test, never exercised end to end | medium | M | later | docs/reviews/2026-09-08-auth.md | open |
| TD-5 | web | `apps/web/src/i18n/index.ts` statically imports every locale catalog into the main chunk; grows with each namespace | medium | S | module: next module that adds a namespace | docs/reviews/2026-09-08-auth.md | open |
| TD-6 | api | `express.json()` uses the 100 kb default limit on endpoints whose largest body is three short strings | low | S | later | docs/reviews/2026-09-08-auth.md | open |
| TD-9 | shared | Dead exports without consumers: `resetConfigCache`, `useAuth`, `useRequireAuth`, `isDecimalString`, `wsAuthenticatedUserId` (last is Module 2 groundwork) | low | S | later | docs/reviews/2026-09-08-auth.md | open |
| TD-10 | api | `trust proxy` hop count is hard-coded (`app.ts:56`, constant at `:16`) instead of read from config, so a deployment without a proxy in front lets the client forge `X-Forwarded-For` and get a fresh rate-limit bucket per request | medium | S | later | docs/reviews/2026-09-08-auth-2.md | open |
| TD-11 | api | Three `as RotationResult` casts in `repository.ts:106,118,123` defeat return-type checking inside the rotation transaction; annotate the callback return type instead | low | S | later | docs/reviews/2026-09-08-auth-2.md | open |
| TD-12 | api | Boot-time refresh-token pruning (`server.ts:22-24`) is untestable because `server.ts` starts listening on import; extract into a testable `runBootTasks()` | medium | S | later | docs/reviews/2026-09-08-auth-2.md | open |
| TD-13 | api | `eslint.config.js:125-131` test override also disables `no-restricted-syntax`, not just `no-restricted-imports` as the accepted decision covered, letting test files do `parseFloat`/`toFixed` money math | low | S | later | docs/reviews/2026-09-08-auth-2.md | open |
| TD-14 | api | Every successful refresh rotation awaits an extra `DELETE` round trip (`repository.ts:126`) in the request path, adding latency on the SPA's most frequent call on a cold Neon compute; prune at boot plus on a schedule instead | medium | S | later | docs/reviews/2026-09-08-auth-2.md | open |
| TD-15 | api | The refresh-reuse race test (`auth.refresh.test.ts:55-76`) repeats 5 iterations at bcrypt cost 12 (10 hashes plus 5 truncations); 2 iterations give the same signal at roughly 60% less suite time | low | S | later | docs/reviews/2026-09-08-auth-2.md | open |

## Closed
| Id | Area | Summary | Fixed in | Closed on |
|----|------|---------|----------|-----------|
| TD-7 | api | `RefreshToken` rows were never pruned; every login/refresh inserted a row and only flipped `revokedAt`, unbounded growth on Neon free | `6bfe977` (`repository.ts:91-95,126`, `server.ts:22`, test `auth.refresh.test.ts:78`) | 2026-09-08 |
| TD-8 | api | `RefreshToken` had no index on `userId`, but reuse detection and cascade delete both filter by it | `6bfe977` (migration `20260908084827_refresh_token_user_index`) | 2026-09-08 |
