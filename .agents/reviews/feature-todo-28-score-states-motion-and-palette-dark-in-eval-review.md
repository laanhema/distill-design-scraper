# Code Review: feature/todo-28-score-states-motion-and-palette-dark-in-eval

**Scope**: branch `feature/todo-28-score-states-motion-and-palette-dark-in-eval` against merge base `a1d470f` (no commits yet; all changes uncommitted), checked against issue #221
**Recommendation**: APPROVE WITH NITS

## Summary

Reviewed the eval-harness changes in `eval/score.ts` and `eval/run.ts`, the corpus entry and `adversarial-shell` spec additions, the new `two-scheme` fixture with its capture and spec, the baseline, `docs/architecture/eval.md`, and the two verify-skill doc lines. The plan, prototype patch and implementation report under `.agents/` were read as context. The pre-existing change to `.agents/issues/todo-issues.md` is unrelated owner work and was left out of the review, as the caller asked. The change is small, well-scoped and meets every acceptance criterion. One Medium edge case in `scoreMotion` matching and one Low note about the gate's margin remain.

Acceptance criteria:
- **`expectedSpecSchema` and the scorer accept and score `states` and `motion`, and `adversarial-shell/expected.yaml` lists its hover/focus states and motion values: met.** The schema has optional `states`/`motion` with `min(1)` (`eval/score.ts:68-70`). A scratch `extractFromCapture` run on the `adversarial-shell` capture gives exactly one state (`primary hover background-color #6d28d9 → #5b21b6`), one transition (`Button background-color 150ms ease`) and no focus state. The spec lists both (`eval/corpus/adversarial-shell/expected.yaml:48-51`).
- **A two-scheme fixture joins the corpus with a committed capture and `expected.yaml`, and its `paletteDark` is scored: met.** `eval/fixtures/two-scheme.html`, `eval/corpus.ts:35`, and `eval/corpus/two-scheme/{capture.json,expected.yaml}` are present. The extracted `paletteDark` has `provenance: measured`, and its six roles match the fixture's dark tokens exactly. `npm run eval` prints `two-scheme … dark 100%`.
- **A deliberately wrong expected `states`, `motion` or `paletteDark` value lowers that site's score and fails `npm run eval`: met.** Re-run independently in a scratch worktree of the change. A wrong state `to`, a wrong state `property`, a wrong motion `timingFunction` and a wrong motion `delayMs` each give `adversarial-shell 90% < baseline 100%`, exit 1. A wrong `paletteDark` `muted` gives `two-scheme 98% < baseline 100%`, exit 1. A `to` within ΔE 2 still passes, as designed.
- **The four existing fixtures keep their scores, and `eval/baseline.json` gains the new site in a deliberate refresh: met.** `npm run eval` on the merge base and on the change both print 100% for `clean-light`, `dark-mode`, `adversarial-shell` and `saas-landing`. The baseline diff only adds `"two-scheme": 1`. No existing `capture.json` changed.
- **`npm run check` passes: met.** See Validation Results.

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority

- **M1** `eval/score.ts:230` — `scoreMotion` takes the first report entry with the same `target`/`kind`/`property`, but `extractMotion` keeps one entry per distinct duration, timing function and delay (`lib/extract/motion.ts:22`). So a spec entry that matches the second such entry scores as a miss. **Why:** a page with two button variants that transition `background-color` at different speeds (150ms and 300ms) yields two `Button transition background-color` entries. A spec that asserts the 300ms one reads `expected 300ms ease, got 150ms ease` and fails the gate, although the report holds exactly that entry. A scratch call to `scoreMotion` with those two entries confirmed `accuracy 0`. This breaks the recall-only contract that `docs/architecture/eval.md:10` states. **Fix:** match against every candidate with the same `target`/`kind`/`property` (e.g. `candidates.some(ok)`), and when none matches, put the candidates' values in the miss note.

### Suggestions (Low)

- **L1** `eval/score.ts:247-251` — each extra lane weighs 0.1, so one wrong entry in a lane with *n* entries lowers the site by 0.1/*n*. That is only more than `REGRESSION_EPS` (0.01, `eval/run.ts:30`) while *n* ≤ 9. **Why:** today's specs have 1, 1 and 6 entries, so AC 3 holds (the `paletteDark` case clears the margin by only 0.0067). But a later spec that lists 10 or more dark roles, states or motion entries would let one wrong value through the gate without any warning. **Fix:** say in the `EXTRA_LANE_WEIGHT` comment (and the `eval.md` paragraph) that one wrong entry only fails the gate while a lane lists fewer than 10 entries, or have `loadExpectedSpec` reject an extra-lane list longer than `EXTRA_LANE_WEIGHT / REGRESSION_EPS`.

**Noted, not a finding**: `saas-landing`'s states and motion stay unscored, and the `drive.ts` usage comment (`.claude/skills/verify/scripts/drive.ts:7`) does not list the new fixture. The issue and the plan both scoped these out. `.agents/PRDs/PRD.md:298` and `:467` still say the corpus has four fixtures. That is PRD drift for `/update-prd`, which this issue does not cover. The `TODO.md:10` checkbox is closed by the done flow.

## Validation Results

| Check | Status | Notes |
|-------|--------|-------|
| Build / Type Check | PASS | `npm run check` (the command CI runs): `tsc --noEmit` and `next build` steps; host |
| Warnings | NONE | No `warn`/`error` lines in the `npm run check` output |
| Lint | PASS | `eslint .` step of `npm run check`; host |
| Tests | PASS | `eval` step of `npm run check`: 5 sites at 100%, `✓ all gates passed`. `stripe`, `linear` and `vercel` are skipped by design (`optional: true`, no capture). Also ran: `eval/run.ts` on the merge-base worktree (4 sites at 100%), and 6 wrong-value mutations in a scratch worktree of the change (5 fail the gate as expected, 1 within-tolerance control passes) |
| UI verification | N/A | Eval harness and docs only; nothing a user sees changes |

## What's Good

- The extra-lane weighting leaves the old formula unchanged when no extra lane is present, so the existing specs keep their exact scores. The doc comments explain why.
- The tighter state ΔE (2 instead of 12) rests on a measured hover-pair distance. Without it, a wrong `to` equal to the base color would still score as a match.
- `min(1)` on the list lanes and the strict schemas keep the "missing spec part scores as full marks" trap closed.
- The new fixture is minimal and deterministic, its `paletteDark` is measured rather than inferred, and only the new site's capture was added.

## Recommendation

Fix M1 (and optionally L1) with `/fix-findings`. Neither blocks the acceptance criteria.
