# Implementation Report

**Plan**: `.agents/plans/completed/dist-022-cleanup-small-drifts-plan.md`
**Branch**: `feature/dist-022-cleanup-small-drifts`
**Status**: COMPLETE

## Summary

Cleanup sweep for issue #28 (DIST-022, review ref C7): six reviewed minor drifts fixed in one pass. Comments now match behavior, the AI role enum has one source of truth, the data-URL regex accepts `svg+xml`, the shared-retry claim in `lib/aiLane.ts` is now true, the harvester lost its svg contradiction and gained a node cap, and the image-structure lane's id counter is per-invocation.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | `REFINABLE_COLOR_ROLES` single source of truth; `aiResponseSchema.roleRefinements[].role` narrowed to it | `lib/schema.ts` | Done |
| 2 | `OUTPUT_SCHEMA` role enum and `applyRoleRefinements` sort order derived from `REFINABLE_COLOR_ROLES` | `lib/interpret.ts` | Done |
| 3 | `stripDataUrlPrefix` regex → `/^data:image\/[a-zA-Z0-9.+-]+;base64,/` (handles `svg+xml`) | `app/api/analyze/route.ts` | Done |
| 4 | `runStructureAILabeller` uses `aiLaneAvailable()` + `retryOnce` via an extracted `requestOnce` (same null-gate shape as `interpret.ts`) | `lib/extract/structure/structureAI.ts` | Done |
| 5 | `isNearMatch` now compares base tag AND ≥80% of positional child tags, as the comment promised; variance-tagging intent documented at the call site | `lib/extract/structure/repetition.ts` | Done |
| 6 | svg no-op contradiction removed (behavior-neutral — svg was and is harvested); `NODE_CAP = 5000` added, mirroring `styleDump` | `lib/extract/structure/harvester.ts` | Done |
| 7 | Module-level `idCounter` replaced with per-invocation `{ next: number }` counter | `lib/extract/structureFromImage.ts` | Done |

## Validation Results

| Check | Result |
|-------|--------|
| Type check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | PASS |
| Eval (`npm run eval`) | PASS — scores unchanged (clean-light 100%, dark-mode 100%), no baseline refresh |
| Regex one-liner check | PASS (`svg+xml` stripped, `png` stripped, non-data-URL untouched) |
| E2E harvester scratch check | PASS — 5003 nodes harvested on a ~6000-node page (cap 5000 + depth-bounded in-flight overshoot), inline `<svg>` present in harvest; scratch script deleted |

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `app/api/analyze/route.ts` | UPDATE | +3/-1 |
| `lib/extract/structure/harvester.ts` | UPDATE | +13/-4 |
| `lib/extract/structure/repetition.ts` | UPDATE | +20/-2 |
| `lib/extract/structure/structureAI.ts` | UPDATE | +60/-53 |
| `lib/extract/structureFromImage.ts` | UPDATE | +9/-3 |
| `lib/interpret.ts` | UPDATE | +6/-10 |
| `lib/schema.ts` | UPDATE | +16/-1 |

## Deviations from Plan

- The E2E scratch script needed the same page-side `__name` shim `styleDump.ts` installs before its evaluate — a tsx/esbuild serialization artifact, not a code change. In the real pipeline `collectStyleDump` always runs on the page before `harvestDomTree` (verified `lib/ingest.ts:310→313`, and the responsive pass reuses the session), so the shim is already present there. No production code changed for this.
- Node-cap overshoot: nodes already on the recursion stack when the cap is hit still complete, so the total can exceed the cap by roughly the tree depth (observed 5003 for cap 5000). Accepted — the payload-bounding goal is met; noted here rather than complicating the self-contained evaluate callback.

## Tests Written

No unit test framework exists in this project (per CLAUDE.md, `npm run eval` is the correctness gate). Coverage was provided by:

| Verification | Cases |
|--------------|-------|
| `npm run eval` | Full measured-lane + structure replay; `isNearMatch` tightening confirmed score-neutral |
| Scratch E2E (deleted) | Harvester node cap on pathological 6000-node DOM; svg harvested |
| `node -e` regex check | `svg+xml` prefix, `png` prefix, no-prefix passthrough |
