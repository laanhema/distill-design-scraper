# Plan: DIST-044 — SSRF redirect hardening on HTTP 301/302 redirects

## Summary

Intercept HTTP 301/302 redirects during Playwright page navigation in `lib/ingest.ts`. Validate target redirect URLs via `assertSafeUrl(targetUrl)` against resolved IPs, aborting navigation and throwing `UnsafeUrlError` immediately before loading redirect response bodies when pointing to loopback, RFC1918, link-local, CGNAT, or reserved IP ranges.

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG |
| Priority | HIGH |
| Complexity | MEDIUM |
| Systems Affected | `lib/ingest.ts`, `lib/security/ssrfGuard.ts` |
| GitHub Issue | #88 |

---

## Tasks

### Task 1: Intercept HTTP 30x redirects and validate target URLs
- **File**: `lib/ingest.ts`
- **Action**: UPDATE
- **Implement**: Attach a `page.on("response", ...)` listener in `renderUrl`. On HTTP 30x responses with a `Location` header, resolve the target URL and validate it via `await assertSafeUrl(targetUrl)`. If validation fails, set `redirectSsrfError` and call `page.close()` to abort response body download and redirect navigation, re-throwing `UnsafeUrlError` from `renderUrl`.
- **Validate**: `npm run lint && npm run typecheck && npm run eval` + synthetic redirect test script.

---

## Validation

- Type check: `npm run typecheck`
- Lint: `npm run lint`
- Eval harness: `npm run eval`
- Synthetic Test: Verify redirects to `169.254.169.254`, `10.0.0.1`, and `127.0.0.1` throw `UnsafeUrlError`, while allowlisted hosts (`localhost`) succeed.
