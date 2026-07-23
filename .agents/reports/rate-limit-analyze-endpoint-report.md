# Implementation Report

**Plan**: `.agents/plans/rate-limit-analyze-endpoint.plan.md`
**Branch**: `feature/rate-limit-analyze-endpoint`
**Status**: COMPLETE

## Summary

Added an in-memory, per-client-IP token-bucket rate limiter guarding the
expensive Chromium render / AI enrichment path of `POST /api/analyze`. A new
`lib/security/rateLimiter.ts` module (mirroring `lib/security/ssrfGuard.ts`'s
single-error-type + `instanceof`-dispatch shape and `lib/cache.ts`'s
`Map`-based lazy-expiry store) exposes `assertWithinRateLimit(clientId)`,
which throws `RateLimitExceededError` (carrying `retryAfterSeconds`) once a
client's bucket is empty. The route calls this immediately after the
cache-hit short-circuit and before the expensive render/analyze path, so
cache hits consume zero budget. A caught `RateLimitExceededError` becomes a
`429` with a `Retry-After` header.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Create the rate limiter module | `lib/security/rateLimiter.ts` | ✅ |
| 2 | Wire the limiter into the route | `app/api/analyze/route.ts` | ✅ |
| 3 | Document the env vars | `README.md` | ✅ |
| 4 | Manually verify the limiter | scratch script (deleted after use) | ✅ |

## Validation Results

| Check | Result |
|-------|--------|
| Type check (`npm run typecheck`) | ✅ |
| Lint (`npm run lint`) | ⚠️ N/A — see Deviations |
| Eval (`npm run eval`) | ✅ all gates passed, unchanged (100% aggregate, clean-light/dark-mode) |
| Manual verification script | ✅ 5/5 cases as expected |
| Live E2E smoke test (`next dev`) | ✅ see below |

### Live E2E smoke test

Started `next dev` with `RATE_LIMIT_MAX_REQUESTS=2 RATE_LIMIT_WINDOW_MS=60000`
and issued real HTTP requests against `POST /api/analyze`:

- Client A (`x-forwarded-for: 203.0.113.42`), 3 requests to an intentionally
  unresolvable URL: request 1 → `400` (consumes token 1), request 2 → `400`
  (consumes token 2), request 3 → `429` with `Retry-After: 23` and body
  `{"ok":false,"error":"Rate limit exceeded for client \"203.0.113.42\": max 2 requests per 60000ms."}`.
- Client B (`x-forwarded-for: 198.51.100.7`), 1 request immediately after
  Client A was exhausted → `400` (fresh, independent bucket — not `429`),
  confirming per-client isolation.
- A second independent client (`10.10.10.10`) repeated the same
  exhaust-to-`429` pattern, confirming determinism across runs.
- Cache-hit-skips-limiter is guaranteed by code placement (the limiter check
  is textually after the cache-hit `return` in the route) — verified by
  reading the code rather than a live cache-hit request, since triggering an
  actual successful cached response would require a real Chromium render of
  a live external page, out of scope for this smoke test.

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/security/rateLimiter.ts` | CREATE | +100 |
| `app/api/analyze/route.ts` | UPDATE | +20 |
| `README.md` | UPDATE | +14 |

## Deviations from Plan

- **`npm run lint` could not be run**: this repo has no committed ESLint
  config (`.eslintrc*` / `eslint.config*`) on `main` — a pre-existing
  condition unrelated to this change (also flagged in the prior
  `ssrf-guard-url-analysis-report.md`). `next lint` drops into an
  interactive "How would you like to configure ESLint?" prompt instead of
  running, so it can't be used as an automated gate as-is. Did not create a
  config as a side effect of this task. `typecheck` and `eval` both pass
  cleanly, and the new code follows the same style (naming, error handling,
  doc-comment conventions) as the rest of the codebase.
- Everything else matched the plan as written: token-bucket math, env-var
  names/defaults, error type shape, route wiring placement, and README
  section all follow the plan exactly.

## Tests Written

No unit-test framework exists in this repo (per `CLAUDE.md`); `npm run eval`
is the correctness gate for extraction logic and is unaffected by this
change (the limiter lives only in the route, never imported by
`eval/run.ts`). Verification instead took the form of:

| Verification | Cases |
|-----------|--------|
| Scratch script (`npx tsx`, deleted after use) | default capacity enforced (20/20 succeed), 21st request throws `RateLimitExceededError` with positive `retryAfterSeconds`, refill occurs over a shortened window, `RATE_LIMIT_DISABLED` bypasses entirely, two client IDs have independent budgets |
| Live `next dev` HTTP smoke test | `429` + `Retry-After` header on exhaustion, independent per-client-IP buckets over real HTTP |
