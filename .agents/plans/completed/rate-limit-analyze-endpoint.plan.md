# Plan: Basic Rate Limiting on POST /api/analyze

## Summary

Add an in-memory, per-client-IP token-bucket rate limiter guarding the expensive
part of `POST /api/analyze` — the Chromium render / AI enrichment path — without
touching the cheap cache-hit path. A new `lib/security/rateLimiter.ts` module
(mirroring the existing `lib/security/ssrfGuard.ts` shape: a single error type,
pure functions, env-var config) exposes `assertWithinRateLimit(clientId)`, which
throws `RateLimitExceededError` (carrying `retryAfterSeconds`) once a client's
bucket is empty. The route calls this *after* a cache-hit short-circuit (so
cache hits never consume budget — satisfying the AC's "cache hits are cheap,
renders are the resource being protected" framing via the simplest option: zero
weight rather than fractional weight) and *before* invoking `analyzeUrl` /
`analyzeImages`. A caught `RateLimitExceededError` becomes `429` with a
`Retry-After` header, following the exact `instanceof` branch pattern the SSRF
guard already established for `UnsafeUrlError` → `400`. Defaults are sane
out of the box and fully tunable/disable-able via env vars, and since the
limiter lives only in the route (never in `lib/analyze.ts` or `lib/extract/**`),
`npm run eval` — which replays captures directly, offline, and never imports
the route — is structurally unaffected.

## User Story

As a deployer of a public Distill instance
I want simple per-client rate limiting on the analyze endpoint
So that a single client cannot exhaust the server with expensive Chromium renders

## Metadata

| Field | Value |
|-------|-------|
| Type | NEW_CAPABILITY (hardening) |
| Complexity | LOW |
| Systems Affected | new `lib/security/rateLimiter.ts`, `app/api/analyze/route.ts`, `README.md` |
| GitHub Issue | #3 (`[DIST-002] Basic rate limiting on POST /api/analyze`, `laanhema/distill-design-scraper`) |

---

## Patterns to Follow

### Single error type + `instanceof` dispatch at the route (established by the SSRF guard)
```ts
// SOURCE: lib/security/ssrfGuard.ts:12-13
/** Single error type for every rejection reason so callers can key off one `instanceof` check. */
export class UnsafeUrlError extends Error {}
```
```ts
// SOURCE: app/api/analyze/route.ts:151-159
} catch (err) {
  if (err instanceof UnsafeUrlError) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
  // §9: surface a clear error, never fabricate results.
  const message =
    err instanceof Error ? err.message : "Unknown rendering error.";
  return NextResponse.json({ ok: false, error: message }, { status: 502 });
}
```
The rate limiter needs its own branch inserted above the `UnsafeUrlError` check, mapping to `429` + `Retry-After` instead of `400`.

### Env-var config, read lazily (not module-load-time constants) so tests/tuning can vary it
```ts
// SOURCE: lib/security/ssrfGuard.ts:121-132
export function parseAllowlist(): Set<string> {
  const raw = process.env.SSRF_ALLOWLIST_HOSTS ?? "";
  return new Set(
    raw.split(",").map((host) => host.trim().toLowerCase()).filter(Boolean),
  );
}
```

### In-memory `Map`-based store with lazy expiry, no external dependency
```ts
// SOURCE: lib/cache.ts:8-30
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}
const cacheStore = new Map<string, CacheEntry<unknown>>();
export function getCache<T>(key: string): T | null {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cacheStore.delete(key);
    return null;
  }
  return entry.value as T;
}
```
The rate limiter's per-IP bucket map follows the same shape (`Map<string, Bucket>`, lazy refill-on-read, no `setInterval` sweep needed at this scale).

### Cache-check-then-expensive-path ordering already in the route (where the limiter check must slot in)
```ts
// SOURCE: app/api/analyze/route.ts:62-69
const cacheKey = createCacheKey(`${url || ""}:${imagesKeyPart}:${mode}`);
if (!body.forceRefresh) {
  const cached = getCache<unknown>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }
}
```
This return happens *before* either the images-branch or URL-branch expensive work — the rate-limit check must go immediately after this block (i.e. cache misses/`forceRefresh` only), so cache hits never touch the limiter.

### Doc-comment style for "why", not "what" (house style)
```ts
// SOURCE: lib/security/ssrfGuard.ts:1-10
/**
 * Pre-navigation network-safety check for the URL ingestion seam (`lib/ingest.ts`).
 * ...
 * Fails closed: an unresolvable hostname is rejected, never handed to
 * Playwright's own resolver unchecked.
 */
```

