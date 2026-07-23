# Implementation Report

**Plan**: `.agents/plans/completed/bucket-quantize-image-palette-plan.md`
**Branch**: `feature/bucket-quantize-image-palette`
**Status**: COMPLETE
**GitHub Issue**: #21 (DIST-015)

## Summary

Rewrote `quantizeImage` in `lib/extract/imagePalette.ts` from an unbounded per-pixel ΔE cluster merge into a bounded two-stage quantization: (1) an integer-only 4-bit-per-channel RGB histogram (≤ 4096 buckets by construction, no color math in the pixel loop), then (2) CIEDE2000 merging of the bucket *centroids* (count-weighted mean color), largest bucket first. Mirrors the existing `farBuckets` pattern in `lib/extract/palette.ts:139-179`. The function's output contract is unchanged (`{ clusters, pixelCount }`, cluster counts sum to opaque-pixel count), so cross-image merging, area-weighting, and role assignment in `extractImagePalette` were untouched.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Rewrite `quantizeImage` with bounded bucket histogram + centroid ΔE merge | `lib/extract/imagePalette.ts` | Done |
| 2 | Behavior + performance spot-check via scratch scripts (deleted after use) | scratch (removed) | Done |

## Validation Results

| Check | Result |
|-------|--------|
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm run eval` | Pass — clean-light 100%, dark-mode 100%, aggregate 100%, baseline untouched |

## Performance (Acceptance Criteria 1 & 3)

Measured with deterministic synthetic images (320×320) and real eval-corpus screenshots, same machine, before (main) vs after:

| Input | Before | After |
|-------|--------|-------|
| Gradient 320×320 (worst-case: nothing merges at ΔE ≤ 2.5) | 28,269 ms | 69 ms |
| Noise 320×320 | not run to completion (worse than gradient) | 72 ms |
| 6 × noise images in one request | — | 370 ms total |
| clean-light viewport screenshot | 290 ms | 59 ms |
| dark-mode viewport screenshot | 319 ms | 31 ms |

Worst-case work is now bounded by the 4096-bucket cap regardless of image content; 6 max-size worst-case images complete in well under 1 s of quantization vs a 60 s route budget.

## Behavior spot-check (Acceptance Criterion 2)

Real screenshots from the committed eval corpus, before vs after:

- **clean-light**: all five roles assigned both times; hexes shift by centroid rounding only (bg `#ffffff` → `#fcfdfd`, text `#000317` → `#01081b`, primary/accent stay blue). Contrast grades unchanged (AAA / AA). Materially unchanged.
- **dark-mode**: identical swatch *set* (bg `#0d1117` exact, near-white text, blue + amber vivid pair), but `primary` and `accent` swapped between the blue and amber (`#59a8fe`/`#e1a323` before → `#e5a623`/`#59a7fd` after). Cause: primary is chosen as "highest-chroma vivid" and the two candidates have near-equal chroma, so small centroid shifts flip the ordering — this ordering was already merge-order-sensitive before the change. Contrast grades unchanged (AAA / AAA).
- **Synthetic flat composite**: the previous code split one dark ink (`#1a1a2e`) into two artifact clusters (assigned `surface` + `text`); the new code correctly merges them, so the degenerate synthetic image loses its `text` swatch (omission, not fabrication — consistent with the provenance contract). Real screenshots keep `text` in all checks.

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/extract/imagePalette.ts` | UPDATE | +45/−3 (confined to `quantizeImage` + its doc comment) |

## Deviations from Plan

- Noise-image *before* timing was not captured (plan allowed skipping if not cheap; the gradient baseline at 28 s already demonstrates the unbounded behavior).
- Spot-check used the two committed eval-corpus screenshots plus one synthetic composite (plan asked for 2–3 real screenshots; the corpus has exactly two).

## Tests Written

No unit-test framework exists in this project (per CLAUDE.md). Verification was done through the project's stated correctness gate (`npm run eval`, passed unchanged with baseline untouched) plus temporary scratch scripts exercising `extractImagePalette` end-to-end on synthetic worst-case images and real corpus screenshots (results above; scripts deleted after use per project convention).

## Notes for review / follow-ups

- Issue #22 (DIST-016, zero-cluster guard) is still open; this change deliberately does not touch `extractImagePalette`, so the pre-existing `clusters[0]` dereference remains for #22 to fix. A fully-transparent image still yields zero clusters exactly as before.
- The dark-mode primary/accent swap is a known, low-impact ordering sensitivity between near-equal-chroma brand colors, not a regression in captured colors.
