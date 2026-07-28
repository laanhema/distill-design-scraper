# Plan: DIST-040 — Make AI-lane failure distinguishable from "no key configured"

## Summary

Add a shared `warnAiFailure` logger in `lib/aiLane.ts` that categorizes and logs failures (e.g. distinguishing 429 Rate Limit / Quota Exceeded from 400 Bad Request) when an AI key is set and a call fails. Wire `warnAiFailure` into all three AI lanes (`interpret.ts`, `structureAI.ts`, `structureFromImage.ts`).

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT / OBSERVABILITY |
| Complexity | SMALL |
| Systems Affected | `lib/aiLane.ts`, `lib/interpret.ts`, `lib/extract/structure/structureAI.ts`, `lib/extract/structureFromImage.ts` |
| GitHub Issue | #74 |

---

## Tasks

### Task 1: Add `warnAiFailure` and wire into AI lanes
- **File**: `lib/aiLane.ts`, `lib/interpret.ts`, `lib/extract/structure/structureAI.ts`, `lib/extract/structureFromImage.ts`
- **Action**: UPDATE
- **Implement**: Implement `warnAiFailure(laneName, attempt, err)` in `lib/aiLane.ts` and call it from the `retryOnce` `onError` handler across all three AI lanes.
- **Validate**: `npm run lint && npm run typecheck && npm run eval`

---

## Validation

- Type check: `npm run typecheck`
- Lint: `npm run lint`
- Eval harness: `npm run eval`
