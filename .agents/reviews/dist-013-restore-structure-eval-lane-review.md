# Code Review: DIST-013 — Restore the structure lane to the eval harness

**Scope**: branch `feature/dist-013-restore-structure-eval-lane` vs `main` (all uncommitted changes + untracked files in scope)
**Issue**: #19 `[DIST-013] Restore the structure lane to the eval harness`
**Recommendation**: **Needs changes** (one major)

## Summary

The change restores the structure lane as a real, offline, non-constant eval gate: both fixtures are wrapped in `<main>` so `findDigestBands` emits a 4-band digest, `rawHarvestNode` is now persisted into the committed `capture.json`, a `forceHeuristicNaming` opt is threaded through `extractStructureFromCapture → extractStructure → runStructureAILabeller` to short-circuit the AI client on the eval path, and `scoreStructure`/`combinedScore` now weight sections (0.5) / regions (0.2) / components (0.3) and fold the result into per-site `combined`. Typecheck, lint, and `npm run eval` all pass clean (both sites at 100%). The design is sound and well-documented; one major issue undermines the very goal of the issue (a real regression gate), and a couple of nits around stray files.

## Issues Found

### Blocker
None.

### Major

**`eval/run.ts:71` — silent `catch` defeats the regression gate the issue is restoring.**
```ts
} catch {
  structureScore = null;
}
```
The whole point of DIST-013 is to make `npm run eval` a real gate over the structure extractor. With `eval/baseline.json` now at `1.0` *reflecting structure folded in* (0.5/0.3/0.2 weights), any throw inside `extractStructureFromCapture` or `scoreStructure` leaves `structureScore = null` and `structureMisses = []`; `combinedScore(pal, typo, null)` then silently falls back to the historical `0.6*pal + 0.4*typo`, which for these two perfect-palette/perfect-typo fixtures is *also* `1.0`. A broken structure extractor — the exact class of regression this lane is meant to catch — therefore passes the gate green. At minimum: `console.warn` the error, push a `structure: <msg>` miss so it surfaces in `notes`, and consider forcing `structureScore = 0` (not `null`) so the drop propagates. Pre-existing pattern, but it became load-bearing the moment the lane was wired into `combined`.

### Minor
None beyond the nits below.

### Nits

- **`.agents/temp/temp.txt`** — untracked scratch file (a list of `/issue-flow` skill invocations) that has nothing to do with DIST-013 and shouldn't ship with the branch; delete or gitignore.
- **`eval/corpus/dark-mode/expected.yaml:25` — `SectionCard: { count: 5 }` while the fixture has 6 `.card` divs.** The implementation report explains the 6th card (`<code>`) classifies as `Section` not `SectionCard`, and `scoreStructure.ts:118`'s `±1` tolerance makes this pass — but the tolerance is exactly wide enough to also hide a real missing card. Consider tightening the spec to the true emitted count (`6` for the `SectionCard` aggregate, or split `Section`/`SectionCard` explicitly) so the gate isn't resting on the tolerance margin.
- **`eval/scoreStructure.ts:95` — substring match on `skeletonAscii`.** `emittedAscii.toLowerCase().includes(reg.toLowerCase())` means `MainContent` would also satisfy an expected region of `Main`. Pre-existing, but now that regions are a real (0.2-weighted) signal, worth a word-boundary or exact-token check.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | PASS |
| Eval gate (`npm run eval`) | PASS — clean-light 100%, dark-mode 100%, all gates passed |

## What's Good

- The `forceHeuristicNaming` short-circuit is placed *before* `aiLaneAvailable()` in `structureAI.ts:156`, so the `Anthropic` client is never constructed on the eval path — exactly matching the issue's "offline + deterministic even when `ANTHROPIC_API_KEY` is set" requirement, and the report's negative-case verification (`naming: heuristic`, no `sectionDescriptions`) confirms it.
- The `combinedScore` doc-comment (`eval/score.ts:124-130`) clearly explains both weight regimes and why a full structure collapse (`0.0`) drops combined by `0.2` past `REGRESSION_EPS` — the math checks out (0.5 + 0.3 + 0.2 = 1.0; 0.6 + 0.4 = 1.0).
- `expectedSections` is scored by ordinal position with named misses (`Missing/extra section at ordinal N: expected X, got Y`), so a reordered or missing band registers as a real, *debuggable* regression rather than an opaque score drop.
- The `<main>`-wrapper fix is correctly placed in the corpus, not the extractor, preserving DIST-028's "omit-don't-guess" contract — and the report's deliberate-break test (Task 8: short-circuit `findDigestBands` → `[]` → combined 100%→90%, gate fails) empirically confirms the lane is under test.
- The opt is threaded through both the `Page` and `ExtractStructureOptions` call paths in `lib/extract/structure/index.ts`, and the live URL path (`analyzeUrlStructure` → `extractStructureFromCapture(capture)` with no opts) is untouched, so production AI calls are not silenced.

## Recommendation

Address the major silent-catch in `eval/run.ts:71` (at minimum log + surface a miss so structure regressions don't pass green), drop the stray `.agents/temp/temp.txt`, and optionally tighten the dark-mode `SectionCard` count spec. With those, this is an approve.
