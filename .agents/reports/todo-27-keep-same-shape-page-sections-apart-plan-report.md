# Implementation Report

**Plan**: `.agents/plans/completed/todo-27-keep-same-shape-page-sections-apart-plan.md`
**Branch**: `feature/todo-27-keep-same-shape-page-sections-apart`
**Status**: COMPLETE

## Summary

Stage 5 (`detectRepetition`) no longer collapses page bands. `detectRepetition(root)` now computes the band ids once with `findDigestBands(root)` and recurses through a private `collapseRepeats(node, bandIds)`. Bands are left out of the signature counts and passed through unchanged, so they get no `instanceCount` and no `varianceNote`. Everything inside a band and everything outside `main` collapses as before. On `saas-landing`, the pricing section is back as its own band (`SiteHeader, Hero, GridSection, Section, Section, Section, SiteFooter`), and the fixture scores 100%. The public signature is unchanged, so the Stage 7b secondary-viewport derivations get the same exemption. Comments in `sections.ts`, the Stage 5 contract in `structure-lane.md`, the eval note in `eval.md` and the baseline were updated. Owner decisions applied: `sections[].instances` and its reader branches stay as they are (only the comment was corrected), and `expected.yaml` is byte-identical.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 0 | Apply the prototype patch (`git apply --check` passed, then applied) | `lib/extract/structure/repetition.ts` | PASS |
| 1 | Reproduction red before the patch, green after it; eval at 100% | `scratch-218-check.ts` (temporary, deleted) | PASS |
| 2 | Correct the Stage 9 header comment and the `findDigestBands` doc | `lib/extract/structure/sections.ts` | PASS |
| 3 | Document the Stage 5 contract ("Three…" stages, new Stage 5 bullet, Stage 9 consumer list) | `docs/architecture/structure-lane.md` | PASS |
| 4 | Drop the "scores below 1.00" clause | `docs/architecture/eval.md` | PASS |
| 5 | `UPDATE_BASELINE=1 npm run eval` → `saas-landing: 1`; `eval/corpus/` untouched | `eval/baseline.json` | PASS |
| 6 | Full gate after `verify.sh down` | whole tree | PASS |

## Validation Results

| Check | Result | Command / environment |
|-------|--------|-----------------------|
| Type check | PASS | `npm run check` (step `tsc --noEmit`); also `npm run typecheck` after Task 2 — host, Node v22 |
| Lint | PASS | `npm run check` (step `eslint .`); also `npm run lint` after Task 2 — host |
| Build | PASS | `npm run check` (step `next build`, `✓ Compiled successfully`) — host, after `verify.sh down` |
| Tests (eval gate) | PASS (4 of 4 sites at 100%, `aggregate combined: 100%`, `✓ all gates passed`) | `npm run eval`, and inside `npm run check` — host |
| Corpus unchanged | PASS | `git diff --exit-code eval/corpus/` — host |
| Doc checks | PASS | `grep -n "Stage 5 (\`repetition.ts\`)" docs/architecture/structure-lane.md` (line 10); `grep -c "scores below 1.00" docs/architecture/eval.md` → `0` |
| E2E: `verify.sh up` + `doctor` | PASS (no `FAIL`, `head e6ee0cb-dirty`, `ai-lane off`) | `.claude/skills/verify/scripts/verify.sh up`, `verify.sh doctor` |
| E2E: `verify.sh drive analyze-url --target saas-landing` | PASS (all checks `ok`, exit 0) | evidence `.verify/runs/20261102-115132-1011756/evidence/analyze-url-115450/` |
| E2E: sections list | PASS — `SiteHeader, Hero, GridSection, Section, Section, Section, SiteFooter`, no `×N` on any band | `jq … response.json` from the plan |
| E2E: `structure.md` digest | PASS — features `Section` (`SectionCard ×6`) at 4, pricing `Section` (`SectionCard ×3`) at 5, FAQ `Section` at 6, `SiteFooter` at 7 | `structure.md` |
| E2E: responsive alignment | PASS — pricing band carries `CardGrid: 390px \`grid · 1col\` → 768px \`grid · 2col\` → 1440px \`grid · 3col\`` | `structure.md` |
| E2E: console errors | PASS — `console-errors.txt` is empty (0 bytes) | `wc -c console-errors.txt` |
| Reproduction | PASS — red before the fix (exit 1: `FAIL two same-shape bands stay two nodes`, `FAIL card grid still collapses to ×4`, `FAIL FAQ details still collapse to ×2`), green after it (exit 0, seven `ok` lines) both right after the patch and again after the last task | `npx tsx scratch-218-check.ts` — host, project root |

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/extract/structure/repetition.ts` | UPDATE | +15/-3 |
| `lib/extract/structure/sections.ts` | UPDATE | +6/-5 |
| `docs/architecture/structure-lane.md` | UPDATE | +3/-2 |
| `docs/architecture/eval.md` | UPDATE | +1/-1 |
| `eval/baseline.json` | UPDATE | +1/-1 |
| `.agents/issues/todo-issues.md` | pre-existing change, not part of this work (not touched, not staged) | — |

Nothing was committed or staged.

## Deviations from Plan

- **Task 1, red run:** the plan takes the red run from a detached worktree of `e6ee0cb`. On this run the working tree still held exactly HEAD's code when the branch was created, since the only tracked change was the off-limits `.agents/issues/todo-issues.md`. So the red run was done in place before `git apply`, and the green run after it. Same code, same result as recorded in the plan (lines 1, 3 and 4 `FAIL`, exit 1).
- **Scratch script lifetime:** it was kept until after the final re-run, as the skill's bug-fix rule asks (green again after the last task), and then deleted before `npm run check`. Plan Task 1 deletes it right after the first green run.
- None in code: the prototype patch applied cleanly, and Tasks 2–5 match the plan's wording.

## Tests Written

No unit test framework exists (`AGENTS.md`). The change was covered by the `npm run eval` gate (`saas-landing` 96% → 100%, the other three unchanged at 100%) and by the temporary scratch script `scratch-218-check.ts`, which has seven checks (two same-shape bands stay two; no band varianceNote; card grid ×4; FAQ details ×2; nav links ×3; footer columns ×2; a page with no `main` keeps today's collapse). The script was deleted after use.
