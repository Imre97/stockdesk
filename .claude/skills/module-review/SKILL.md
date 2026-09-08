---
name: module-review
description: Run the StockDesk module review gate for one module - lint, tests, spec-compliance review by the module-reviewer agent, tech-debt register update, review report saved under docs/reviews. Use after implementing a module and before marking it implemented, or on a loop while developing. Usage - /module-review <module-name> [--quick]
---

# Module review gate

Argument: `$ARGUMENTS` = module name matching a file in `docs/modules/` (`auth`, `dashboard`, `market-data`, `orders`, `portfolio`). Optional `--quick` skips the tech-debt pass.

Run the steps in order. Each step is a gate: a failure stops the run and the report says which gate failed.

## 1. Deterministic checks

```
npm run lint
npm test -- --run
```

Run from the repository root. If workspaces are not scaffolded yet, report that and stop. Capture failures verbatim; do not fix code in this skill.

## 2. Spec-compliance review

Spawn the `module-reviewer` agent with the module name and the lint and test output. Wait for its report.

## 3. Save the report

Write the agent's report to `docs/reviews/<YYYY-MM-DD>-<module>.md` (append `-2`, `-3` for repeated runs on one day). Add one line to the table in `docs/reviews/README.md`: date, module, verdict, blockers count, link.

## 4. Tech debt register

Unless `--quick`: spawn the `tech-debt-auditor` agent pointing at the new report. It updates `docs/TECH-DEBT.md`.

## 5. Status update

- Verdict `PASS`: set the module status to `implemented` in `docs/00-overview.md` if the user asked for the status change, otherwise say the module is eligible.
- Verdict `PASS WITH SHOULD-FIX` or `BLOCKED`: leave the status; list the blockers and should-fix items as the next tasks.
- Stop condition (`docs/05-lessons.md` L-11): a module gets at most one implementation review, one fix round, and one confirming review. When the module is already `implemented`, only blockers trigger a fix round; should-fix and nice-to-have items are registered in `docs/TECH-DEBT.md` with a timing and no further round is scheduled.

## 6. Lessons

When the verdict is `PASS`, or when a blocker was found, append to `docs/05-lessons.md`: one `L-<n>` entry per new root cause (source, what happened, rule, where it applies) and one row in the "Record of module cycles" table. Skip entries that repeat an existing rule; reference the existing id in the table instead.

## 7. Summary to the user

Verdict, gate results, counts of blockers / should-fix / nice-to-have, top three optimization opportunities, tech-debt summary line, path of the saved report. No more than 15 lines.
