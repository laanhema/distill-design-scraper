# Plan: Bound `rateLimiter.ts`'s Bucket Map (Fix Unbounded Memory Growth)

## Summary

`lib/security/rateLimiter.ts`'s `buckets` Map never evicts entries. Because
`extractClientId` trusts the client-controlled `X-Forwarded-For` header
verbatim, an attacker can send one request per spoofed IP, dodging the
per-client limit and adding one permanent entry to the map per request —
exactly the memory-exhaustion pattern the rate limiter exists to prevent.
This was flagged as the High-priority finding in
`.agents/reviews/rate-limit-analyze-endpoint-review.md:25` and verified
directly (200k distinct spoofed client IDs → ~30MB heap growth, zero
cleanup). The completion report's claim that the store mirrors
`lib/cache.ts`'s "lazy-expiry" pattern doesn't hold: `cache.ts`'s lazy
delete-on-read only bounds memory because its keys are content hashes that
get *re-read* on cache hits — a rate-limiter key that's used exactly once
(spoofed IP) is never read again, so delete-on-read for that key never
fires.

The fix keeps the module dependency-free and timer-free (no `setInterval` —
this must work correctly in serverless/edge runtimes where background
timers aren't guaranteed to run): add a hard cap (`RATE_LIMIT_MAX_BUCKETS`,
default 50,000) enforced opportunistically whenever a *new* client key would
be inserted. Before inserting, if the map is at capacity: first sweep out
entries that are idle for at least one full window (their tokens have
already refilled to full capacity, so deleting them changes no observable
behavior — a later request from that same client just starts a fresh full
bucket, indistinguishable from today). If still at capacity after the
sweep (i.e. genuinely high cardinality of *active* clients within one
window), evict the least-recently-touched entries using the Map's own
insertion-order guarantee as a cheap LRU: every touch (read or refill)
deletes-then-re-inserts the key, so the oldest key in iteration order is
always the least-recently-touched one.

## User Story

As a deployer of a public Distill instance
I want the rate limiter's own memory footprint to stay bounded regardless of how many distinct (possibly spoofed) client identifiers it sees
So that the feature protecting the server from resource exhaustion cannot itself be turned into a resource-exhaustion vector

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX (security hardening follow-up) |
| Complexity | LOW |
| Systems Affected | `lib/security/rateLimiter.ts`, `README.md` |
| GitHub Issue | N/A (raised in code review, not a tracked issue) |

---

## Patterns to Follow

### Existing `Map`-based store + lazy refill shape (what we're extending, not replacing)
```ts
// SOURCE: lib/security/rateLimiter.ts:22-53
interface Bucket {
  tokens: number;
  lastRefillAt: number;
}

const buckets = new Map<string, Bucket>();

function getOrRefillBucket(key: string, capacity: number, windowMs: number): Bucket {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing) {
    const fresh: Bucket = { tokens: capacity, lastRefillAt: now };
    buckets.set(key, fresh);
    return fresh;
  }

  const elapsedMs = now - existing.lastRefillAt;
  const refillRate = capacity / windowMs; // tokens/ms
  existing.tokens = Math.min(capacity, existing.tokens + elapsedMs * refillRate);
  existing.lastRefillAt = now;
  return existing;
}
```
`lastRefillAt` is already exactly the "last touched" timestamp the eviction
sweep needs — no new field required on `Bucket`.

