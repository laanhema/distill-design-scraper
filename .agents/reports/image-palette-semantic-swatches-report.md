# Implementation Report

**Plan**: `.agents/plans/completed/image-palette-semantic-swatches-plan.md`
**Branch**: `feature/image-palette-semantic-swatches`
**Status**: COMPLETE
**GitHub Issue**: #15 (DIST-009)

## Summary

Removed the "fill remaining required roles" loop in `lib/extract/imagePalette.ts` that iterated all of `COLOR_ROLES` and fabricated `muted`/`border`/`on-primary`/`success`/`warning`/`danger` swatches from arbitrary leftover pixel clusters (falling back to `clusters[0]`, which duplicated already-assigned hexes). Roles the evidence-based heuristics don't assign are now omitted outright — the option the review recommended — restoring the "measured, never faked" invariant for image-input palettes. The Markdown body and frontend already iterate only present swatches, so omitted roles simply produce no lines.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Delete the fabricating fill loop (replaced with an explanatory comment) | `lib/extract/imagePalette.ts` | ✅ |
| 2 | Remove now-unused `COLOR_ROLES` and `ColorRole` imports | `lib/extract/imagePalette.ts` | ✅ |
| 3 | E2E: synthetic-image verification via scratch script (deleted after use) | scratchpad | ✅ |

## Validation Results

| Check | Result |
|-------|--------|
| Type check (`npm run typecheck`) | ✅ |
| Lint (`npm run lint`) | ⚠️ Cannot run non-interactively — repo has no ESLint config; `next lint` drops into its interactive setup wizard. Pre-existing repo-wide condition, unrelated to this change (same status recorded in prior reports). |
| Eval (`npm run eval`) | ✅ Passed unchanged — clean-light 100%, dark-mode 100%, aggregate 100%, all gates passed. No baseline refresh. |
| E2E synthetic-image check | ✅ 5-cluster synthetic PNG → palette contains only `background`/`surface`/`text`/`primary`/`accent`; no `success`/`warning`/`danger`/`on-primary`; no duplicate hexes; rendered Markdown body has no lines for omitted roles. |

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/extract/imagePalette.ts` | UPDATE | +5/−16 |

## Deviations from Plan

- None in the code change. One E2E note: with the plan's original 3-cluster synthetic image, `text` was legitimately omitted because the highest-contrast cluster had already been claimed as `surface` (pre-existing heuristic behavior — previously the fill loop would have "recovered" `text` by duplicating the background hex, which is exactly the fabrication being removed). The verification image was enriched to 5 distinct clusters so every evidence-based heuristic could genuinely assign, and all assertions pass. A behavioral consequence worth knowing: image palettes may now omit `text` (or `surface`/`primary`/`accent`) when the heuristics find no distinct evidence — this is the intended contract.

## Tests Written

No unit-test framework exists in this repo (per CLAUDE.md, `npm run eval` is the correctness gate and new image-lane logic is verified against synthetic fixtures via scratch scripts). Verification was performed with a temporary scratch script (project-root copy deleted after use; master copy in the session scratchpad) asserting:

- no swatch has role `success`/`warning`/`danger`/`on-primary`
- no two swatches share a hex
- `background`/`text`/`primary` present when distinct evidence clusters exist
- `renderMarkdown` body contains no lines for omitted roles
