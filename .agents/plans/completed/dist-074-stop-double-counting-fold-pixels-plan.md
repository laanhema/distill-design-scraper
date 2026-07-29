# Plan: DIST-074: Stop double-counting above-the-fold pixels in palette area weights

## Summary

Update `extractFromCapture` in `lib/analyze.ts` to pass `capture.panoramaShot` alone as `screenshotPngBase64` when present, avoiding redundant sampling of `capture.viewportShot` (which is already included as tile 0 of `panoramaShot`).

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | LOW |
| Systems Affected | lib/analyze.ts |
| GitHub Issue | #136 |

---

## Tasks

### Task 1: Update extractPalette call arguments
- **File**: `lib/analyze.ts`
- **Implement**: Pass `screenshotPngBase64: capture.panoramaShot ?? capture.viewportShot` without double-passing viewportShot alongside panorama.

---

## Validation

```bash
npm run typecheck
npm run lint
npm run eval
```