### Env-var config read fresh per call, with a parse-and-fallback helper already in file
```ts
// SOURCE: lib/security/rateLimiter.ts:34-37
function parsePositiveNumber(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}
```
Reuse this directly for `RATE_LIMIT_MAX_BUCKETS` (an integer count, but the
existing helper's semantics — fallback on NaN/non-positive — are fine
without modification; `Math.floor` it at the call site since a fractional
cap doesn't need its own helper).

### Map insertion-order as a cheap LRU (new to this file, but a standard idiom — no library needed)
```ts
// Touch-on-access: delete then re-set moves a key to the "most recently used" end
// of iteration order, since Map preserves insertion order and re-inserting a key
// after deleting it changes its position.
buckets.delete(key);
buckets.set(key, existing);

// Oldest / least-recently-touched key is always first in iteration order:
const oldestKey = buckets.keys().next().value;
```

### Doc-comment style for "why", not "what" (house style — no task/fix references)
```ts
// SOURCE: lib/security/ssrfGuard.ts:1-10
/**
 * Pre-navigation network-safety check for the URL ingestion seam (`lib/ingest.ts`).
 * ...
 * Fails closed: an unresolvable hostname is rejected, never handed to
 * Playwright's own resolver unchecked.
 */
```

### README numbered-list env-var documentation (the rate-limiting entry this plan extends)
```md
<!-- SOURCE: README.md:83-95 -->
4. **Rate limiting** *(built in, tunable/disable-able)*:
   `POST /api/analyze` enforces a per-client-IP token bucket — 20 requests per minute
   by default — guarding the expensive Chromium render / AI enrichment path. Cache hits
   don't count against the limit, since they do no render/AI work at all; only a cache
   miss or `forceRefresh` request consumes a token. Once a client's bucket is empty, the
   route returns `429` with a `Retry-After` header (seconds until the next token refills).
   Tune or disable it via `.env.local`:
   ```env
   # .env.local
   RATE_LIMIT_MAX_REQUESTS=20
   RATE_LIMIT_WINDOW_MS=60000
   RATE_LIMIT_DISABLED=true   # disable entirely, e.g. for local dev
   ```
```

### Manual verification (no unit-test framework in this repo)
```md
<!-- SOURCE: CLAUDE.md, "Manually verifying extraction changes" -->
Write a throwaway script under the scratchpad dir, run via `npx tsx <script>`
from the project root, calling the limiter's exported functions directly.
Delete the script when done.
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/security/rateLimiter.ts` | UPDATE | Add `RATE_LIMIT_MAX_BUCKETS` cap, stale-entry sweep, and Map-order LRU eviction so `buckets.size` is always bounded |
| `README.md` | UPDATE | Document the new `RATE_LIMIT_MAX_BUCKETS` env var next to the existing rate-limiting entry |

---

## Tasks

### Task 1: Add bounded eviction to the bucket store

- **File**: `lib/security/rateLimiter.ts`
- **Action**: UPDATE
- **Implement**:
  - Add `const DEFAULT_MAX_BUCKETS = 50_000;` next to the existing
    `DEFAULT_MAX_REQUESTS`/`DEFAULT_WINDOW_MS` constants.
  - Update the file-level doc comment to state the new invariant: the store
    is bounded to at most `RATE_LIMIT_MAX_BUCKETS` distinct client keys —
    idle entries (a full window past their last touch) are swept first;
    only if genuinely-active distinct clients still exceed the cap does it
    fall back to evicting the least-recently-touched entry. Describe *why*
    (a rate limiter's own store must not be an unbounded-growth vector keyed
    by a client-controlled, spoofable header), not that this was a review
    finding.
  - Add a new function:
    ```ts
    function evictIfAtCapacity(maxBuckets: number, windowMs: number): void {
      if (buckets.size < maxBuckets) return;

      const now = Date.now();
      for (const [key, bucket] of buckets) {
        if (now - bucket.lastRefillAt >= windowMs) {
          buckets.delete(key);
        }
      }

      while (buckets.size >= maxBuckets) {
        const oldestKey = buckets.keys().next().value;
        if (oldestKey === undefined) break;
        buckets.delete(oldestKey);
      }
    }
    ```
    Placement: called from `getOrRefillBucket`, only on the "new key" branch
    (`if (!existing)`), immediately before `buckets.set(key, fresh)` —
    existing/known keys never trigger a sweep, so the amortized cost is one
    sweep per *distinct new* client, not per request.
  - Modify `getOrRefillBucket`'s existing-key branch to touch the key's
    position for LRU purposes:
    ```ts
    const elapsedMs = now - existing.lastRefillAt;
    const refillRate = capacity / windowMs;
    existing.tokens = Math.min(capacity, existing.tokens + elapsedMs * refillRate);
    existing.lastRefillAt = now;
    buckets.delete(key);
    buckets.set(key, existing);
    return existing;
    ```
  - Modify `getOrRefillBucket`'s signature to accept `maxBuckets` (threaded
    down from `assertWithinRateLimit`, same as `capacity`/`windowMs` already
    are) and call `evictIfAtCapacity(maxBuckets, windowMs)` right before
    inserting a fresh bucket on the not-found branch.
  - In `assertWithinRateLimit`, read the new env var the same way the
    existing two are read:
    ```ts
    const maxBuckets = Math.floor(
      parsePositiveNumber(process.env.RATE_LIMIT_MAX_BUCKETS, DEFAULT_MAX_BUCKETS),
    );
    ```
    and pass it into `getOrRefillBucket(clientId, capacity, windowMs, maxBuckets)`.
  - No change to `RateLimitExceededError`, `extractClientId`, or the
    token-bucket math itself — this task only bounds the store's size.
