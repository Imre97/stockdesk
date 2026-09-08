# Lessons Learned

Read this file in full before starting any module, before writing an implementation prompt for an agent, and before every fix round. Every entry is a rule derived from a real failure in this repository. Add an entry at the end of each module review cycle; never delete one, mark it `superseded` if a later rule replaces it.

Format: `L-<n>` id, source module and date, what happened, the rule, where it applies.

## Process

### L-1 Pre-review the spec before writing code

- Source: auth, 2026-09-08. Five separate question rounds interrupted implementation because the spec left things open: `displayName` limits, password maximum, rate limiting versus integration tests, the HTTP status of `VALIDATION_ERROR`, `WEB_DIST_DIR`, the `NOT_FOUND` code.
- Rule: before the first implementation agent starts, run one pass over the module spec that lists every ambiguity, every error code without a status, every environment variable missing from the spec's `.env.example` block, and every test-environment conflict (rate limits, timers, external calls). Ask the user once, in a batch, and record the answers in the spec before coding.
- Applies to: every module, the coordinating session.

### L-2 Name the invariant in every fix prompt

- Source: auth, 2026-09-08. A fix round said "logout deletes the presented token row". The agent implemented it literally and deleted rotated rows too, which erased the tombstones reuse detection depends on. A new blocker came out of a fix.
- Rule: when a fix touches authentication, authorization, money, or any state machine, the prompt states the invariant that must keep holding (for example "revoked refresh-token rows must survive until `expiresAt` so a replayed old cookie still triggers `REFRESH_REUSED`") and requires a test that asserts the invariant, not only the reported symptom.
- Applies to: every fix prompt, every agent doing the fix.

### L-3 Reviewer suggestions are options, not instructions

- Source: auth, 2026-09-08. The reviewer offered "delete the row on logout" as one fix. It was correct for live rows and wrong for revoked rows. Passing it on verbatim cost one review round.
- Rule: check every suggested fix against the module's invariants and the spec before handing it to an agent; rewrite it with the precise predicate.
- Applies to: the coordinating session.

### L-4 Do not end the turn while an agent runs tests on the shared test database

- Source: auth, 2026-09-08. The `Stop` hook ran `vitest` in `apps/api` while a subagent ran the same suite on `stockdesk_test`. Result: `TRUNCATE` deadlock and `409 EMAIL_TAKEN` from identical fixture emails, reported as failures that were not real.
- Rule: fixtures must be unique per test (random suffix, never a fixed email). While a subagent owns a test run, keep the turn open or accept that hook output is noise; a failure counts only when it reproduces in a solo run.
- Applies to: the coordinating session, `apps/api/test/helpers.ts` fixtures.
- Update 2026-09-08 (dashboard): the collision recurred six more times during Module 2 (TRUNCATE deadlocks, `Expected at least one account`, spurious 500s). Registered as TD-30: the hook should skip when another vitest run holds a repo-local lock. Fix it before Module 3 starts.
- Update 2026-09-08 (market-data): TD-30 closed the hook collision, and a second source of the same symptom appeared inside one file: a test emitted a simulated tick whose aggregator write was never awaited, the next test truncated the tables, and the write landed afterwards (`falls back to the newest cached candle close` failed in two of five full runs, never solo). Rule extension: every runtime, server or job a test builds is registered and stopped in `afterEach` (`stop()` awaits in-flight writes); a test that emits a tick awaits `flush()` before it ends.

### L-5 Tests first, with first-failure evidence, stays mandatory

- Source: auth, 2026-09-08. Every agent report quoted the first failing assertion before implementing. Each blocker fix was proven by a test that failed first (`expected [200, 200] to deeply equal [200, 401]`, `expected 429 not to be 429`). No regression slipped through where this was followed.
- Rule: every agent prompt requires the first failing line in the report. A fix without a failing test first is sent back.
- Applies to: every agent prompt.

## Design

### L-6 Every database state transition is a conditional write with a concurrent test

