# Code Review: rate-limiter-bucket-eviction (unstaged changes)

**Scope**: Unstaged working-tree changes on `feature/rate-limit-analyze-endpoint` —
`lib/security/rateLimiter.ts` (bounded-eviction fix), `README.md` (env-var doc),
plus a filename-only rename of the panorama-capture plan and new `.agents/`
plan/report/review docs.
**Recommendation**: APPROVE

## Summary

This is the follow-up fix to the High-priority finding in the prior review
(`.agents/reviews/rate-limit-analyze-endpoint-review.md`): the `buckets` Map
in `lib/security/rateLimiter.ts` had no eviction, so a spoofed
`X-Forwarded-For` per request could grow it forever. The fix adds
`RATE_LIMIT_MAX_BUCKETS` (default 50,000), a stale-entry sweep, and a
Map-insertion-order LRU fallback, triggered only on new-key inserts. I
verified the fix directly: flooding 500 distinct new client IDs against a cap
of 100 correctly evicted an old, still-exhausted client's bucket (it got a
fresh token on next request), while an untouched, still-exhausted client near
the tail stayed correctly blocked — the store is now bounded and the eviction
targets the right entries.

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions

- **`Math.floor(parsePositiveNumber(...))` can silently produce `maxBuckets = 0` for a fractional `RATE_LIMIT_MAX_BUCKETS` in `(0, 1)`** (`lib/security/rateLimiter.ts:118-120`), e.g. a typo like `RATE_LIMIT_MAX_BUCKETS=0.5`. `parsePositiveNumber` only rejects `NaN`/`≤0`, so `0.5` passes through as a valid positive number and only becomes `0` after the subsequent `Math.floor`. With `maxBuckets = 0`, `evictIfAtCapacity`'s guard (`if (buckets.size < maxBuckets) return;`) never short-circuits and its `while (buckets.size >= maxBuckets)` loop (`>= 0`) evicts every entry on every new-key insert — the store still stays bounded (so this isn't a memory-safety regression), but it silently defeats cross-client rate limiting for any config in that narrow fractional range rather than falling back to the documented default. Verified with a scratch script. Low impact (requires a specific malformed env value) — worth a one-line guard (e.g. clamp/floor before the `≤0` fallback check, or reject non-integers) if you want the env parsing to fail closed to the default instead of failing open to "evict everything."

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | N/A — `next lint` drops into an interactive first-time ESLint setup prompt; no `.eslintrc`/`eslint.config.*` exists anywhere in this repo's git history, so this is a pre-existing environment gap, unrelated to this change |
| Eval (`npm run eval`) | PASS — 100% aggregate, unaffected as expected (limiter lives only in the route/its own module, never imported by `eval/run.ts`) |
| Manual verification | Confirmed via scratch scripts (`npx tsx`, deleted after use): (1) bounded eviction under a 500-distinct-client flood against a cap of 100 correctly evicts old idle entries and preserves recently-touched ones; (2) the `maxBuckets = 0` edge case above |

## What's Good

- Correctly closes the exact gap the prior review flagged — the fix matches the plan's design precisely (stale-sweep-then-LRU, `lastRefillAt` reused as the touch timestamp, no new field needed).
- Eviction only runs on the new-key path (`if (!existing)` branch in `getOrRefillBucket`), so the amortized cost is one sweep per distinct new client, not per request — existing clients' hot path is untouched.
- Correctly reasons about idle-entry safety: sweeping entries idle ≥ one window is behavior-preserving (their tokens have already refilled to full, so deleting them is unobservable to that client).
- README and the module's file-level doc comment were updated together with the code, and both accurately describe the new behavior — no drift between docs and implementation this time (unlike the prior report on the base feature, which the earlier review caught misdescribing the store as already having lazy-expiry).
- No `setInterval`/background timer, keeping the module correct in serverless/edge runtimes where background timers aren't guaranteed to run — matches the plan's explicit constraint.

## Recommendation

Ready to merge as-is. The one suggestion (fractional `RATE_LIMIT_MAX_BUCKETS` silently zeroing out) is a minor config-robustness nit, not a correctness or security issue in the shipped default path — fine to fix now or leave for a future pass.
