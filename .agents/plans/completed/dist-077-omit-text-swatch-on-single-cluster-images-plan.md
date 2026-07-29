# Plan: DIST-077: Omit `text` rather than duplicating the background hex on single-cluster images

## Summary

Remove `|| swatches.length === 1` fallback when building text role swatches in `lib/extract/imagePalette.ts`. On single-cluster images, the `text` swatch is omitted rather than duplicating the background hex and emitting a 1:1 `fail` contrast pair.

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | LOW |
| Systems Affected | lib/extract/imagePalette.ts |
| GitHub Issue | #139 |

---

## Tasks

### Task 1: Remove single-cluster fallback in text swatch assignment
- **File**: `lib/extract/imagePalette.ts`
- **Implement**: Remove `|| swatches.length === 1` condition from `bestTextCluster` assignment.

---

## Validation

```bash
npm run typecheck
npm run lint
npm run eval
```
