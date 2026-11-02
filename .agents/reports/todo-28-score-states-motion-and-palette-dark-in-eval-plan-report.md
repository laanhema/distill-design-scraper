# Implementation Report

**Plan**: `.agents/plans/completed/todo-28-score-states-motion-and-palette-dark-in-eval-plan.md`
**Branch**: `feature/todo-28-score-states-motion-and-palette-dark-in-eval`
**Status**: COMPLETE

## Summary

`npm run eval` now scores the `states`, `motion` and `paletteDark` lanes when an `expected.yaml` asserts them. `expectedSpecSchema` gains three optional keys (`states`, `motion`, `paletteDark`). Two new recall-only scorers, `scoreStates` and `scoreMotion`, were added; `states` colors match at ΔE ≤ 2. `paletteDark` reuses `scorePalette`, which now accepts `Palette | undefined`. Each scored extra lane takes a 0.1 share of `combinedScore` (`EXTRA_LANE_WEIGHT`), and the old weighting keeps the rest, so specs without these lanes keep their exact scores. `adversarial-shell/expected.yaml` now asserts its one hover state and one transition. A new fixture, `two-scheme`, redefines its CSS variables under `prefers-color-scheme: dark`. It joins the corpus with a committed capture and a spec that scores `paletteDark`.

Owner decisions on the Open Questions: (1) scoring is recall-only, so extra extracted entries cost nothing; (2) each extra lane weighs 0.1 on top of the unchanged base weighting. Both match the plan's proposed defaults, and the prototype patch already implemented them.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 0 | Apply prototype patch (`git apply --check` clean) | `eval/score.ts`, `eval/run.ts`, `eval/corpus.ts`, `eval/fixtures/two-scheme.html`, `eval/corpus/two-scheme/expected.yaml`, `eval/corpus/adversarial-shell/expected.yaml` | PASS |
| 1 | Capture only the new fixture (`npm run eval:capture -- two-scheme` → `ok (29 nodes)`); no existing `capture.json` modified | `eval/corpus/two-scheme/capture.json` | PASS |
| 2 | Deliberate baseline refresh; diff adds only `"two-scheme": 1` | `eval/baseline.json` | PASS |
| 3 | Wrong-value check (AC 3): four `ok` lines, exit 0; tree restored | scratch script (deleted) | PASS |
| 4 | Document the scored lanes | `docs/architecture/eval.md` | PASS |
| 5 | List the new fixture page in the verify skill docs | `.claude/skills/verify/SKILL.md`, `.claude/skills/verify/features/README.md` | PASS |
| 6 | Full gate | `npm run check` | PASS |

## Validation Results

| Check | Result | Command / environment |
|-------|--------|-----------------------|
| Type check | PASS | `tsc --noEmit` (step of `npm run check`) — host, Node v22.23.1 |
| Lint | PASS | `eslint .` (step of `npm run check`) — host |
| Build | PASS | `next build` (step of `npm run check`) — host |
| Tests (eval gate) | PASS (5 sites at 100%, `✓ all gates passed`) | `npm run eval` (step of `npm run check`) — host |
| E2E 1: eval output shows new columns | PASS | `npm run eval` → `adversarial-shell … states 100%  motion 100%`, `two-scheme … dark 100%` |
| E2E 2: wrong-value check (AC 3) | PASS | `bash <scratch>/wrong-value-check.sh` from repo root — see output below |
| E2E 3: `git status --short eval/corpus` matches Task 1 | PASS | ` M eval/corpus/adversarial-shell/expected.yaml`, `?? eval/corpus/two-scheme/` |

Wrong-value check output:

```
ok   adversarial-shell: exit 1, "states primary hover background-color: expected #6d28d9 → #6d28d9, got #6d28d9 → #5b21b6", ✗ regression adversarial-shell: 90% < baseline 100%
ok   adversarial-shell: exit 1, "motion Button transition background-color: expected 200ms ease, got 150ms ease", ✗ regression adversarial-shell: 90% < baseline 100%
ok   two-scheme: exit 1, "paletteDark primary: expected #0f766e, got #2dd4bf", ✗ regression two-scheme: 98% < baseline 100%
ok   unmodified specs: npm run eval exits 0
```

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `eval/score.ts` | UPDATE | +137/-4 |
| `eval/run.ts` | UPDATE | +31/-2 |
| `eval/corpus.ts` | UPDATE | +1/-0 |
| `eval/corpus/adversarial-shell/expected.yaml` | UPDATE | +6/-0 |
| `eval/baseline.json` | UPDATE | +2/-1 |
| `eval/fixtures/two-scheme.html` | CREATE | +82 |
| `eval/corpus/two-scheme/expected.yaml` | CREATE | +40 |
| `eval/corpus/two-scheme/capture.json` | CREATE | +4162 |
| `docs/architecture/eval.md` | UPDATE | +4/-2 |
| `.claude/skills/verify/SKILL.md` | UPDATE | +1/-1 |
| `.claude/skills/verify/features/README.md` | UPDATE | +1/-1 |
| `.agents/issues/todo-issues.md` | pre-existing, not part of this work | untouched (carried onto the branch) |

## Deviations from Plan

- **Docs addition:** the new `docs/architecture/eval.md` paragraph also says that scoring is recall-only, because the owner settled Open Question 1 that way. Otherwise none.

## Tests Written

The repo has no unit test framework (`AGENTS.md`). The eval gate is the correctness gate:

| Test File | Test Cases |
|-----------|------------|
| `eval/corpus/adversarial-shell/expected.yaml` | `states`: primary hover background-color; `motion`: Button transition background-color |
| `eval/corpus/two-scheme/expected.yaml` | palette (6 roles), `paletteDark` (6 roles), typography (body family + 5-step scale), structure (4 sections, 4 regions, 3 component counts) |
| scratch wrong-value check (deleted) | wrong state `to`, wrong motion duration, and wrong `paletteDark` role each fail the gate; unmodified specs pass |