- Source: auth, 2026-09-08. Refresh rotation read a row with `findUnique` and revoked it with `update({ where: { id } })`. Two concurrent refreshes with the same cookie both succeeded, so one stolen token produced two live sessions and reuse detection never fired.
- Rule: a state transition is written as a conditional update (`updateMany({ where: { id, <expected state> } })`, `count === 0` means someone else won) or under a row lock, and the test fires the operation twice with `Promise.all` and asserts exactly one winner. This applies to token rotation, cash movements, order fills, transfers, and anything else with a "current state" column.
- Applies to: `apps/api/src/modules/**/repository.ts`, integration tests.

### L-7 Think through the production topology for every request-level feature

- Source: auth, 2026-09-08. Rate limiting keyed on `req.ip` without `trust proxy`. Behind Render's proxy every client shares one IP, so the limit was global, not per client.
- Rule: for anything that reads the client address, the scheme, or the host (rate limits, cookie `secure`, redirects, CORS), state how it behaves behind one proxy hop and test it with `X-Forwarded-For`. Use a fixed hop count, never `trust proxy: true`.
- Applies to: `apps/api/src/app.ts`, middleware.

### L-8 Every emitted error code is typed and documented when introduced

- Source: auth, 2026-09-08. A `NOT_FOUND` handler was added with a string literal; it was in neither the spec nor the shared union, and only a test would have caught drift.
- Rule: error codes live in a shared `as const` array and union (`AUTH_ERROR_CODES`, `API_ERROR_CODES`, combined `ErrorCode`); `AppError` and the error envelope are typed with the union; the module spec lists the code with its HTTP status in the same change that introduces it.
- Applies to: `packages/shared`, `apps/api/src/lib/errors.ts`, module specs.

### L-9 Rows that serve as evidence are never deleted by user-facing actions

- Source: auth, 2026-09-08. Rotated refresh tokens are tombstones for reuse detection. A logout implementation deleted them, so an attacker could hide reuse by calling the unauthenticated logout endpoint with the stolen value.
- Rule: identify rows that exist as evidence (revoked tokens, ledger entries, audit rows) and make every delete path carry a predicate that excludes them. Pruning happens by TTL in a job, not by a user action.
- Applies to: repositories, jobs, ledger and token tables.

### L-10 Lint rules are verified by a deliberate violation

- Source: auth, 2026-09-08. The scaffold agent probed every convention rule with a violation and confirmed it fired. Two gaps were still found later by review (decimal rule did not cover `apps/web/src/lib`, test override disabled more than intended) because the probes did not cover every path.
- Rule: when adding or changing an ESLint rule, probe one file per glob it should cover and one it should not, and record the probe result in the report.
- Applies to: `eslint.config.js` changes.

### L-11 Review rounds have a stop condition

- Source: auth, 2026-09-08. The module reached `PASS` in round 4. Rounds 5 and 6 reviewed a tech-debt burn round, and each produced new should-fix and nice-to-have items that triggered another fix round. Every review finds something; answering every finding with a fix round is an unbounded loop.
- Rule: per module, at most one implementation review, one fix round, and one confirming review. Once a module is `implemented`, a delta review (after a tech-debt round or a small follow-up) triggers a fix round only for blockers; should-fix and nice-to-have items go straight into `docs/TECH-DEBT.md` with a timing. Tech-debt rounds get no dedicated review; the next module's review covers them. If a module still has a blocker after the third round, stop and discuss with the user instead of scheduling round four.
- Applies to: the coordinating session, `.claude/skills/module-review/SKILL.md`.

### L-12 A session boundary resets every client cache

- Source: dashboard, 2026-09-08. Logout only cleared the auth store. Zustand domain stores and the TanStack Query cache survived, and the bootstrap skipped its fetches because the stores were already `loaded`, so a second user logging in within the same tab saw the first user's accounts, balances and settings. Found in the confirming review, not by any test.
- Rule: login, logout and session expiry are one boundary. Every client store, query cache and socket that holds user data is reset at that boundary through one function (`resetClientState`), the authenticated bootstrap is keyed by user id, and a test proves that after user A logs out and user B logs in, no value of A is observable. Every module that adds a store registers it in that reset.
- Applies to: `apps/web/src/features/auth/session-reset.ts`, every new zustand store, the module review checklist.

