# Plan: Bound the response cache (entry cap + LRU + sweep)

## Summary

`lib/cache.ts` is an unbounded `Map` whose entries are only deleted when re-read after expiry — keys never requested again (each holding multi-MB base64 screenshot payloads) live forever. Bound it exactly the way `lib/security/rateLimiter.ts` was bounded against the same class of bug: a named, env-tunable entry cap with expired-first sweep then LRU eviction on insert, LRU recency refresh (delete + re-set) on cache hit, and a periodic unref'd interval sweep that removes expired entries without requiring a read. No API-shape change: `createCacheKey` / `getCache` / `setCache` signatures stay identical, so the sole consumer (`app/api/analyze/route.ts`) is untouched.

## User Story

As an operator
I want the response cache bounded like the rate limiter already is
So that never-again-requested entries holding multi-MB base64 screenshots cannot grow the heap without limit.

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT (hardening) |
| Complexity | MEDIUM |
| Systems Affected | `lib/cache.ts` only (consumer `app/api/analyze/route.ts` unchanged) |
| GitHub Issue | #17 |

---

## Patterns to Follow

### Bounded-store constants + env tunables (mirror this)

```ts
// SOURCE: lib/security/rateLimiter.ts:28-30
const DEFAULT_MAX_REQUESTS = 20;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_BUCKETS = 50_000;
```

Env vars are read fresh on each call (not cached at module load) so they stay tunable and testable — see `assertWithinRateLimit` (`lib/security/rateLimiter.ts:119-137`) and its doc comment.

### Integer env parsing that rejects degenerate values

```ts
// SOURCE: lib/security/rateLimiter.ts:44-53
function parsePositiveNumber(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

function parsePositiveInteger(raw: string | undefined, fallback: number): number {
  const parsed = Math.floor(parsePositiveNumber(raw, fallback));
  return parsed < 1 ? fallback : parsed;
}
```

### Sweep-idle-then-LRU eviction at capacity

```ts
// SOURCE: lib/security/rateLimiter.ts:55-70
function evictIfAtCapacity(maxBuckets: number, windowMs: number): void {
  if (buckets.size < maxBuckets) return;
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefillAt >= windowMs) buckets.delete(key);
  }
  while (buckets.size >= maxBuckets) {
    const oldestKey = buckets.keys().next().value;
    if (oldestKey === undefined) break;
    buckets.delete(oldestKey);
  }
}
```

### LRU recency via Map delete + re-set

```ts
// SOURCE: lib/security/rateLimiter.ts:86-87
buckets.delete(key);
buckets.set(key, existing);
```

