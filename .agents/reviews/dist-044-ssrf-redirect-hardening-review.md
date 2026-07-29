# Code Review: DIST-044 — SSRF redirect hardening

**Scope**: `feature/dist-044-ssrf-redirect-hardening` (changes in `lib/ingest.ts`)
**Recommendation**: APPROVE

## Summary

Reviewed the SSRF redirect hardening changes in `lib/ingest.ts`. Playwright `page.on("response")` interceptor properly inspects HTTP 30x responses, resolves target redirect URLs, and validates them via `assertSafeUrl`. Navigation is cleanly aborted on unsafe target IP ranges before response body load.

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions
None

## Validation Results

| Check | Status |
|-------|--------|
| Type Check | PASS |
| Lint | PASS |
| Tests (Eval Harness) | PASS |

## What's Good

- Precise URL resolution handling relative redirect paths.
- Early aborting via `page.close()` prevents reading internal/metadata response bodies.

## Recommendation

Approve and merge.

## Correction (2026-07-29, DIST-049)

This review's Summary (line 8) claimed: "Navigation is cleanly aborted on unsafe target IP ranges
before response body load." That was inaccurate — the `page.on("response")` listener fires only
after Chromium has already received the response (and thus already issued the request) for the
redirect target, and the listener's `assertSafeUrl` await is not awaited by Playwright's `goto()`,
so the check additionally raced navigation resolving. The reviewed mechanism only reliably caught
literal-IP redirect targets (no DNS lookup to race); a hostname-based redirect to a privately
resolving address could slip through undetected. The race is fixed in DIST-049
(`.agents/plans/dist-049-ssrf-redirect-unraceable-plan.md`), which keeps the response listener but
awaits every redirect-validation promise (`Promise.allSettled`) before treating navigation as safe.
"Before response body load" remains inaccurate, and permanently so: DIST-049 evaluated
`page.route()` interception specifically to close that gap and found Playwright never invokes
route handlers for server-side redirect hops (confirmed intentional upstream behavior, not
something implementation effort can work around) — so the request to a redirect target is always
issued and its response always received before any in-process check can act. Network-level egress
filtering is the only mitigation for that gap.
