# Plan: DIST-041 — Motion/transition token lane

## Summary

Extract declared CSS transitions and animations as a measured motion token lane (`lib/extract/motion.ts`), attributed to recipe element classes (Button, Card, TextLink, etc.) and including referenced `@keyframes` definitions.

## Metadata

| Field | Value |
|-------|-------|
| Type | FEATURE |
| Complexity | MEDIUM |
| Systems Affected | `lib/extract/styleDump.ts`, `lib/extract/recipes.ts`, `lib/extract/motion.ts`, `lib/schema.ts`, `lib/emit.ts`, `lib/analyze.ts` |
| GitHub Issue | #75 |

---

## Tasks

### Task 1: Update style dump to collect motion and keyframes
- **File**: `lib/extract/styleDump.ts`
- **Action**: UPDATE
- **Implement**: Collect transition and animation properties per node, update skip gate with `hasMotion` condition, and collect `@keyframes` rules from stylesheets.

### Task 2: Implement motion extraction and schema
- **File**: `lib/extract/motion.ts`, `lib/extract/recipes.ts`, `lib/schema.ts`, `lib/emit.ts`, `lib/analyze.ts`
- **Action**: CREATE / UPDATE
- **Implement**: Export `classify` in `recipes.ts`, define `motionSchema` in `schema.ts`, extract motion tokens in `motion.ts` with paren-depth aware parsing, and render motion in `emit.ts`.

---

## Validation

- Type check: `npm run typecheck`
- Lint: `npm run lint`
- Eval harness: `npm run eval`
