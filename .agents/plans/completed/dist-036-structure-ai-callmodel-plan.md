# Plan: DIST-036 — Migrate structure Stage 7 to callModel and delete latent temperature: 0.1

## Summary

Migrate `lib/extract/structure/structureAI.ts` (Stage 7 structure labeller) from `@anthropic-ai/sdk` to `callModel` using Gemini native JSON mode with `STRUCTURE_SCHEMA`, `parseJsonLoose`, and `ThinkingLevel.LOW`. Delete the latent `temperature: 0.1` bug.

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX / REFACTOR |
| Complexity | MEDIUM |
| Systems Affected | Structure lane (`lib/extract/structure/structureAI.ts`) |
| GitHub Issue | #70 |

---

## Tasks

### Task 1: Update `lib/extract/structure/structureAI.ts`
- **File**: `lib/extract/structure/structureAI.ts`
- **Action**: UPDATE
- **Implement**: Remove Anthropic SDK import, add `STRUCTURE_SCHEMA`, migrate `requestOnce` to `callModel` with `maxOutputTokens: 4000` and `ThinkingLevel.LOW`, replace regex matching with `parseJsonLoose`, remove `temperature: 0.1`, update docstrings.
- **Validate**: `npm run lint && npm run typecheck && npm run eval`

---

## Validation

- Type check: `npm run typecheck`
- Lint: `npm run lint`
- Eval harness: `npm run eval`
