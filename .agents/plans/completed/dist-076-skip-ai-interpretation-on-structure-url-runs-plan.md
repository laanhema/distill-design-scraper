# Plan: DIST-076: Skip the AI interpretation lane on `mode: "structure"` URL runs

## Summary

Add `mode` parameter to `analyzeUrl` in `lib/analyze.ts` and pass `mode` from `app/api/analyze/route.ts`. Use `wantsTokenEnrichment = mode === "tokens" || mode === "both"` to skip `enrichWithAI` when `mode === "structure"`.

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT |
| Complexity | LOW |
| Systems Affected | lib/analyze.ts, app/api/analyze/route.ts |
| GitHub Issue | #138 |

---

## Tasks

### Task 1: Add mode parameter to analyzeUrl and gate enrichWithAI
- **Files**: `lib/analyze.ts`, `app/api/analyze/route.ts`
- **Implement**: Accept `mode: "tokens" | "structure" | "both" = "both"` in `analyzeUrl` and skip `enrichWithAI` when `wantsTokenEnrichment` is false.

---

## Validation

```bash
npm run typecheck
npm run lint
npm run eval
```
