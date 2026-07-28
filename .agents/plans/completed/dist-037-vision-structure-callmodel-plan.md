# Plan: DIST-037 — Migrate vision structure lane and retire hand-written media-type union

## Summary

Migrate `lib/extract/structureFromImage.ts` (vision structure lane) to `callModel` with `ThinkingLevel.MEDIUM`. Remove Anthropic SDK import, hand-written media-type union, and latent `temperature: 0.1`.

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX / REFACTOR |
| Complexity | MEDIUM |
| Systems Affected | Vision structure lane (`lib/extract/structureFromImage.ts`) |
| GitHub Issue | #71 |

---

## Tasks

### Task 1: Update `lib/extract/structureFromImage.ts`
- **File**: `lib/extract/structureFromImage.ts`
- **Action**: UPDATE
- **Implement**: Remove Anthropic SDK import, remove hand-written media-type union in `requestOnce`, update `requestOnce` to use `callModel` with `ThinkingLevel.MEDIUM` and `parseJsonLoose`, remove `temperature: 0.1`, update docstring reference to `GEMINI_API_KEY`.
- **Validate**: `npm run lint && npm run typecheck && npm run eval`

---

## Validation

- Type check: `npm run typecheck`
- Lint: `npm run lint`
- Eval harness: `npm run eval`
