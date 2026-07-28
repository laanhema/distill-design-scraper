# Plan: DIST-042 — emitTailwindTheme(report) — a second derived view + download button

## Summary

Implement `emitTailwindTheme(report: Report): string` in `lib/emit.ts` to output a downloadable Tailwind v4 `@theme` file derived 1:1 from frontmatter fields. Wire a "Download Tailwind @theme" button into `app/page.tsx`.

## Metadata

| Field | Value |
|-------|-------|
| Type | FEATURE |
| Complexity | SMALL |
| Systems Affected | `lib/emit.ts`, `app/page.tsx` |
| GitHub Issue | #76 |

---

## Tasks

### Task 1: Implement `emitTailwindTheme` and wire download button
- **File**: `lib/emit.ts`, `app/page.tsx`
- **Action**: UPDATE
- **Implement**: Implement `emitTailwindTheme` mapping frontmatter values 1:1 to Tailwind v4 theme variables (including sub-keys and dark media query). Add download button to workbench UI.
- **Validate**: `npm run lint && npm run typecheck && npm run eval`

---

## Validation

- Type check: `npm run typecheck`
- Lint: `npm run lint`
- Eval harness: `npm run eval`
