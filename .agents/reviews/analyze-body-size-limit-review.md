# Code Review: feature/analyze-body-size-limit (issue #18 / DIST-012)

**Scope**: branch `feature/analyze-body-size-limit` vs `main`, including uncommitted changes — one code file changed, `app/api/analyze/route.ts` (+50/−1), plus `.agents/` plan/report artifacts (not code, not reviewed).
**Recommendation**: APPROVE WITH NITS

## Summary

The change adds a request-body size gate to `POST /api/analyze`: a `Content-Length` fast-path plus an incremental stream read that cancels the body and returns 413 the moment `MAX_REQUEST_BODY_BYTES` (6 × 8 MiB, derived from `MAX_IMAGES` × a named per-image ceiling with a rationale comment) is exceeded — strictly before `JSON.parse`, base64 decode, `sharp`, or Playwright. The implementation is correct against the issue's acceptance criteria, matches the route's existing pre-parse error shape (`{ error }`, no `ok` field), and the streaming path correctly covers chunked bodies that carry no honest `Content-Length`. Two minor behavior deltas versus the old `request.json()` path are worth noting; neither blocks approval.

## Issues Found

### Critical
None.

### High Priority
None.

### Medium Priority
1. `app/api/analyze/route.ts:82` — A body-stream read error (e.g. client aborts mid-upload, `reader.read()` rejects) now propagates out of `POST` uncaught and surfaces as a Next.js 500, whereas previously the same failure rejected inside the `try { await request.json() }` block and was mapped to a clean 400. Recommendation: wrap the `readBodyWithinLimit` call (or its internal read loop) in a try/catch that returns the 400 "Request body must be JSON." (or a dedicated 400) on stream failure.

### Suggestions (Low)
2. `app/api/analyze/route.ts:78` — `Buffer.concat(chunks).toString("utf8")` + `JSON.parse` does not strip a UTF-8 BOM, while the fetch spec's `request.json()` does; a BOM-prefixed JSON body that previously parsed now gets a 400. Trivially fixed with a leading-BOM strip before `JSON.parse` if anyone cares about such clients.
3. `app/api/analyze/route.ts:83` — With the limit in place the route still buffers up to 48 MiB per in-flight request (N concurrent requests → N × 48 MiB before the rate limiter is even consulted, since the gate runs pre-cache/pre-limit by design). This is a deliberate, documented ceiling and strictly better than the previous unbounded behavior — noting only that the per-image ceiling (8 MiB encoded) is generous and could be tightened later if memory pressure shows up.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | N/A — repo has no ESLint config; `next lint` drops into an interactive setup prompt (pre-existing condition, unrelated to this change) |
| Tests (`npm run eval`) | PASS — all gates passed |

## What's Good

- The two-layer design (header fast-path + streaming enforcement) is the right shape: it never trusts `Content-Length` to exist or be honest, and it cancels rather than drains an oversized stream so the remainder is never buffered.
- The constant derivation (`MAX_IMAGES × MAX_IMAGE_PAYLOAD_BYTES`) with a genuine rationale comment satisfies the issue's acceptance criterion exactly, and mirrors the codebase's named-cap-with-comment convention.
- The gate sits before `JSON.parse`/base64/`sharp`/Playwright as required, and all downstream logic (alias merge, cache, rate limiter placement) is untouched.
- `reader.cancel().catch(() => {})` correctly ensures a cancel failure can't mask the 413.
- Error response shape (`{ error }`, no `ok`) is consistent with the route's other pre-parse rejections.

## Recommendation

Approve with nits. Finding 1 (stream-error → 500 instead of 400) is the only one worth fixing before merge; findings 2–3 are optional polish. No re-review needed if finding 1 is addressed as described.
