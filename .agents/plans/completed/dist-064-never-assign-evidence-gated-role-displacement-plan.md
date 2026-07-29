# Plan: DIST-064: Never assign an evidence-gated semantic role by displacement

## Summary

Prevent `applyRoleRefinements` from assigning non-refinable semantic roles (`success`/`warning`/`danger`/`on-primary`) to displaced swatches during AI role refinement swaps. Displaced non-refinable roles are dropped rather than reassigned. Also resolve ambiguous hex matching when multiple swatches share a hex.

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | LOW |
| Systems Affected | lib/interpret.ts, lib/schema.ts, lib/emit.ts |
| GitHub Issue | #126 |

---

## Tasks

### Task 1: Allow role-less swatches in schema and emit
- **Files**: `lib/schema.ts`, `lib/emit.ts`, `lib/extract/roleMatch.ts`
- **Implement**: Make `Swatch` `role`, `name`, and `usage` optional fields so a swatch can be role-less. Ensure rendering safely handles role-less swatches.

### Task 2: Constrain displacement in role refinements
- **File**: `lib/interpret.ts`
- **Implement**: Update `applyRoleRefinements` to check `isRefinableRole(from)` before swapping `from` onto `holder`. If `from` is not refinable, call `dropRole(holder)`. Filter duplicate hex matches to prefer refinable roles or skip if ambiguous.

---

## Validation

```bash
npm run typecheck
npm run lint
npm run eval
```
