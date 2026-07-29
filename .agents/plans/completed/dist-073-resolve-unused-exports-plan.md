# Plan: DIST-073: Resolve the ten exports that have no importer

## Summary

Audit and resolve unused module exports. Retain security predicates (`isBlockedIpv4`, `isBlockedIpv6`, `parseAllowlist` in `ssrfGuard.ts`) and model declaration (`AI_MODEL` in `aiLane.ts`) with documented rationales, while dropping `export` keywords on internal helpers in `styleMatch.ts`, `tokens.ts`, and `eval/score.ts`.

## Metadata

| Field | Value |
|-------|-------|
| Type | CLEANUP |
| Complexity | LOW |
| Systems Affected | ssrfGuard.ts, aiLane.ts, styleMatch.ts, tokens.ts, eval/score.ts |
| GitHub Issue | #135 |

---

## Tasks

### Task 1: Annotate auditability and model-pin export rationales
- **Files**: `lib/security/ssrfGuard.ts`, `lib/aiLane.ts`
- **Implement**: Add rationale doc comments explaining why `isBlockedIpv4`, `isBlockedIpv6`, `parseAllowlist`, and `AI_MODEL` remain exported.

### Task 2: Drop unused exports on module internals
- **Files**: `lib/extract/structure/styleMatch.ts`, `lib/extract/tokens.ts`, `eval/score.ts`
- **Implement**: Make `boundsDistance`, `BOUNDS_MATCH_TOLERANCE`, `extractSpacing`, `extractRadius`, `extractElevation`, and `PALETTE_DELTA_E_TOLERANCE` module-private.

---

## Validation

```bash
npm run typecheck
npm run lint
npm run eval
```
