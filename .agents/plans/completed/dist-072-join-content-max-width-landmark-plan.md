# Plan: DIST-072: Join `computeContentMaxWidth` on landmark identity, not a post-AI-rename name

## Summary

Update `computeContentMaxWidth` in `lib/extract/structure/structureEmit.ts` to check landmark identity (`landmark === "main"`, `tagName === "main"`) in addition to `section` tags and `MainContent` component names.

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | LOW |
| Systems Affected | lib/extract/structure/structureEmit.ts |
| GitHub Issue | #134 |

---

## Tasks

### Task 1: Update main region matching in computeContentMaxWidth
- **File**: `lib/extract/structure/structureEmit.ts`
- **Implement**: Include `node.landmark === "main"` and `node.tagName === "main"` when identifying main region containers.

---

## Validation

```bash
npm run typecheck
npm run lint
npm run eval
```
