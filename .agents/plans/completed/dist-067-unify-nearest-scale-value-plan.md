# Plan: DIST-067: Unify the two `nearestScaleValue` copies

## Summary

Unify duplicated `nearestScaleValue` functions into a shared helper module `lib/extract/structure/scaleMatch.ts` with explicit tolerance parameter for both `tokenLink.ts` and `regionMetrics.ts`.

## Metadata

| Field | Value |
|-------|-------|
| Type | REFACTOR |
| Complexity | LOW |
| Systems Affected | lib/extract/structure/scaleMatch.ts, tokenLink.ts, regionMetrics.ts |
| GitHub Issue | #129 |

---

## Tasks

### Task 1: Create shared scaleMatch helper module
- **File**: `lib/extract/structure/scaleMatch.ts`
- **Implement**: Export `nearestScaleValue(value, scale, tolerance)` with doc comments explaining call site tolerance rationale.

### Task 2: Refactor tokenLink.ts and regionMetrics.ts
- **Files**: `lib/extract/structure/tokenLink.ts`, `lib/extract/structure/regionMetrics.ts`
- **Implement**: Replace local copies of `nearestScaleValue` with imported shared helper passing `GAP_MATCH_TOLERANCE` (2) and `PAD_SNAP_TOLERANCE` (4).

---

## Validation

```bash
npm run typecheck
npm run lint
npm run eval
```
