# Plan: DIST-039 — First live end-to-end verification of all three AI lanes

## Summary

Verify live end-to-end functionality across all three AI lanes (`interpret.ts`, `structureAI.ts`, `structureFromImage.ts`) with `GEMINI_API_KEY`. Confirm offline behavior of `npm run eval` and stability harness execution.

## Metadata

| Field | Value |
|-------|-------|
| Type | TECHNICAL / VERIFICATION |
| Complexity | MEDIUM |
| Systems Affected | `lib/interpret.ts`, `lib/extract/structure/structureAI.ts`, `lib/extract/structureFromImage.ts`, `eval/` |
| GitHub Issue | #73 |

---

## Tasks

### Task 1: Execute verification gates and document results
- **File**: `.agents/reports/dist-039-e2e-ai-verification-report.md`
- **Action**: CREATE
- **Implement**: Run `npm run lint`, `npm run typecheck`, `npm run eval`, and `npm run eval:ai`. Verify all three AI lanes operate cleanly with `GEMINI_API_KEY` set.
- **Validate**: `npm run lint && npm run typecheck && npm run eval`

---

## Validation

- Type check: `npm run typecheck`
- Lint: `npm run lint`
- Eval harness: `npm run eval`
- AI stability: `npm run eval:ai`
