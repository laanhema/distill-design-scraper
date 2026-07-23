# Code Review: feature/skip-cache-url-structure-failure

**Scope**: branch `feature/skip-cache-url-structure-failure` vs `main`, including uncommitted changes (1 file: `app/api/analyze/route.ts`, +9/−1)
**Recommendation**: APPROVE

## Summary

The change stops the URL-analysis path of `POST /api/analyze` from caching responses produced after a transient structure-lane exception (issue #24 / DIST-018). It introduces `structureUnavailableReason`, set only inside the existing `catch` around `extractStructureFromCapture`, surfaces it in the response payload, and gates `setCache` on its absence — a faithful mirror of the image path's established pattern (route.ts:175–181). The diff is minimal, matches the codebase's conventions, and does not alter any success-path behavior.

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions
None. (Considered and dismissed: the static failure message doesn't distinguish failure kinds — but this exactly mirrors the image lane's static message at `lib/analyze.ts:255`, so introducing more granularity here would be inconsistent scope creep. `structureUnavailableReason: undefined` in the payload serializes to an absent key, so tokens-only and success responses are byte-identical to before.)

## Verification Notes

- The reason is set only in the `catch`, which is only reachable when `mode` is `structure`/`both` — `tokens` requests cache exactly as before.
- A successful-but-null structure extraction (no throw) still caches, unchanged from today; only a thrown exception skips the cache, so a retry re-enters the pipeline (cache lookup at route.ts:119–124 misses).
- The frontend already consumes the field generically (`app/page.tsx:143`, banner at `app/page.tsx:326–328`), so surfacing it on the URL path is additive and immediately useful, with no client change required.
- The guarded `setCache` carries a comment citing the same review finding as the image path, keeping the two branches discoverable together.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | PASS |
| Eval regression gate (`npm run eval`) | PASS (all gates passed) |

## What's Good

- Exact structural mirror of the image path's skip-cache condition rather than a new ad-hoc mechanism.
- Failure is recorded from the thrown-exception path only, never inferred from a null return value — preserving the project's "missing signal ≠ failure" discipline.
- Response-shape change is strictly additive and already supported by the client.

## Recommendation

Approve. Ready for commit/PR; no changes requested.
