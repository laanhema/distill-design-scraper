# Plan: DIST-070: Remove the unreachable landmark-preservation branch in the pruner

## Summary

Remove the unreachable `root.landmark` preservation block inside the wrapper collapse branch in `lib/extract/structure/pruner.ts` (lines 61-63), replacing it with an explicit comment explaining why landmark-carrying nodes are never collapsed (`isMeaningfulContainer` includes `Boolean(root.landmark)`).

## Metadata

| Field | Value |
|-------|-------|
| Type | CLEANUP |
| Complexity | LOW |
| Systems Affected | lib/extract/structure/pruner.ts |
| GitHub Issue | #132 |

---

## Tasks

### Task 1: Remove dead branch in pruner.ts
- **File**: `lib/extract/structure/pruner.ts`
- **Implement**: Remove unreachable `if (root.landmark && !singleChild.landmark)` block and add explanatory note.

---

## Validation

```bash
npm run typecheck
npm run lint
npm run eval
```
