# Code Review: feature/degenerate-image-input-guard

**Scope**: branch `feature/degenerate-image-input-guard` diff vs `main` (uncommitted changes; 2 files, +36/−1)
**Recommendation**: APPROVE (with nits)

## Summary

The change closes the issue #22 crash: `extractImagePalette` now throws a typed `DegenerateImageError` when zero clusters survive quantization (fully transparent and/or unreadable images), guarded before any `clusters[0]` access; per-image quantization failures are caught and skipped with a warning so mixed uploads still measure a palette from the valid images; and the API route maps the error to a 422 before the generic 502 fallback. The guard fails honestly instead of fabricating swatches, matching the provenance contract, and mirrors the existing `UnsafeUrlError` typed-error pattern.

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions (Low)

1. `lib/extract/imagePalette.ts:139-145` — a skipped unreadable image is only surfaced via `console.warn`; the API response carries no indication that one of the uploaded images contributed nothing, so a user with a mixed upload gets a palette without knowing an image was ignored (the issue's AC allows "skipped or reported", so this is optional polish, e.g. a `skippedImages` field on the result).
2. `lib/analyze.ts:208` (pre-existing sequencing, surfaced by this change) — in image `mode: "structure"`, `extractImagePalette` still runs first and a degenerate-only upload now 422s before vision structure inference is ever attempted; arguably correct (the upload is unusable), but worth knowing the 422 short-circuits the structure lane too.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | PASS |
| Eval (`npm run eval`) | PASS (aggregate combined 100%, all gates passed, baseline untouched) |

## What's Good

- The zero-cluster guard sits before both unguarded `clusters[0]` reads (`bgCluster`, `bestTextCluster`), fully closing the TypeError.
- Per-image `.catch` keeps `Promise.all` semantics while making one bad buffer non-fatal — and returning `pixelCount: 0` for a skipped image keeps the area-weight math exact (skipped images don't dilute `totalPixelCount`).
- The error class carries a clear JSDoc rationale tied to the provenance contract, and the route's 422 branch is placed correctly (after `UnsafeUrlError`, before the 502 fallback); error responses were already uncacheable, so no stale-failure risk.
- Comments explain intent, consistent with the codebase's style.

## Recommendation

Approve. The two Low suggestions are optional follow-ups, not blockers. Ready for commit/PR via the follow-up flow.
