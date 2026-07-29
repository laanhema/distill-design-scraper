# Plan: DIST-068: Unify the two `mode<T>` copies without moving measured output

## Summary

Unify the two `mode<T>` implementations in `tokens.ts` and `typography.ts` into a shared module `lib/extract/mode.ts` with explicit tie-break semantics (first-seen wins) and optional fallback for empty inputs.

## Metadata

| Field | Value |
|-------|-------|
| Type | REFACTOR |
| Complexity | LOW |
| Systems Affected | lib/extract/mode.ts, tokens.ts, typography.ts |
| GitHub Issue | #130 |

---

## Tasks

### Task 1: Create shared mode helper module
- **File**: `lib/extract/mode.ts`
- **Implement**: Export overloaded `mode<T>(values, fallback?)` function with doc comments explaining first-seen tie-break rules and empty input fallback handling.

### Task 2: Refactor tokens.ts and typography.ts
- **Files**: `lib/extract/tokens.ts`, `lib/extract/typography.ts`
- **Implement**: Replace local `mode<T>` copies with import of `mode` from `./mode`.

---

## Validation

```bash
npm run typecheck
npm run lint
npm run eval
```
