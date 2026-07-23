# Code Review: feature/bound-response-cache

**Scope**: branch `feature/bound-response-cache` vs `main`, including uncommitted changes (`lib/cache.ts`, +85/-0)
**Recommendation**: APPROVE (with one minor suggestion)

## Summary

Reviewed the bounded-response-cache change for issue #17 (DIST-011). `lib/cache.ts` gains an env-tunable entry cap with expired-first sweep then LRU eviction on insert, LRU recency refresh on read hits, and a lazily-started, `unref()`d periodic sweep — closely mirroring the established `lib/security/rateLimiter.ts` bounding pattern, with the public API (`createCacheKey`/`getCache`/`setCache`) unchanged so the sole consumer `app/api/analyze/route.ts` is untouched. The logic is correct against all four acceptance criteria.

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions
- `lib/cache.ts:43-53` — `parsePositiveNumber`/`parsePositiveInteger` are verbatim duplicates of `lib/security/rateLimiter.ts:44-53`. Duplication is a defensible call (avoids coupling the cache to the security module, and the codebase's "don't reintroduce copies" rule targets extraction helpers like `roleMatch`/`styleMatch`), but if a third env-parsing call site ever appears, these should move to a tiny shared `lib/env.ts`-style helper. No action required now.

## Correctness Notes (verified)

- Cap invariant: `evictIfAtCapacity` loops `while (size >= maxEntries)` before exactly one insert, so post-insert size never exceeds the cap (AC1).
- Expired entries are deleted by the sweep with no read of their keys (AC2); the same `sweepExpired` also runs first at capacity so live entries are only evicted when genuinely over cap.
- Hit-within-TTL returns the cached value unchanged and refreshes recency via delete + re-set, keeping the Map's iteration head the true LRU candidate (AC3).
- Limits are named constants (`DEFAULT_MAX_ENTRIES`, `SWEEP_INTERVAL_MS`) with brief comments mirroring `RATE_LIMIT_MAX_BUCKETS` (AC4); `CACHE_MAX_ENTRIES` is read fresh per call and degenerate values (0, negative, fractional < 1, non-numeric) safely fall back to the default.
- `setCache` deletes the incoming key before the capacity check, so overwriting an existing key at cap cannot evict an unrelated victim.
- The sweep interval is started lazily on first write and `unref()`d — no module-load side effects; builds/scripts importing this module still exit promptly (verified empirically: the smoke script exited in ~1s).
- Per-process only, like the rate limiter beside it — consistent with the documented MVP stance.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | PRE-EXISTING FAILURE — hangs on Next.js interactive ESLint-config prompt (repo has no ESLint config); unrelated to this change |
| Tests (`npm run eval`) | PASS — clean-light 100%, dark-mode 100%, aggregate 100%, all gates passed, no baseline change |

## What's Good

- Faithful reuse of the proven rate-limiter bounding pattern, including the floor-and-reject env parsing edge case.
- The overwrite-at-cap delete-first ordering is a subtle correctness detail many LRU implementations get wrong.
- Thorough doc comments explain *why* the store is bounded, matching the codebase's documentation style.

## Recommendation

Approve. Ready to commit and open a PR (per repo policy, a separate follow-up command handles commit/PR).
