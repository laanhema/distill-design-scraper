# Plan: DIST-066: Unify the band-segment regex and `structuralPart` behind one seam

## Summary

Extract the duplicated layout-annotation segment classification regex and `structuralPart` function into a shared helper module `lib/extract/structure/annotationSegments.ts`, used by both `sections.ts` (section digest) and `responsive.ts` (responsive diff).

## Metadata

| Field | Value |
|-------|-------|
| Type | REFACTOR |
| Complexity | LOW |
| Systems Affected | lib/extract/structure/annotationSegments.ts, sections.ts, responsive.ts |
| GitHub Issue | #128 |

---

## Tasks

### Task 1: Create shared annotationSegments helper module
- **File**: `lib/extract/structure/annotationSegments.ts`
- **Implement**: Export `BAND_SEGMENT_REGEX`, `bandPart`, and `structuralPart` with doc comments explaining both consumers.

### Task 2: Refactor sections.ts and responsive.ts
- **Files**: `lib/extract/structure/sections.ts`, `lib/extract/structure/responsive.ts`
- **Implement**: Replace local duplicate regexes and `structuralPart` functions with imports from `annotationSegments.ts`.

---

## Validation

```bash
npm run typecheck
npm run lint
npm run eval
```
