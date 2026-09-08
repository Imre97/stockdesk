# Technical Debt Register

Last updated: 2026-09-08

## Summary
- Open: 8 (high 1, medium 5, low 2)
- Fixed since last update: 0
- Trend: first debt registered for `auth`; blockers and should-fix findings from the 2026-09-08 review are being fixed in this session and are not carried here, only deliberately deferred items.
- Recommended next: TD-2 (AC8 has no automated guard), TD-7 (RefreshToken has no pruning), TD-8 (RefreshToken has no index on userId).

## Open
| Id | Area | Summary | Impact | Effort | Timing | Source | Status |
|----|------|---------|--------|--------|--------|--------|--------|
| TD-1 | api | AC9 (no monetary field is a JSON number) is asserted over responses with no monetary fields, vacuous until Module 2 exposes accounts | medium | S | module: accounts | docs/reviews/2026-09-08-auth.md | open |
| TD-2 | api | AC8 (case-insensitive search over non-English text finds nothing) has no automated guard, only a manual scan | medium | S | later | docs/reviews/2026-09-08-auth.md | open |
| TD-3 | web | `LoginForm.tsx` uses raw Tailwind palette classes (`text-red-700`, `bg-neutral-900`) instead of CSS-variable tokens, no `.dark` variant | low | S | later | docs/reviews/2026-09-08-auth.md | open |
| TD-4 | infra | Production static-serving path (helmet CSP + `express.static` SPA fallback + one-origin cookie) is only covered by a non-helmet unit test, never exercised end to end | medium | M | later | docs/reviews/2026-09-08-auth.md | open |
| TD-5 | web | `apps/web/src/i18n/index.ts` statically imports every locale catalog into the main chunk; grows with each namespace | medium | S | module: next module that adds a namespace | docs/reviews/2026-09-08-auth.md | open |
| TD-6 | api | `express.json()` uses the 100 kb default limit on endpoints whose largest body is three short strings | low | S | later | docs/reviews/2026-09-08-auth.md | open |
| TD-7 | api | `RefreshToken` rows are never pruned; every login/refresh inserts a row and only flips `revokedAt`, unbounded growth on Neon free | high | S | now | docs/reviews/2026-09-08-auth.md | open |
| TD-8 | api | `RefreshToken` has no index on `userId`, but reuse detection and cascade delete both filter by it | medium | S | now | docs/reviews/2026-09-08-auth.md | open |
| TD-9 | shared | Dead exports without consumers: `resetConfigCache`, `useAuth`, `useRequireAuth`, `isDecimalString`, `wsAuthenticatedUserId` (last is Module 2 groundwork) | low | S | later | docs/reviews/2026-09-08-auth.md | open |

## Closed
| Id | Area | Summary | Fixed in | Closed on |
|----|------|---------|----------|-----------|
