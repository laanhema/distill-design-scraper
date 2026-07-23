# Implementation Report

**Plan**: `.agents/plans/dist-029-page-sections-body-plan.md`
**Branch**: `feature/dist-029-page-sections-body`
**Status**: COMPLETE

## Summary

The structure report body now opens with `## Page sections` (one block per Stage 9
digest) when digests exist, demotes the exhaustive ASCII tree to a depth-capped
(3 levels, `…`-marked) `## Skeleton (detail)` section, and filters the
`## Components` body list to `region` / `content-block` / `composite` entries — atoms
and generic containers remain machine-block-only. The `skeletonAscii` field, the
`sectionsText` field, and the machine block are byte-for-byte the same contract as
before (no drift; `scoreStructure` unaffected). All changes are confined to
`lib/extract/structure/structureEmit.ts`.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Depth-cap support in `buildAsciiSkeleton` (visible `…` truncation) | `lib/extract/structure/structureEmit.ts` | ✅ |
| 2 | Filter `## Components` body to region/content-block/composite | `lib/extract/structure/structureEmit.ts` | ✅ |
| 3 | Reassemble markdown: `## Page sections` first, `## Skeleton (detail)` demoted | `lib/extract/structure/structureEmit.ts` | ✅ |
| 4 | Full validation + end-to-end check | — | ✅ |

## Validation Results

| Check | Result |
|-------|--------|
| Type check (`npm run typecheck`) | ✅ |
| Lint (`npm run lint`) | ✅ |
| Eval (`npm run eval`) | ✅ — clean-light 100%, dark-mode 100%, all gates passed, **no baseline refresh** |
| E2E scratch verification | ✅ — 23/23 assertions (deleted after use) |

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/extract/structure/structureEmit.ts` | UPDATE | +56/-17 |

## Deviations from Plan

- **E2E positive path**: the plan assumed a committed eval capture could be replayed
  through `extractStructureFromCapture`, but the committed captures do not carry
  `rawHarvestNode` (known gap, noted in `.agents/temp/codebase-review-fable-2026-07-23.md`
  — the eval harness itself skips structure scoring for the same reason). The positive
  path instead used the CLAUDE.md "Manually verifying extraction changes" pattern: a
  local `http.createServer` synthetic page + `renderUrl` (with
  `SSRF_ALLOWLIST_HOSTS=localhost`) → `captureFromRender` → `extractFromCapture` +
  `extractStructureFromCapture`, i.e. the real live pipeline end-to-end. The negative
  (no-`sections`) path used a synthetic `StructureEmitInput` as planned.

## Tests Written

No test framework exists in this project (per CLAUDE.md); correctness gates are
`npm run eval` plus a temporary scratch verification script. The scratch script
(deleted after use) covered, across a live-rendered synthetic page and a synthetic
no-sections input:

- `## Page sections` present and ordered first (before skeleton and machine block)
- no bare `## Skeleton` heading; `## Skeleton (detail)` depth-capped with visible `…`
- `skeletonAscii` field fully populated (strictly more lines than the capped body)
- no `atom`/`container` headings in the `## Components` body; all 12 components still
  in the machine block vs 5 in the body
- `sectionsText` field identical to the body artifact (no drift)
- negative path: no `sections` → no `## Page sections` heading, no error, region entry
  kept, atom/container filtered from body but present in the machine block
