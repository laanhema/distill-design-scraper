# Code Review: DIST-061 (Carry render viewport through Capture into structure lane)

**Scope**: branch `feature/dist-061-capture-render-viewport` vs `main`
**Recommendation**: APPROVE

## Summary

Added optional `viewport` to `Capture`, recorded `render.viewport` in `captureFromRender`, and forwarded `capture.viewport` to `extractStructureFromCapture`. Includes the `eval/corpus.ts` optional field adjustment.

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
| Eval Suite | PASS |
| Scratch verification | PASS |

## What's Good

- Minimal, zero-risk additive schema change.
- Ensures custom viewports propagate correctly to structure region metrics.
- Keeps eval baseline untouched.

## Recommendation

Approve and proceed with PR creation / merge.
