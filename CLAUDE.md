# StockDesk

Paper-trading demo: place market/limit orders on US stocks, watch live prices on a real-time chart, track portfolio value. Monorepo with React + Vite web app and Express API.

## Layout

```
stockdesk/
├── apps/web        # React + Vite + TypeScript, TanStack Router (file-based)
├── apps/api        # Express + TypeScript, Prisma + SQLite, ws
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

## Stack

React 19, Vite, TypeScript strict, TanStack Router, TanStack Query, Zustand, Tailwind CSS, shadcn/ui, i18next, TradingView Lightweight Charts, Express 5, Prisma, SQLite, ws, zod, decimal.js, Vitest, Playwright.

Details: `docs/01-architecture.md`. Conventions: `docs/02-conventions.md`.

## Commands

Filled in as workspaces are scaffolded.

```
npm install
npm run dev      # web + api concurrently
npm test
npm run lint
```

## Workflow

1. Read `docs/00-overview.md` for module status.
2. Read the module spec in `docs/modules/`.
3. Write the tests for the acceptance criteria first. Run them, confirm they fail.
4. Implement until the tests pass. Refactor with the tests green.
5. Run `/module-review <module>`. Fix blockers and should-fix items.
6. Update module status in `docs/00-overview.md`.
