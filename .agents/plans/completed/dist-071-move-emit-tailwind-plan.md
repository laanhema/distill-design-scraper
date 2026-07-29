# Plan: DIST-071: Move `emitTailwindTheme` out of `lib/emit.ts` so `js-yaml` leaves the client bundle

## Summary

Move `emitTailwindTheme` into its own standalone module `lib/emitTailwind.ts` to eliminate `js-yaml` and `reportSchema` from client-side bundle dependencies when `app/page.tsx` imports Tailwind theme generation.

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT |
| Complexity | LOW |
| Systems Affected | lib/emitTailwind.ts, lib/emit.ts, app/page.tsx |
| GitHub Issue | #133 |

---

## Tasks

### Task 1: Create lib/emitTailwind.ts
- **File**: `lib/emitTailwind.ts`
- **Implement**: Move `emitTailwindTheme` and its private helper `cssFontName` to `lib/emitTailwind.ts`.

### Task 2: Update lib/emit.ts and app/page.tsx
- **Files**: `lib/emit.ts`, `app/page.tsx`
- **Implement**: Remove `emitTailwindTheme` from `lib/emit.ts` and update `app/page.tsx` import to `@/lib/emitTailwind`.

---

## Validation

```bash
npm run typecheck
npm run lint
npm run eval
npm run build
```
