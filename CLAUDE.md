# StockDesk

Paper-trading demo: place market/limit orders on US stocks, watch live prices on a real-time chart, track portfolio value. Monorepo with React + Vite web app and Express API.

## Layout

```
stockdesk/
├── apps/web        # React + Vite + TypeScript, TanStack Router (file-based)
├── apps/api        # Express + TypeScript, Prisma + PostgreSQL, ws; serves the web build in production
├── apps/e2e        # Playwright end-to-end suite (own workspace, no unit tests)
├── packages/shared # zod schemas, shared types, Decimal helpers
└── docs/           # specifications (read before implementing anything)
```

## Non-negotiable rules

1. **English only.** Docs, comments, identifiers, placeholders, seed data, test names, commit messages. Single exception: translated UI strings inside `apps/web/src/i18n/locales/<lang>/*.json` for non-English locales. Nothing else in the repo may contain another language.
2. **Spec first, one module at a time.** Every module has `docs/modules/<name>.md`. Do not implement a module that is not marked `specified` in `docs/00-overview.md`. Do not touch modules outside the current task.
3. **No native `number` for money, prices, quantities.** Use `Decimal` from `@stockdesk/shared` (decimal.js). Prisma columns are `Decimal`. API JSON carries them as strings.
4. **Render and logic stay apart.** `.tsx` files contain JSX and hook calls only. Business rules, fetching, calculations live in `.ts` files under `features/<domain>/` (zustand store, api, hooks, mappers).
5. **File size.** Soft limit 300 lines, hard limit 400 lines per `.ts`/`.tsx` file. Split before crossing.
6. **Comments.** No inline comments by default. One short block comment above a function only when the algorithm is genuinely non-obvious. No commented-out code.
7. **File-based routing on web.** Routes live in `apps/web/src/routes/`. `routeTree.gen.ts` is generated, never hand-edited.
8. **Tests first.** Every implementation task starts by writing the automated tests that encode the expected behavior (from the module spec's acceptance criteria), watching them fail, then writing the code that makes them pass. No production code without a failing test that demands it.
9. **Review gate.** A module moves to `implemented` only after `/module-review <module>` returns `PASS` with zero blockers. Reports live in `docs/reviews/`, open debt in `docs/TECH-DEBT.md`. Process: `docs/03-review-process.md`.
10. **No guessing. Stop and ask.** When an error, a risk, an ambiguity in the spec, a failing test with an unclear cause, a dependency conflict, or a decision with more than one reasonable answer comes up, the agent does not pick an option on its own. It stops, states the problem and the options in a few lines, and waits for the user's answer. This applies to the main session and to every subagent. Do not work around a blocker silently, do not weaken a test to make it pass, do not change a spec to match the code.
11. **Secrets never enter git.** API keys, JWT secrets, database URLs with credentials, tokens, certificates, cookies, and any `.env` file except `.env.example` stay out of the repository, out of code, out of docs, out of tests, out of fixtures, and out of commit messages. Every secret is read from the environment through the validated config module, documented by name only in `.env.example`. The pre-commit hook `scripts/hooks/check-secrets.mjs` blocks commits that contain secret-like values; do not bypass it. If a secret ever lands in git history, stop and tell the user immediately.

## Stack

React 19, Vite, TypeScript strict, TanStack Router, TanStack Query, Zustand, Tailwind CSS, shadcn/ui, i18next, TradingView Lightweight Charts, Express 5, Prisma, PostgreSQL 16, ws, zod, decimal.js, Vitest, Playwright. Hosting: Render free (API + web build, one origin) and Neon free (database).

Details: `docs/01-architecture.md`. Conventions: `docs/02-conventions.md`. Deployment: `docs/04-deployment.md`.

## Commands

```
docker compose up -d       # local PostgreSQL (stockdesk + stockdesk_test + stockdesk_e2e databases)
npm install                # installs workspaces and runs prisma generate
npm run dev                # shared watch + api (:3000) + web (:5173) concurrently
npm run build              # shared -> web -> api -> prisma generate
npm start                  # node apps/api/dist/server.js
npm run lint               # eslint . (flat config at the repository root)
npm run typecheck          # tsc --noEmit in every workspace
npm test -- --run          # vitest in every workspace
npm run e2e:install        # one-off: download the Playwright chromium browser
npm run e2e                # Playwright end-to-end suite (starts api + web itself)
npm run db:migrate         # prisma migrate dev
npm run db:migrate:deploy  # prisma migrate deploy
npm run db:generate        # prisma generate
npm run db:studio          # prisma studio
```

## Workflow

1. Read `docs/00-overview.md` for module status.
2. Read the module spec in `docs/modules/`.
3. Write the tests for the acceptance criteria first. Run them, confirm they fail.
4. Implement until the tests pass. Refactor with the tests green.
5. Run `/module-review <module>`. Fix blockers and should-fix items.
6. Update module status in `docs/00-overview.md`.
