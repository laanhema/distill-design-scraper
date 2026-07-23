# Implementation Report

**Plan**: `.agents/plans/completed/dist-023-structure-naming-fixes-plan.md`
**Branch**: `feature/dist-023-structure-naming-fixes`
**Status**: COMPLETE

## Summary

Fixed the two heuristic-naming bugs in structure-lane Stage 6 (issue #29 / DIST-023), confined to `lib/extract/structure/ontology.ts`:

1. **Root is always `Page`** — `formatDefaultName` now takes a trailing `depth` parameter (default `1`) and returns `"Page"` at depth 0 before the div/section branch, so `isHeroSection` can never apply to the root regardless of h1 position. The landmark-region branch's specific name overrides (`SiteHeader`/`SiteFooter`/`Navbar`/`MainContent`) are guarded with `depth > 0`, so a root that the pruner collapsed into a landmark also stays `Page` (its `region` type and height annotation are kept — those are real measurements).
2. **`*Card` suffix gated** — new `isCardWorthy` helper: the suffix only applies to repeated units whose tag is `div`/`section`/`article`/`li` AND that have children or mixed text+image content. Non-card repeated text leaves (`span`/`small`/`p`) collapse to `Text` (matching the existing text-leaf collapse); other non-card repeats keep their base default name. `provisionalType: "content-block"` and `instanceCount` are preserved either way — the repetition itself is real.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Depth-0 root always `Page`; landmark overrides guarded | `lib/extract/structure/ontology.ts` | Done |
| 2 | `isCardWorthy` gate on the `*Card` suffix + `Text` collapse for repeated text leaves | `lib/extract/structure/ontology.ts` | Done |
| 3 | Synthetic-fixture E2E verification (scratch script, deleted after use) | scratchpad (removed) | Done |

## Validation Results

| Check | Result |
|-------|--------|
| Type check (`npm run typecheck`) | Pass |
| Lint (`npm run lint`) | Pass |
| Eval (`npm run eval`) | Pass — clean-light 100%, dark-mode 100%, aggregate 100%, all gates passed, **no baseline refresh** |
| E2E synthetic fixture | Pass — root line `Page` (no `Hero`), no `SpanCard` anywhere (counter digits emit `Text ×11`), real 3-article grid still emits `ArticleCard ×3` under `CardGrid` |

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/extract/structure/ontology.ts` | UPDATE | +42/−8 |

## Deviations from Plan

One addition beyond the plan's task list, same bug class and same file: `isCardGrid` previously promoted any wrapper of a single repeated content-block to `"CardGrid"` — with the `*Card` fix, a counter-digit wrapper would have read `CardGrid` over `Text ×11`. Tightened `isCardGrid` to also require the repeated child's name to end in `Card`, so the counter wrapper now reads `Section` while genuine card grids keep `CardGrid`. Verified in the E2E fixture.

## Tests Written

No unit-test framework exists in this project (per CLAUDE.md, `npm run eval` is the correctness gate). The change was exercised via:

- `npm run eval` (offline regression gate, unchanged scores, no baseline refresh)
- A temporary scratch script per CLAUDE.md "Manually verifying extraction changes": local `http.createServer` fixture (top h1, 11 repeated `<span>` counter digits, 3-article card grid) driven through `renderUrl` (`SSRF_ALLOWLIST_HOSTS=localhost`) + `captureFromRender` + `extractStructureFromCapture`, asserting root `Page`, no `SpanCard`, and surviving `ArticleCard`. Script deleted after both assertion runs passed.
