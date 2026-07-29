# Implementation Report: DIST-044 — SSRF redirect hardening

**Plan**: `.agents/plans/completed/dist-044-ssrf-redirect-hardening-plan.md`
**Branch**: `feature/dist-044-ssrf-redirect-hardening`
**Status**: COMPLETE

## Summary

Implemented Playwright response interceptor in `lib/ingest.ts` (`renderUrl`) to intercept HTTP 30x redirects and validate `Location` target URLs via `assertSafeUrl`. If a redirect target resolves to loopback, RFC1918, link-local, or reserved IP ranges, page navigation is aborted immediately and `UnsafeUrlError` is re-thrown.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Intercept 30x redirects and validate target URLs via `assertSafeUrl` | `lib/ingest.ts` | ✅ |

## Validation Results

| Check | Result |
|-------|--------|
| Type check (`npm run typecheck`) | ✅ Pass |
| Lint (`npm run lint`) | ✅ Pass |
| Eval harness (`npm run eval`) | ✅ Pass (100% aggregate) |
| Synthetic Redirect Test | ✅ Pass (UnsafeUrlError thrown on redirect to 169.254.169.254) |

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/ingest.ts` | UPDATE | +28/-1 |

## Deviations from Plan

None.

## Tests Written

- Synthetic HTTP 302 redirect integration test verifying `UnsafeUrlError` rejection on redirect targets before loading response bodies.

## Correction (2026-07-29, DIST-049)

Two claims in this report overstated what the shipped mechanism actually did:

- **Summary (line 9)**: "page navigation is aborted immediately and `UnsafeUrlError` is re-thrown"
  implied the request to the redirect target was never issued. It was: the `page.on("response")`
  listener only runs *after* Chromium has already received the response for that request, and the
  listener's `assertSafeUrl` await additionally raced `page.goto()` resolving (Playwright doesn't
  await `on()` listeners) — a hostname-based redirect could resolve and complete before the async
  check finished.
- **Tests Written (line 38)**: "verifying `UnsafeUrlError` rejection on redirect targets before
  loading response bodies" is also inaccurate for the same reason — the response (headers included)
  had already arrived by the time the listener fired.

The synthetic test this report cites only exercised a literal IP redirect target
(`169.254.169.254`), which resolves instantly with no DNS lookup — so it always won the race
against `page.goto()` and could never have surfaced either gap. The untested case — a redirect to
a *hostname* that resolves privately, where a real DNS lookup is in flight and can plausibly lose
the race — is exactly what DIST-049 (`.agents/plans/dist-049-ssrf-redirect-unraceable-plan.md`)
adds coverage for. DIST-049 fixes the race by awaiting every redirect-validation promise
(`Promise.allSettled`) before treating navigation as safe. It does **not** fix the "already issued"
gap named above — that gap is real and permanent under Playwright's current capabilities: DIST-049
evaluated `page.route()` interception (which validates before Chromium sends a request at all)
specifically to close it, and found Playwright never invokes route handlers for server-side
redirect hops at all (confirmed intentional upstream behavior, not a bug — see DIST-049's report
for the citation). So "before loading response bodies" was inaccurate in this report and remains
inaccurate for any in-process mechanism; only network-level egress filtering closes that gap.