### README env-var documentation, next to the SSRF section it was added alongside
```md
<!-- SOURCE: README.md:65-68 -->
3. **SSRF guard** *(built in, no configuration required)*:
   Before navigating to any submitted URL, Distill resolves its hostname via DNS and
   rejects the request if the resolved address falls in a loopback, private, or
   link-local range — `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`,
```

### Manual verification (no unit-test framework in this repo)
```md
<!-- SOURCE: CLAUDE.md, "Manually verifying extraction changes" + ssrf-guard-url-analysis.plan.md Task 5 -->
Write a throwaway script under the scratchpad dir, run via `npx tsx <script>`
from the project root, calling the limiter's exported functions directly
(cheaper than spinning up `next dev` and issuing real HTTP requests). Delete
the script when done.
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/security/rateLimiter.ts` | CREATE | Token-bucket store keyed by client IP, env-var config, `RateLimitExceededError`, client-IP extraction helper |
| `app/api/analyze/route.ts` | UPDATE | Call the limiter after the cache-hit short-circuit and before the expensive render/analyze path; catch `RateLimitExceededError` → 429 + `Retry-After` |
| `README.md` | UPDATE | Document default limit, tuning, and disable env vars next to the existing SSRF-guard section |

---

## Tasks

### Task 1: Create the rate limiter module

- **File**: `lib/security/rateLimiter.ts`
- **Action**: CREATE
- **Implement**:
  - File-level doc comment explaining the mechanism and, explicitly, the multi-instance caveat: *"In-memory per-process token bucket. In a multi-instance/horizontally-scaled deployment each instance enforces its own independent limit — this is a known MVP gap (no shared store such as Redis in scope), not a bypass a single deployer needs to worry about."*
  - `export class RateLimitExceededError extends Error { constructor(message: string, public readonly retryAfterSeconds: number) { super(message); } }` — single error type mirroring `UnsafeUrlError`, but carrying the `Retry-After` value the route needs.
  - Env-var config, read fresh on each call (not cached at module load, so it stays tunable and testable):
    - `RATE_LIMIT_MAX_REQUESTS` — bucket capacity / requests-per-window, default `20`.
    - `RATE_LIMIT_WINDOW_MS` — window the capacity refills over, default `60_000` (1 minute) → refill rate = `capacity / windowMs` tokens/ms, i.e. a true token bucket (smooth refill), not a fixed-window counter.
    - `RATE_LIMIT_DISABLED` — any of `"true"/"1"` disables the limiter entirely (documented as the local-dev escape hatch the AC requires).
  - `interface Bucket { tokens: number; lastRefillAt: number }`, `const buckets = new Map<string, Bucket>()` — same shape as `lib/cache.ts`'s `cacheStore`.
  - `function getOrRefillBucket(key: string, capacity: number, windowMs: number): Bucket` — lazy refill: on read, compute elapsed time since `lastRefillAt`, add `elapsed * (capacity / windowMs)` tokens capped at `capacity`, update `lastRefillAt`. Create a full bucket on first sight of a key.
  - `export function extractClientId(request: Request): string` — reads `x-forwarded-for` (first comma-separated entry, trimmed) then falls back to `x-real-ip`, then falls back to the literal string `"unknown"` (single-instance local dev with no proxy in front — comment why: without a proxy header, every unproxied local request is indistinguishable, so they share one bucket, which is fine for the local-dev case the AC calls out).
  - `export function assertWithinRateLimit(clientId: string): void`:
    1. If `RATE_LIMIT_DISABLED` is set truthy, return immediately.
    2. Read `RATE_LIMIT_MAX_REQUESTS`/`RATE_LIMIT_WINDOW_MS` (parse with `Number(...)`, fall back to defaults on `NaN`/`≤0`).
    3. Get-or-refill the caller's bucket.
    4. If `tokens < 1`, compute `retryAfterSeconds = Math.ceil((1 - tokens) / (capacity / windowMs) / 1000)` and throw `RateLimitExceededError` with a message naming the client and the configured limit.
    5. Otherwise decrement `tokens` by 1 and return.
- **Mirror**: `lib/security/ssrfGuard.ts:12-13` (single error type), `lib/cache.ts:8-30` (Map-based store shape + lazy expiry-on-read).
- **Validate**: `npm run typecheck`

### Task 2: Wire the limiter into the route