### L-13 Reviews find data-flow bugs that unit tests do not

- Source: dashboard, 2026-09-08. Two of three blockers were data-flow mismatches between components that each passed their own tests: the deposit list bound to the sidebar-active account while the form deposited into its own selection, and the logout path above. Each unit was correct; the seam was wrong.
- Rule: for every page that combines two sources of state (a form selection and a global active item, a cache and a store, a socket and a store), write the seam down as an invariant in the spec pre-review and add one test that crosses the seam (or an e2e case), before the module review.
- Applies to: spec pre-review (L-1), web feature prompts.

### L-14 Fixtures for a mapper come from the serializer's real output

- Source: market-data, 2026-09-08. The API serialized `dividendYield` as a fraction (`"0.0130"`); the web mapper test used a made-up fixture (`"1.25"`) that looked like a percentage, so `formatChangePercent` produced the "right" string in the test and `0.01%` on the page. Both sides were green.
- Rule: when a web mapper consumes an API field, the test fixture is copied from the API's own test output or from the serialization decision recorded in the spec (places and unit), never invented. Units (fraction versus percent, millions versus full) are written into the spec's serialization list before either side is implemented.
- Applies to: web mapper tests, spec pre-review (record units next to decimal places).

### L-15 A changed definition needs a sweep of every consumer of the old arithmetic

- Source: market-data, 2026-09-08. Daily buckets moved from UTC midnight to New York midnight stepped through the calendar, but `candles.ts` still decided bucket completeness with the fixed `timeframeDurationMs`, so a finished February `1M` bar was dropped as incomplete while its interval was marked covered.
- Rule: when a fix changes how a value is defined (bucket start, day boundary, rounding, identifier), the fix prompt lists every consumer of the old helper (`grep` for the helper and for hand-written equivalents) and each one gets a test at the divergent case (a 28-day month, a 25-hour day). Marking coverage and storing bars must move together: nothing is marked covered that was not stored.
- Applies to: fix prompts (L-2), time and calendar code, cache invariants.

### L-16 Phase size predicts test-first slippage

- Source: market-data, 2026-09-08. The seven-part Phase C agent reported honestly that parts 2 to 7 were implemented before their integration tests and proven afterwards with negative-control runs; every smaller phase (A, B1, B2, D, G1) stayed red-green throughout.
- Rule: an implementation phase given to one agent covers at most three or four related parts and one test layer; the prompt asks for the first failing assertion per part and the report is checked for it. When a phase grows past that, split it before launching.
- Applies to: the coordinating session, agent prompts.

### L-17 Test harness order: prepare the database where the server is started

- Source: market-data, 2026-09-08. Playwright boots the web servers before `globalSetup`, so the API seeded the symbol master at boot and the global setup truncated it, leaving the e2e run without symbols (the same ordering that produced TD-22's noise).
- Rule: anything the server needs at boot is prepared inside the web server command (migrate, truncate) before the server starts, and the global setup only waits for a readiness signal (`GET /api/v1/health` `ready: true`). The parent process holds the original environment, so guards that compare database URLs run in the Playwright config, not in the child command.
- Applies to: `apps/e2e/playwright.config.ts`, `prepare-database.ts`, `global-setup.ts`, every job that seeds data at boot.

## Record of module cycles

| Module | Date | Review rounds | Blockers found | Root causes |
|--------|------|---------------|----------------|-------------|
| auth | 2026-09-08 | 4 to `implemented` (BLOCKED, PASS WITH SHOULD-FIX, BLOCKED, PASS), then 2 delta rounds on the tech-debt burn that should not have triggered fix rounds | 3 | L-6, L-7, L-2 with L-9; loop: L-11 |
| dashboard | 2026-09-08 | 3 (BLOCKED, BLOCKED, final delta); pre-review (L-1) batched 33 spec gaps into 4 user questions | 3 | untested hook (test plan not enforced), deposit page seam (L-13), logout state leak (L-12); SQL `AT TIME ZONE` on a `timestamp` column found as should-fix |
