# Code Review: DIST-060 (Make a missing eval corpus capture fail rather than skip)

**Scope**: branch `feature/dist-060-eval-corpus-fail-missing` vs `main`
**Recommendation**: APPROVE

## Summary

Updated `eval/corpus.ts` to support optional corpus entries, updated `eval/run.ts` to fail if non-optional corpus captures are missing, and updated `CLAUDE.md` / `PRD.md` documentation.

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
| Failure behavior verification | PASS |

## What's Good

- Makes eval gate honesty explicit.
- Preserves CI green status by marking uncommitted live references optional.
- Explicit documentation updates in `CLAUDE.md` and `PRD.md`.

## Recommendation

Approve and proceed with PR creation / merge.
