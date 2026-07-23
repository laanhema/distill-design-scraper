# Implementation Report

**Plan**: `.agents/plans/dist-013-restore-structure-eval-lane-plan.md`
**Branch**: `feature/dist-013-restore-structure-eval-lane`
**Status**: COMPLETE

## Summary

Restored the structure lane to the eval harness as a real, non-constant offline
gate. `npm run eval` now exercises the structure pipeline against hand-authored
`expectedSections`/`expectedRegions`/`expectedComponents` specs and folds the
result into the per-site `combined` score. Four layered fixes:

1. Both fixtures wrapped hero+grid in `<main>` so `findDigestBands` emits a
   4-band section digest (DIST-028's omit-don't-guess contract left intact —
   the fix is in the corpus, not the extractor).
2. `eval/capture.ts` now copies `rawHarvestNode` into the committed
   `capture.json`; both captures regenerated.
3. A `forceHeuristicNaming` option is threaded from the eval runner through
   `extractStructureFromCapture` → `extractStructure` → `runStructureAILabeller`,
   where it short-circuits **before** `aiLaneAvailable()` so the `Anthropic`
   client is never constructed on the eval path. Eval stays offline even when
   `ANTHROPIC_API_KEY` is set, and DIST-030's AI-only `sectionDescriptions` are
   suppressed.
4. `scoreStructure` now produces a real section-ordinal-accuracy score
   (sections primary, regions + component counts secondary), and
   `combinedScore` weights palette 0.5 / typography 0.3 / structure 0.2 when
   a structure score is present.

