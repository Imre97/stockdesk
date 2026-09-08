# Review Process

Three layers. Each catches a different class of problem at a different cost.

## Layer 1: deterministic gates (hooks, no AI)

Configured in `.claude/settings.json`, scripts in `scripts/hooks/`.

| Event | Script | What it does | On failure |
|-------|--------|--------------|------------|
| After every `Edit` or `Write` | `scripts/hooks/lint-file.mjs` | Runs ESLint with `--fix` on the edited `.ts`/`.tsx` file, then re-checks. Skips non-source files and runs silently when ESLint is not installed yet. | Prints the ESLint output back to the assistant, which must fix it before moving on. |
| When the assistant finishes a turn (`Stop`) | `scripts/hooks/run-tests.mjs` | Runs `vitest run` in every workspace that has changed files since the last successful run. Skips when no workspace exists. | Blocks the stop and feeds the failing test output back so the turn continues with a fix. |

Convention enforcement lives in ESLint so it never depends on a reviewer's attention:

- `max-lines: 400` on every source file.
- `no-restricted-syntax`: `Number(...)`, `parseFloat`, `parseInt`, `Math.round`, `.toFixed` on non-Decimal values are forbidden under `apps/api/src/modules/**`, `apps/web/src/features/**`, `packages/shared/src/**`.
- `no-restricted-imports`: files matching `*.tsx` may not import `./api`, `../api`, or anything under `lib/http`.
- `eslint-plugin-i18next` (`no-literal-string`) on `apps/web/src/**/*.tsx`.
- `no-warning-comments` for `TODO` without an issue reference; `no-inline-comments`.

The exact ESLint configuration is created with the workspace scaffold in Module 1.

## Layer 2: module review (agents, on demand)

`/module-review <module>` runs the gate described in `.claude/skills/module-review/SKILL.md`:

1. lint and tests,
2. `module-reviewer` agent (`.claude/agents/module-reviewer.md`) checks acceptance-criteria coverage, spec drift, money math, concurrency, security, conventions, test quality, and lists optimization opportunities,
3. report saved to `docs/reviews/<date>-<module>.md` and indexed in `docs/reviews/README.md`,
4. `tech-debt-auditor` agent (`.claude/agents/tech-debt-auditor.md`) updates `docs/TECH-DEBT.md`,
5. verdict decides whether the module may move to `implemented` in `docs/00-overview.md`.

Rule: no module status changes to `implemented` without a `PASS` report and zero open blockers.

Existing generic tools the reviewer may call for depth: `/code-review`, `/security-review`, `/simplify`.

## Layer 3: continuous and scheduled

- While developing: in a second Claude Code session run `/loop 30m /module-review <module> --quick`. It re-runs the gate every 30 minutes on the module in progress and reports only changes.
- Repository: `https://github.com/Imre97/stockdesk`.
  - Daily cloud routine (created with `/schedule` in Claude Code): `/module-review` for every module marked `implemented`, then the `tech-debt-auditor`, commit the updated register and reports on a `chore/review-<date>` branch and open a pull request. Manage it with `/schedule list` and `/schedule update`.
  - `.github/workflows/claude-review.yml` runs the Claude Code GitHub Action on every pull request for an inline review. Requires the `ANTHROPIC_API_KEY` repository secret (Settings, Secrets and variables, Actions).

Hooks in `.claude/settings.json` are picked up when Claude Code starts in this directory. After adding them in a running session, open `/hooks` once or restart the session.

## Where things land

```
.claude/
├── settings.json                # hooks
├── agents/module-reviewer.md
├── agents/tech-debt-auditor.md
└── skills/module-review/SKILL.md
scripts/hooks/lint-file.mjs
scripts/hooks/run-tests.mjs
docs/reviews/README.md           # index of review reports
docs/reviews/<date>-<module>.md
docs/TECH-DEBT.md                # living register
.github/workflows/claude-review.yml
```
