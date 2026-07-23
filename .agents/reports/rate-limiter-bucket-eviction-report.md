# Implementation Report

**Plan**: `.agents/plans/rate-limiter-bucket-eviction.plan.md`
**Branch**: `feature/rate-limit-analyze-endpoint`
**Status**: COMPLETE

## Summary

Bounded `lib/security/rateLimiter.ts`'s in-memory `buckets` Map to at most
`RATE_LIMIT_MAX_BUCKETS` (default 50,000) distinct client keys. When a new
client key would push the store over the cap, idle entries (a full window
past their last touch) are swept first; if genuinely-active distinct clients
still exceed the cap, the least-recently-touched entry is evicted using the
Map's own insertion-order guarantee as a cheap LRU (every touch — read or
refill — deletes-then-re-inserts the key). This closes the unbounded-memory
vector where an attacker spoofing `X-Forwarded-For` per request could add one
permanent map entry per request.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Add bounded eviction to the bucket store | `lib/security/rateLimiter.ts` | ✅ |
| 2 | Manually verify bounded growth and unaffected legitimate behavior | scratch script (deleted after use) | ✅ |
| 3 | Document `RATE_LIMIT_MAX_BUCKETS` | `README.md` | ✅ |

## Validation Results

| Check | Result |
|-------|--------|
| Type check (`npm run typecheck`) | ✅ |
| Lint (`npm run lint`) | ⚠️ N/A — pre-existing gap (no committed ESLint config; `next lint` drops into an interactive setup prompt), already documented in `.agents/reports/rate-limit-analyze-endpoint-report.md` |
| Eval (`npm run eval`) | ✅ 100% aggregate, all gates passed, unaffected by this change |
| Manual verification | ✅ all 3 checks passed (see below) |

### Manual verification detail

Ran a scratch script (`npx tsx`, deleted after use) with `RATE_LIMIT_MAX_BUCKETS=1000` for a fast test:

1. **Bounded under spoofing churn**: 5,000 distinct spoofed client IDs, one call each → bucket map size stayed at/under the 1,000 cap throughout (measured via a temporary debug export, removed before finalizing).
2. **Legitimate low-cardinality behavior unaffected**: 20-request default capacity enforced per client, 21st request throws `RateLimitExceededError` with a positive `retryAfterSeconds`, independent per-client budgets confirmed, `RATE_LIMIT_DISABLED` bypass confirmed.
3. **Active clients under the cap aren't evicted mid-window**: a client's token count persisted correctly across interleaved calls with other clients (21st cumulative call for that client threw, exactly as capacity dictates) — confirming the LRU touch-reinsert doesn't reset or lose bucket state for clients that stay under the cap.

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/security/rateLimiter.ts` | UPDATE | +34/-3 |
| `README.md` | UPDATE | +3/-0 (within the already-uncommitted rate-limiting section from the parent feature branch) |

## Deviations from Plan

None. Implementation matches the plan's `evictIfAtCapacity` design, threading `maxBuckets` through `getOrRefillBucket`, and the LRU touch-reinsert on the existing-key branch, exactly as specified.

## Tests Written

No committed test files (repo has no unit-test framework; `npm run eval` is the offline regression gate and doesn't exercise this module). Verification was done via a throwaway `npx tsx` script per `CLAUDE.md`'s documented pattern, deleted after use — see "Manual verification detail" above for the cases covered.
