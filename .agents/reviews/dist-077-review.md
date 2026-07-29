# Code Review: DIST-077 (Omit text rather than duplicating background hex on single-cluster images)

**Scope**: Branch `feature/dist-077-omit-text-swatch-on-single-cluster-images` (diff against `main`)
**Recommendation**: APPROVE

## Summary

Removed `|| swatches.length === 1` condition from `lib/extract/imagePalette.ts`. For single-cluster images, the `text` swatch is omitted rather than duplicating the background hex and emitting a 1:1 contrast pair graded `fail`. Multi-cluster images are unaffected. All gates pass cleanly.

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