A `Map` iterates in insertion order, so delete + re-set on every touch keeps the first-iterated key the least-recently-used one (this is the exact technique the issue's technical-notes comment calls out).

### Doc-comment style

`lib/security/rateLimiter.ts:1-16` opens with a block comment explaining *why* the store is bounded ("must not itself be an unbounded-growth vector"). Extend `lib/cache.ts`'s existing header comment the same way.

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/cache.ts` | UPDATE | Add entry cap + LRU eviction + periodic sweep; refresh recency on hit |

No other files change. `app/api/analyze/route.ts:3,68,70,129,169` keeps using the same three exports with the same signatures.

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Add bounded-cache constants and env parsing to `lib/cache.ts`

- **File**: `lib/cache.ts`
- **Action**: UPDATE
- **Implement**:
  - Add named constants with brief comments, mirroring the `RATE_LIMIT_MAX_BUCKETS` pattern:
    - `DEFAULT_MAX_ENTRIES = 50` — cap on cached responses; entries carry multi-MB base64 screenshot payloads, so the default is deliberately small (~hundreds of MB worst case, not unbounded).
    - `SWEEP_INTERVAL_MS = 60_000` — how often the periodic sweep removes expired entries that are never re-read.
  - Add a `parsePositiveInteger`-style helper (copy the two small helpers from `lib/security/rateLimiter.ts:44-53`; they are 10 lines — duplicating locally is consistent with the codebase, which keeps `lib/security/` self-contained, but do NOT import from `lib/security/rateLimiter.ts` since that would couple the cache to the limiter module).
  - Read `CACHE_MAX_ENTRIES` env var fresh inside `setCache` (not at module load), defaulting to `DEFAULT_MAX_ENTRIES` — same "tunable and testable" rationale as the rate limiter's doc comment.
  - Extend the file's header doc comment to explain the bounding rationale (unbounded-growth vector, mirrors the rate limiter), in the style of `lib/security/rateLimiter.ts:1-16`.
- **Mirror**: `lib/security/rateLimiter.ts:28-53`
- **Validate**: `npm run typecheck`

### Task 2: LRU recency refresh on cache hit

- **File**: `lib/cache.ts`
- **Action**: UPDATE
- **Implement**: In `getCache`, on a live (non-expired) hit, delete + re-set the entry so it moves to the end of the Map's insertion order (most recently used). Expired-on-read behavior stays as-is (delete, return null). Return value and signature unchanged.
- **Mirror**: `lib/security/rateLimiter.ts:86-87`
- **Validate**: `npm run typecheck`

### Task 3: Cap enforcement on insert (sweep expired first, then LRU-evict)

- **File**: `lib/cache.ts`
- **Action**: UPDATE
- **Implement**:
  - Add `evictIfAtCapacity(maxEntries: number): void` mirroring `lib/security/rateLimiter.ts:55-70`: if `cacheStore.size < maxEntries` return; otherwise first delete every entry with `Date.now() > expiresAt` (expired — deleting changes no observable behavior, exactly like the limiter's idle-bucket rationale), then `while (cacheStore.size >= maxEntries)` delete `cacheStore.keys().next().value` (the LRU entry, given Tasks 2/3 maintain recency ordering).
  - In `setCache`: first `cacheStore.delete(key)` (so overwriting an existing key refreshes its position rather than double-counting), then call `evictIfAtCapacity(maxEntries)`, then `set`. This guarantees total entries never exceed the cap.
- **Mirror**: `lib/security/rateLimiter.ts:55-70,72-89`
- **Validate**: `npm run typecheck`

### Task 4: Periodic sweep of expired entries

- **File**: `lib/cache.ts`
- **Action**: UPDATE
- **Implement**:
  - Add `sweepExpired(): void` — iterate `cacheStore`, delete every entry whose `expiresAt` has passed.
  - Start the sweep lazily: a module-level `let sweepTimer: NodeJS.Timeout | null = null`; in `setCache`, if `sweepTimer === null`, `sweepTimer = setInterval(sweepExpired, SWEEP_INTERVAL_MS)` and call `sweepTimer.unref()` so the interval never keeps the process alive (critical: eval/scripts and `next build` import graphs must still exit cleanly; module-load side effects are why the timer is lazy, not top-level).
- **Mirror**: pattern is new to the codebase (the limiter sweeps opportunistically), but the AC explicitly requires expired entries to be removed "without requiring a read", and `.unref()` keeps it side-effect-safe.
- **Validate**: `npm run typecheck`

### Task 5: Behavioral smoke check (scratch, then delete)

- **File**: scratch script in the session scratchpad directory (NOT the repo)
- **Action**: VERIFY
- **Implement**: Since the repo has no unit test framework and the eval harness never touches `lib/cache.ts`, verify the three ACs with a scratch `npx tsx` script run **from the project root**:
  1. Insert cap+2 entries → size never exceeds cap, and the evicted keys are the least-recently-used ones (touch one early key via `getCache` first and assert it survived).
  2. Insert entries with tiny `ttlMs`, wait past expiry (mock by inserting with `ttlMs` of ~10ms and sleeping), call `setCache` for an unrelated key at capacity → expired entries are gone without any `getCache` on them. (Directly exercising the interval would need a 60s wait; instead also assert `sweepExpired` behavior indirectly via the capacity sweep, and assert the timer is unref'd by the script exiting promptly.)
  3. Normal hit within TTL returns the cached value unchanged.
  Delete the scratch script afterwards (per CLAUDE.md).
- **Validate**: script assertions pass; script exits without hanging (proves `.unref()`).

---

## Risks

| Risk | Mitigation |
|------|------------|
| `setInterval` at module top-level would run during `next build` page-data collection and keep scripts alive | Start the timer lazily on first `setCache` and `.unref()` it |
| Evicting live entries at cap changes hit behavior for busy deployments | That is the intended LRU semantics per AC; expired entries are always evicted first so live evictions only happen when the cap is genuinely exceeded |
| Overwriting an existing key while at cap could evict a victim unnecessarily | `setCache` deletes the key being written *before* the capacity check |
| Fractional/zero `CACHE_MAX_ENTRIES` env value defeating the cap | Reuse the `parsePositiveInteger` floor-and-reject pattern (`rateLimiter.ts:49-53`) |

---

## Validation

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # known to fail non-interactively (no ESLint config) — pre-existing condition
npm run eval        # regression gate; cache.ts is not in the eval path, must pass unchanged (no baseline refresh)
```

---

## Acceptance Criteria

- [ ] More insertions than the cap → LRU entry evicted, size never exceeds cap
- [ ] Expired never-re-read entries removed by periodic sweep (no read required)
- [ ] Cache hits within TTL unchanged (hit returns cached response, refreshes recency)
- [ ] Limits are named constants with brief comments, mirroring `RATE_LIMIT_MAX_BUCKETS`
- [ ] `npm run typecheck` passes; `npm run eval` passes with no baseline change
