# Code Review: feature/dist-020-readme-doc-sweep

**Scope**: Branch `feature/dist-020-readme-doc-sweep` vs `main`, incl. uncommitted changes
**Recommendation**: APPROVE WITH NITS

## Summary

Five false/misleading claims in `README.md` were corrected to match the scraper's actual behavior: APCA→WCAG contrast, removed Container Queries, fixed the image-input scope claim (no longer "Palette & Mood only"), removed non-existent mode toggles, and removed non-existent forced cache refresh controls. All changes are well-reasoned and verified against the codebase. One residual inaccuracy remains (not in the diff scope).

## Issues Found

### Critical
None.

### High Priority
None.

### Medium Priority

| # | File:Line | Description |
|---|-----------|-------------|
| 1 | README.md:36 | **Residual APCA claim** — Line 36 still says "OKLCH/APCA contrast indicators" despite line 12 being corrected to WCAG. The codebase only uses WCAG contrast (`lib/color.ts:58-63`). The implementation report itself flagged this as out-of-scope for this PR but it reads as a contradiction after the line 12 fix. |

### Suggestions

None.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check | PASS |
| Lint | PASS |
| Tests | N/A (docs-only change) |

## What's Good

- All five claims were independently verified against the codebase — each correction accurately reflects what the code actually does.
- The image input rewrite is thorough: it documents the vision-inferred structure lane, the `fidelity: inferred` stamp, and the API-key requirement — all of which match `lib/extract/structureFromImage.ts`.
- The Interactive Workbench bullet no longer promises features (mode toggles, forceRefresh) that don't exist in `app/page.tsx`.
- The plan file (`.agents/plans/completed/dist-020-readme-doc-sweep-plan.md`) is detailed and cites exact file:line references for every claim, making the review easy to retrace.

## Recommendation

Approve — the diff is correct and improves accuracy. As a follow-up nit, fix the residual "APCA" on line 36 so the README is internally consistent.