Hand-authored `structure:` blocks were written against the real post-reshape
emit (read via a throwaway scratch script per CLAUDE.md "Manually verifying
extraction changes"). The baseline was refreshed deliberately via
`UPDATE_BASELINE=1 npm run eval`; both sites land at combined 1.0.

Negative-case verification (Task 8): short-circuiting `findDigestBands` to
`[]` drops combined from 100% → 90% on both sites and fails the gate with
`Sections digest absent but expectedSections provided` — confirming the lane
is actually under test.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Add `<main>` wrapper to both fixtures | `eval/fixtures/clean-light.html`, `eval/fixtures/dark-mode.html` | ✅ |
| 2 | Copy `rawHarvestNode` into eval capture + re-capture | `eval/capture.ts`, `eval/corpus/*/capture.json` | ✅ |
| 3 | Thread `forceHeuristicNaming` through the structure lane | `lib/extract/structure/structureAI.ts`, `lib/extract/structure/index.ts`, `lib/analyze.ts` | ✅ |
| 4 | Real, non-constant `scoreStructure` against `expected` (sections primary) | `eval/scoreStructure.ts` | ✅ |
| 5 | Wire spec + structure score into the eval gate | `eval/score.ts`, `eval/run.ts` | ✅ |
| 6 | Hand-author expected structure specs per corpus site | `eval/corpus/clean-light/expected.yaml`, `eval/corpus/dark-mode/expected.yaml` | ✅ |
| 7 | Deliberate baseline refresh | `eval/baseline.json` | ✅ |
| 8 | Negative-case verification (AC4) | (no committed change — verified then reverted) | ✅ |

## Validation Results

| Check | Result |
|-------|--------|
| Type check (`npm run typecheck`) | ✅ pass (clean) |
| Lint (`npm run lint`) | ✅ pass (clean) |
| Eval gate (`npm run eval`) | ✅ pass — clean-light 100%, dark-mode 100%, all gates passed |
| Eval with fake `ANTHROPIC_API_KEY` set | ✅ pass — confirms offline short-circuit (AC3); scratch probe returned `naming: heuristic`, `has sectionDescriptions: false` |
| Eval determinism (two consecutive runs) | ✅ byte-identical stdout (AC3) |
| Eval:ai (`npm run eval:ai`) | ✅ unaffected — skips cleanly when no key set; code path (`stability.ts` → `extractFromCapture` + `interpret`, never touches `runStructureAILabeller`) confirms the eval-path switch does not silence live AI calls (AC) |
| Task 8 negative case (break `findDigestBands`) | ✅ gate fails: combined 100% → 90% on both sites, regression flagged, miss named `Sections digest absent but expectedSections provided`; passes after revert |
| `eval/corpus/*/capture.json` carries top-level `rawHarvestNode` | ✅ verified via `node -e` for both slugs |

## Files Changed

| File | Action | Purpose |
|------|--------|---------|
| `eval/fixtures/clean-light.html` | UPDATE | Wrap hero+grid in `<main>` (semantic wrapper, no CSS/class changes) |
| `eval/fixtures/dark-mode.html` | UPDATE | Same `<main>` wrapper |
| `eval/capture.ts` | UPDATE | +1 line: copy `rawHarvestNode` into the `Capture` literal |
| `eval/corpus/clean-light/capture.json` | REGENERATE | `npm run eval:capture` — now carries top-level `rawHarvestNode` |
| `eval/corpus/dark-mode/capture.json` | REGENERATE | Same |
| `eval/corpus/clean-light/expected.yaml` | UPDATE | Hand-authored `structure:` block (sections: SiteHeader/Hero/CardGrid/SiteFooter; components: SectionCard×6, TextLink×4, Button×2) |
| `eval/corpus/dark-mode/expected.yaml` | UPDATE | Hand-authored `structure:` block (sections: SiteHeader/Hero/GridSection/SiteFooter; components: SectionCard×5, TextLink×4, Button×2) |
| `eval/scoreStructure.ts` | UPDATE | Real non-constant scoring — sections primary (0.5), regions (0.2), components (0.3); `sectionAccuracy` field; explanatory misses |
| `eval/score.ts` | UPDATE | `structure?` on `ExpectedSpec`; `combinedScore(palette, typography, structure?)` weights palette 0.5 / typo 0.3 / structure 0.2 when present, else historical 0.6/0.4 |
| `eval/run.ts` | UPDATE | Pass `forceHeuristicNaming: true` + `expected.structure`; fold structure into combined; carry structure misses into `notes` |
| `eval/baseline.json` | UPDATE | `UPDATE_BASELINE=1 npm run eval` — both sites at `1.0` (unchanged numerically, but now reflects palette+typography+structure) |
| `lib/extract/structure/structureAI.ts` | UPDATE | `runStructureAILabeller(root, opts?)` short-circuits to heuristic fallback before `aiLaneAvailable()` when `forceHeuristicNaming` |
| `lib/extract/structure/index.ts` | UPDATE | `forceHeuristicNaming?` on `ExtractStructureOptions`, threaded into Stage 7 call (both Page and options call paths) |
| `lib/analyze.ts` | UPDATE | `extractStructureFromCapture(capture, report?, opts?)` threads `forceHeuristicNaming` into `extractStructure` |

## Deviations from Plan

None. The implementation matched the plan in every task, including:

- Section digest names matched the plan's predictions exactly: clean-light
  `[SiteHeader, Hero, CardGrid, SiteFooter]`; dark-mode
  `[SiteHeader, Hero, GridSection, SiteFooter]` (the `CardGrid` vs `GridSection`
  heuristic-naming divergence the plan flagged was confirmed by the scratch run).
- dark-mode `SectionCard` count is `5` (with one outlier `Section` for the
  `<code>` card), exactly as the plan's Risks table anticipated.
- Baseline numbers are numerically unchanged (`1.0` for both sites) but now
  reflect the structure lane folded in — not a deviation, just the expected
  outcome when the specs match reality.

## Tests Written

There is no unit test framework in this repo (`npm run eval` IS the
correctness gate, per CLAUDE.md). Per the implement skill's "If the project
has no test framework" branch, the change was verified through:

- The eval gate itself (`npm run eval` now exercises the structure lane
  against authored specs — a real regression gate, replacing the previous
  constant `1.0` no-op).
- A throwaway `npx tsx scratch-dist-013.ts` script (per CLAUDE.md "Manually
  verifying extraction changes") that read the real `machineBlock.sections` /
  `components` / `skeletonAscii` emit for both fixtures, so the hand-authored
  specs were grounded in observed output rather than predicted. Deleted after
  use — not committed.
- Task 8's deliberate-break verification (revert-in-place, no committed
  change) is the regression-gate test for AC4: a real structure break drops
  the score below baseline and fails the gate.

## Acceptance Criteria

All acceptance criteria from the plan are satisfied:

- [x] `eval/capture.ts` writes `rawHarvestNode`; both regenerated `capture.json` carry it
- [x] Both fixtures wrapped in `<main>`; `sections` digest emitted for both corpus sites
- [x] With `ANTHROPIC_API_KEY` set, `npm run eval` makes no network call — `naming: "heuristic"`, no `sectionDescriptions`, repeated runs deterministic
- [x] `scoreStructure` receives an `expected` spec and produces a real, non-constant score; sections digest is the primary signal
- [x] Structure score is folded into `combined` so it feeds the site gate
- [x] Hand-authored `structure:` blocks in both `expected.yaml`, authored against post-reshape output
- [x] A deliberate structure-extractor break drops the score below baseline and fails the gate (Task 8)
- [x] `eval/baseline.json` refreshed deliberately via `UPDATE_BASELINE=1 npm run eval`
- [x] `npm run typecheck`, `npm run lint`, `npm run eval` all pass
- [x] `eval:ai` (stability) unaffected — still makes live AI calls when the key is set (verified by code path; `stability.ts` never calls the structure lane)