- **Mirror**: `lib/security/rateLimiter.ts:34-37` (`parsePositiveNumber` reuse), `lib/cache.ts:20-27` (`getCache`'s delete-on-stale idiom, extended here to a sweep over all entries rather than just the accessed key, since the accessed key here is *always new* by construction of the attack).
- **Validate**: `npm run typecheck`

### Task 2: Manually verify bounded growth and unaffected legitimate behavior

- **File**: none committed — scratch script only, under the scratchpad dir
- **Action**: n/a
- **Implement**: `npx tsx <scratch-script>` from the project root, importing
  `assertWithinRateLimit` directly (set `RATE_LIMIT_MAX_BUCKETS` via
  `process.env` before import/call to use a small test value, e.g. `1000`,
  so the test doesn't need to actually allocate 50k+ entries):
  1. **Bounded under spoofing churn**: call `assertWithinRateLimit(id)` with
     `N > RATE_LIMIT_MAX_BUCKETS` distinct random client IDs, one call each.
     Assert the internal map never exceeds `RATE_LIMIT_MAX_BUCKETS` entries
     (expose a test-only size check, or infer indirectly by memory/behavior
     — simplest is to temporarily export `buckets` size via a debug hook in
     the scratch script's own `require`/dynamic import scope, or just trust
     the sweep logic and confirm no throw/crash across a large N and that
     the process memory growth is flat rather than linear — mirror the
     review's own verification method of measuring heap growth).
  2. **Legitimate low-cardinality behavior unaffected**: with a handful (< 10)
     of distinct client IDs, confirm the existing behavior still holds —
     default capacity enforced, 21st request from the same ID throws with a
     positive `retryAfterSeconds`, refill occurs over a shortened
     `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_DISABLED` still bypasses entirely,
     independent per-ID budgets — i.e. re-run the original plan's Task 4
     verification checklist to confirm no regression.
  3. **Active clients aren't evicted while under the cap**: with client
     count well under `RATE_LIMIT_MAX_BUCKETS` and requests spaced within
     the window (so no entry goes idle), confirm a client's token count
     persists correctly across repeated calls (i.e. the LRU touch-reinsert
     doesn't reset or lose bucket state).
  - Delete the script when done.
- **Validate**: script output matches expectations above; then run
  `npm run eval` once to confirm it's still unaffected (the limiter lives
  only in the route/its own module, never imported by `eval/run.ts`).

### Task 3: Document the new env var

- **File**: `README.md`
- **Action**: UPDATE
- **Implement**: Extend the existing rate-limiting numbered entry
  (`README.md:83-95`) with the new tuning var in the same fenced `env`
  block:
  ```env
  # .env.local
  RATE_LIMIT_MAX_REQUESTS=20
  RATE_LIMIT_WINDOW_MS=60000
  RATE_LIMIT_MAX_BUCKETS=50000  # cap on distinct tracked client IDs
  RATE_LIMIT_DISABLED=true   # disable entirely, e.g. for local dev
  ```
  Add one sentence to the prose above the block noting that the store is
  bounded to this many distinct clients to prevent unbounded memory growth
  from a high-cardinality (e.g. spoofed-header) traffic pattern.
- **Mirror**: `README.md:83-95` existing formatting.
- **Validate**: manual read-through; no build step for markdown.

---

## Validation

```bash
npm run typecheck
npm run lint
npm run eval
```

---

## Risks

| Risk | Mitigation |
|------|------------|
| Sweeping the full map (`for (const [key, bucket] of buckets)`) on every new-key insert once at capacity is O(map size) | Only triggered when `buckets.size >= maxBuckets`, i.e. rarely relative to request volume, and bounded by `maxBuckets` itself (default 50,000) — cheap in absolute terms (a single pass over ≤50k small objects), and strictly better than the current unbounded-growth behavior |
| Legitimate traffic with more than `RATE_LIMIT_MAX_BUCKETS` genuinely distinct *active* clients within one window falls back to evicting the least-recently-touched real client, resetting that client's budget early | Default cap (50,000 distinct active clients per window) is far above realistic single-instance traffic for this app's expensive-render use case; tunable via `RATE_LIMIT_MAX_BUCKETS` same as the other limits, and evicting resets to a fresh full bucket — the affected client becomes *more* permissive for one window, never locked out, so this fails open rather than closed |
| Touch-on-access delete+re-insert changes Map iteration order on every request, not just new-key inserts | This is O(1) (`Map.delete`+`Map.set`) and is exactly what's needed to keep "oldest key in iteration order" meaning "least-recently-touched" — without it, eviction could remove a very-active client just because it happened to be inserted first |

---

## Acceptance Criteria

- [ ] All tasks completed
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes (or documented as pre-existing N/A per prior reports)
- [ ] `npm run eval` passes unchanged
- [ ] Manual verification confirms: bucket count never exceeds `RATE_LIMIT_MAX_BUCKETS` regardless of distinct-client churn, existing single-client rate-limit behavior (capacity, refill, disable, per-client isolation) is unchanged, and active clients under the cap are never evicted mid-window
- [ ] README documents `RATE_LIMIT_MAX_BUCKETS` alongside the other rate-limit env vars
