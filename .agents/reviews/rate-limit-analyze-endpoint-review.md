# Code Review: rate-limit-analyze-endpoint (unstaged changes)

**Scope**: Unstaged working-tree changes on `feature/rate-limit-analyze-endpoint` —
`lib/security/rateLimiter.ts` (new), `app/api/analyze/route.ts`, `README.md`.
**Recommendation**: NEEDS WORK

## Summary

Adds an in-memory per-client-IP token-bucket rate limiter guarding the
Chromium-render/AI path of `POST /api/analyze`, wired in cleanly after the
cache-hit short-circuit and following the existing `UnsafeUrlError`
instanceof-dispatch pattern from the SSRF guard. Types and eval both pass and
the design matches the plan in `.agents/plans/completed/`. The one real gap:
the bucket store has no eviction, so it can grow without bound — for a
feature whose entire purpose is protecting the server from resource
exhaustion, that's a hole worth closing before shipping.

## Issues Found

### Critical
None

### High Priority

- **`buckets` Map has no eviction — unbounded memory growth, defeating the resource-exhaustion protection this feature exists to provide** (`lib/security/rateLimiter.ts:27`, `:39-53`). Every distinct `clientId` seen gets a permanent entry that is never deleted — there's no TTL/expiry field on `Bucket` and no cleanup path, unlike `lib/cache.ts`'s `cacheStore`, which at least deletes an entry once read past its `expiresAt`. The client ID comes straight from the client-controlled `X-Forwarded-For` header (`extractClientId`, first comma-separated entry), so an attacker doesn't need to find a bypass — sending each request with a new spoofed value (e.g. a random IP) is enough to both dodge the limit *and* grow the map forever. Verified directly: `assertWithinRateLimit` with 200k distinct client IDs grew heap by ~30MB with zero eviction, and nothing bounds that number. Over a long-running process (self-hosted / non-serverless deployment, which the module's own multi-instance caveat implies is an expected topology) this is a straightforward memory-exhaustion DoS — worse, it's reachable by the exact traffic pattern (many requests, cheap to send) the limiter is meant to throttle.
  - The completion report (`.agents/reports/rate-limit-analyze-endpoint-report.md:13`) describes the store as mirroring `lib/cache.ts`'s "Map-based lazy-expiry store," but no expiry/deletion logic was actually implemented — this looks like a gap between intent and what shipped, not an accepted tradeoff (it isn't listed in the plan's own Risks table either).
  - **Fix**: give `Bucket` an `expiresAt`/`lastSeenAt` and either (a) lazily delete stale entries on the read path once idle past N windows (mirroring `cache.ts`'s pattern), or (b) cap `buckets.size` with a simple LRU/periodic sweep. Either is enough to bound memory regardless of how many distinct client IDs are observed.

### Medium Priority
None

### Suggestions

- `extractClientId` trusts the **leftmost** entry of `X-Forwarded-For` (`lib/security/rateLimiter.ts:62-66`), which is the client-supplied, unauthenticated segment of that header — a reverse proxy typically appends its own hop to the right rather than overwriting the left. This is already called out and accepted as an MVP risk in the plan's Risks table, so not re-flagging it as a blocking issue on its own — but it's the mechanism that makes the High-priority finding above a one-line attack rather than something requiring network position, so it's worth a second look once the eviction gap is fixed (e.g. only trusting `X-Forwarded-For` when a `TRUSTED_PROXY` env var is set, otherwise falling back to a non-spoofable identifier).

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | N/A — `next lint` prompts for first-time ESLint setup; no `.eslintrc`/`eslint.config.*` exists anywhere in this repo's history, so this is a pre-existing environment gap unrelated to this change |
| Eval (`npm run eval`) | PASS — 100% aggregate, unaffected as expected (limiter lives only in the route, never imported by the harness) |
| Manual verification | Confirmed via scratch script (`npx tsx`, deleted after use): capacity enforced, `429`/`RateLimitExceededError` thrown with positive `retryAfterSeconds` once exhausted, and the unbounded-`buckets`-growth behavior described above |

## What's Good

- Faithfully follows the codebase's established patterns: single `Error` subclass + `instanceof` dispatch (mirrors `UnsafeUrlError`), env vars read fresh per call rather than cached at module load (mirrors `ssrfGuard.ts`), placement precisely after the cache-hit short-circuit so cache hits stay free.
- Token-bucket math (smooth refill, not fixed-window) is correct — verified `retryAfterSeconds` is always a sane positive integer.
- `RATE_LIMIT_DISABLED` escape hatch and clear README documentation make this easy to tune or turn off for local dev.
- Correctly scoped: lives only in the route, so `npm run eval`'s offline replay is untouched — matches the plan's explicit design goal.

## Recommendation

Close the eviction gap in `lib/security/rateLimiter.ts` before merging — as written, the limiter can be turned into the very memory-exhaustion vector it's meant to prevent, using nothing more than a rotating `X-Forwarded-For` header. Everything else (wiring, docs, token-bucket math, eval isolation) is solid and ready as-is.