- **File**: `app/api/analyze/route.ts`
- **Action**: UPDATE
- **Implement**:
  - Import `assertWithinRateLimit`, `extractClientId`, `RateLimitExceededError` from `@/lib/security/rateLimiter`.
  - Immediately after the existing cache-hit block (`app/api/analyze/route.ts:64-69`, the `if (!body.forceRefresh) { ... return ... }`), insert:
    ```ts
    try {
      assertWithinRateLimit(extractClientId(request));
    } catch (err) {
      if (err instanceof RateLimitExceededError) {
        return NextResponse.json(
          { ok: false, error: err.message },
          { status: 429, headers: { "Retry-After": String(err.retryAfterSeconds) } },
        );
      }
      throw err;
    }
    ```
    This placement means: a cache hit returns before this point (zero weight, satisfies AC #2's first option cleanly); a cache miss or `forceRefresh` consumes exactly one token before the Chromium render or AI-lane work begins.
  - No change needed to the existing outer `try { ... } catch (err) { ... UnsafeUrlError ... }` block — the rate-limit check is deliberately its own try/catch *before* that block, not folded into it, since a 429 must fire even on `forceRefresh` requests that would otherwise skip straight to the outer try.
- **Mirror**: `app/api/analyze/route.ts:151-159` (the `UnsafeUrlError` → 400 branch) for the shape of a typed-error → status-code translation, adapted to add the `Retry-After` header.
- **Validate**: `npm run typecheck`, `npm run lint`

### Task 3: Document the env vars

- **File**: `README.md`
- **Action**: UPDATE
- **Implement**: Add a fourth numbered item directly after the existing "SSRF guard" entry (`README.md:65-68`), covering: default limit (20 requests/minute per client IP), that cache hits don't count against it, and the two tuning env vars:
  ```env
  # .env.local
  RATE_LIMIT_MAX_REQUESTS=20
  RATE_LIMIT_WINDOW_MS=60000
  RATE_LIMIT_DISABLED=true   # disable entirely, e.g. for local dev
  ```
- **Mirror**: `README.md:58-68` formatting (numbered list item, fenced `env` block).
- **Validate**: manual read-through; no build step for markdown.

### Task 4: Manually verify the limiter (no unit-test framework in this repo)

- **File**: none committed — scratch script only, under the scratchpad dir
- **Action**: n/a
- **Implement**: `npx tsx <scratch-script>` from the project root, importing `assertWithinRateLimit`/`extractClientId` directly:
  - Call `assertWithinRateLimit("test-ip")` `RATE_LIMIT_MAX_REQUESTS` (default 20) times in a tight loop → all succeed.
  - Call it one more time → expect it to throw `RateLimitExceededError` with a positive `retryAfterSeconds`.
  - Wait (or fake/advance time by calling with a mocked `Date.now`, or simply sleep past a shortened `RATE_LIMIT_WINDOW_MS=1000` set via env for the test) → confirm at least one token has refilled and a subsequent call succeeds.
  - Set `RATE_LIMIT_DISABLED=true` and confirm calls never throw regardless of count.
  - Confirm two different `clientId` values each get their own independent budget (one exhausting its bucket doesn't affect the other).
  - Delete the script when done.
- **Validate**: script output matches expectations above; then run `npm run eval` once to confirm it's unaffected (AC #4 — the harness never imports `app/api/analyze/route.ts`).

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
| In-memory `Map` means the limit is per-process — a multi-instance deployment (e.g. serverless with multiple concurrent lambdas, or a load-balanced multi-replica setup) gives each instance its own independent budget, so the *effective* aggregate limit scales with instance count | Explicitly out of scope per the issue's own technical note ("no persistent storage in scope per PRD §9"); documented in a code comment in `rateLimiter.ts` and callable out in the PR description as a known MVP gap, matching how the SSRF guard plan documented its own TOCTOU gap rather than silently overclaiming completeness |
| `x-forwarded-for` is trivially spoofable by a direct client when there's no trusted reverse proxy in front | Acceptable for MVP — matches the PRD §9 framing that a public deployer is expected to add their own infra hardening; the header is still meaningfully useful behind a real proxy/CDN, which is the expected production topology |
| Choosing "cache hits are zero weight" over "reduced weight" could look like under-delivering on the AC's stated alternative | AC explicitly offers zero-weight as one of two acceptable options ("either doesn't count against the limit or counts at reduced weight"); zero-weight is simpler, has no extra config surface, and is the more defensible choice since a cache hit does no Chromium/AI work at all |

---

## Acceptance Criteria

- [ ] All tasks completed
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run eval` passes unchanged (limiter lives only in the route, never touched by the harness)
- [ ] Manual verification script confirms: default capacity enforced, `429` thrown with positive `retryAfterSeconds` once exhausted, refill occurs over the configured window, `RATE_LIMIT_DISABLED` fully bypasses the check, per-IP buckets are independent
- [ ] Route returns `429` + `Retry-After` header on limit exceeded, and cache hits never consume a token
