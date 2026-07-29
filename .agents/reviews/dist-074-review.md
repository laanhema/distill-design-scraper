# Code Review: DIST-074 (Stop double-counting above-the-fold pixels in palette area weights)

**Scope**: Branch `feature/dist-074-stop-double-counting-fold-pixels` (diff against `main`)
**Recommendation**: APPROVE

## Summary

Updated `extractFromCapture` in `lib/analyze.ts` to pass `capture.panoramaShot ?? capture.viewportShot` to `extractPalette`. This eliminates double-counting above-the-fold pixels on pages with panoramas while ensuring single-viewport pages without panoramas continue to sample `viewportShot`. The eval harness score is untouched at 100%.

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions
None

## Validation Results

| Check | Status |
|-------|--------|
| Type Check | PASS |
| Lint | PASS |
| Tests | PASS (100% eval harness) |

## Recommendation

APPROVE. Ready for merge.
