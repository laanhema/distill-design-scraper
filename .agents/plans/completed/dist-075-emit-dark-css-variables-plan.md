# Plan: DIST-075: Emit a `prefers-color-scheme: dark` block from `renderCssVariables`

## Summary

Update `renderCssVariables` in `lib/emit.ts` to include a `@media (prefers-color-scheme: dark)` block containing dark scheme CSS variables when `report.paletteDark` exists.

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT |
| Complexity | LOW |
| Systems Affected | lib/emit.ts |
| GitHub Issue | #137 |

---

## Tasks

### Task 1: Add prefers-color-scheme: dark block to renderCssVariables
- **File**: `lib/emit.ts`
- **Implement**: Check `report.paletteDark` and emit `@media (prefers-color-scheme: dark) { :root { ... } }` block matching `emitTailwindTheme`'s variable selection.

---

## Validation

```bash
npm run typecheck
npm run lint
npm run eval
```
