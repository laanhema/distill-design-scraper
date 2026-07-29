# Implementation Report

**Plan**: `.agents/plans/dist-063-region-typing-landmark-identity-plan.md`
**Branch**: `feature/dist-063-region-typing-landmark-identity`
**Status**: COMPLETE

## Summary

Replaced the depth-based region gate in the structure lane's Stage 6 ontology typer (`lib/extract/structure/ontology.ts`) with an ancestor-tracked landmark-identity gate. Previously, `assignOntologyTypes` typed a node as a page-level `region` (and renamed it `SiteHeader`/`MainContent`/`Navbar`/`SiteFooter`) only when `depth <= 1` — a proxy that broke whenever Stage 4b squash couldn't collapse an unsquashable wrapper div (e.g. one with a sibling skip-link or portal root), because the landmark then sat at depth 2 or deeper. The fix threads a new `insideRegion` boolean top-down (mirroring the existing `insideFooter` pattern) and gates on "no strict ancestor already matched the landmark/tag predicate" instead of a depth threshold, so the fix generalizes to any wrapper depth. A second, related defect was also fixed: `isHeroSection` was independently mislabeling the surviving wrapper div as `Hero` (its recursive h1 search doesn't know it's now looking through real regions) — a one-line guard now bails out of the hero check when any direct child is already `region`-typed.

`regionMetrics.ts` and `sections.ts` needed no changes — verified (Task 3) that neither file references `depth` at all; both already key off `provisionalType`/landmark identity.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Replace depth-based region gate with ancestor-tracked identity gate (`insideRegion`) | `lib/extract/structure/ontology.ts` | ✅ |
| 2 | Guard `isHeroSection` against a wrapper containing a region-typed child | `lib/extract/structure/ontology.ts` | ✅ |
| 3 | Confirm `regionMetrics.ts`/`sections.ts` need no changes (verification only) | none | ✅ (confirmed via `grep -n "depth"` — zero matches in either file) |
| 4 | Run eval harness, confirm `adversarial-shell` score rises | none | ✅ (0.92 → 1.00 combined; `clean-light`/`dark-mode` unchanged at 1.00) |
| 5 | Refresh `eval/baseline.json` | `eval/baseline.json` | ✅ |
| 6 | Final gate: typecheck + lint + eval | none | ✅ |

## Validation Results

| Check | Result |
|-------|--------|
| Type check (`npm run typecheck`) | ✅ Pass |
| Lint (`npm run lint`) | ✅ Pass |
| Eval (`npm run eval`) | ✅ Pass — `clean-light` 100%, `dark-mode` 100%, `adversarial-shell` 100% (up from baseline 0.92), aggregate 100%, all gates passed |

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/extract/structure/ontology.ts` | UPDATE | +21/-7 (net +14) |
| `eval/baseline.json` | UPDATE (generated via `UPDATE_BASELINE=1 npm run eval`) | `"adversarial-shell": 0.92` → `1` (only value changed; `clean-light`/`dark-mode` untouched at `1`) |

## Deviations from Plan

None. Implementation matched the plan exactly:
- Task 1's `insideRegion` parameter, `isLandmarkNode` predicate, and gate condition (`!insideRegion && isLandmarkNode`) implemented verbatim as specified.
- Task 2's `isHeroSection` guard implemented verbatim as specified.
- The `depth > 0` naming branch and raw-height annotation block were left untouched, as instructed.
- `adversarial-shell` reached exactly 1.00 as the plan's "ideal" outcome predicted (not just "above 0.92") — no secondary unrelated mismatch surfaced.
- `regionMetrics.ts`/`sections.ts` confirmed depth-agnostic; no edits made there.

## Tests Written

No unit test framework exists in this project (per `CLAUDE.md`); `npm run eval` is the correctness gate for extraction logic, per project convention. Task 4/5/6 exercised this gate directly against the already-committed `adversarial-shell` fixture (`eval/corpus/adversarial-shell/`), which is the plan's designated primary proof.

Additionally, per the plan's End-to-End Verification item 3, a temporary scratch script (`scratch-verify-dist063.ts`, deleted after use) was written to independently reproduce the bug's exact repro method: loaded `eval/corpus/clean-light/capture.json`, mutated its `rawHarvestNode` to insert an unsquashable wrapper div (with a sibling skip-link anchor, so `squash.ts`'s "exactly one child" rule doesn't fire) around the existing `header`/`main`/`footer` children, ran `extractStructureFromCapture(mutatedCapture, undefined, { forceHeuristicNaming: true })`, and printed `structReport.skeletonAscii`. Confirmed:
- `SiteHeader` `[padY 25px]`, `MainContent` `[h 100vh]`, `SiteFooter` `[padY 53px]` all present and correctly named at depth 2 (band annotations intact).
- No unqualified `"Header"`/`"Main"`/`"Footer"` fallback names appeared.
- The wrapper div itself was named `Section` (generic container), not `Hero`.
- Script deleted after use; `git status --short` confirmed no stray scratch files remain.

## End-to-End Verification (per plan)

1. **Primary proof**: `npm run eval` — `adversarial-shell` rose from committed baseline `0.92` to `1.00` (combined), with no structure-lane miss notes printed. ✅
2. **Regression check**: `clean-light` and `dark-mode` unchanged at `1.00` (100%) after the fix — confirms landmarks nested inside other landmarks (e.g. `nav` inside `header`) still correctly resolve `insideRegion = true` and stay non-region, matching both fixtures' `expected.yaml` (neither lists a `Navbar` entry). ✅
3. **Offline manual repro**: completed as described above via the deleted scratch script. ✅
4. `npm run typecheck && npm run lint` both pass on the final tree. ✅
