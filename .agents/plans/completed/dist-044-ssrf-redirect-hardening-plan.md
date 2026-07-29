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

## Correction (2026-07-29, DIST-049)

This plan's Summary claim — that navigation is aborted "immediately before loading redirect
response bodies" — was inaccurate. By the time the `page.on("response")` listener fired, Chromium
had already issued the request to the redirect target (the response had arrived; the listener
only inspects it after the fact). Worse, the listener's `assertSafeUrl` call is `async` and
Playwright does not await `on()` event listeners, so the check additionally raced `page.goto()`
resolving — a fast-answering DNS lookup for a malicious hostname target could lose that race and
slip through undetected. The mechanism only reliably caught this plan's own synthetic test case
(a literal IP redirect target, `169.254.169.254`) because a literal IP has no DNS lookup to race.

The race is fixed in DIST-049 (`.agents/plans/dist-049-ssrf-redirect-unraceable-plan.md`), which
keeps the `page.on("response")` listener but collects every redirect-validation promise and
`Promise.allSettled`s them before treating navigation as safe, so a fast-answering hostname can no
longer complete before the check finishes. The "already issued" mischaracterization is *not* fixed
by DIST-049 — it's corrected to state plainly that the request to a redirect target is always
issued and its response always received before any in-process check can act, and always will be:
DIST-049 evaluated `page.route()` interception (which validates before Chromium sends a request at
all) specifically to close this gap and found Playwright does not invoke route handlers for
server-side redirect hops at all — confirmed intentional upstream behavior (Playwright docs: route
handlers are "only called for the first url if the response is a redirect"; microsoft/playwright#34994).
Network-level egress filtering remains the only mitigation for the "already issued" gap.
