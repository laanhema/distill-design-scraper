# Code Review: DIST-064 (Never assign evidence-gated role by displacement)

**Scope**: Branch `feature/dist-064-never-assign-evidence-gated-role-displacement` (diff against `main`)
**Recommendation**: APPROVE

## Summary

This change ensures that role refinements in `lib/interpret.ts` never reassign non-refinable semantic roles (`success`/`warning`/`danger`/`on-primary`) to displaced swatches during swap operations. Displaced non-refinable roles are dropped (making the swatch role-less) and hex matching prioritizes refinable roles or skips ambiguous matches. `lib/schema.ts` and `lib/emit.ts` were updated to safely support role-less swatches.

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
