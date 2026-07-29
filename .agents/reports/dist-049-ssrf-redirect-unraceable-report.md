# Implementation Report

**Plan**: `.agents/plans/completed/dist-049-ssrf-redirect-unraceable-plan.md`
**Branch**: `fix/dist-049-ssrf-redirect-unraceable`
**Status**: COMPLETE (with a significant, documented deviation from the plan's chosen mechanism)

## Summary

DIST-049 aimed to close the race in `lib/ingest.ts`'s redirect SSRF guard (a fire-and-forget
`page.on("response", async ...)` listener that Playwright doesn't await, letting a fast-resolving
malicious hostname redirect complete navigation before the async `assertSafeUrl` check finished)
and to correct documentation that overstated the old mechanism's guarantee.

The plan's chosen mechanism — replacing the listener with `page.route()` interception — was
implemented first exactly as specified, then **discovered not to work** during Task 6's own manual
verification step: Playwright's own documentation (`playwright-core` `Page.route()` docs: *"The
handler will only be called for the first url if the response is a redirect"*) and a maintainer's
"working as designed" confirmation on `microsoft/playwright#34994` establish that route handlers
are never invoked for server-side redirect hops during navigation — only for the initial URL. An
isolated reproduction (`page.on("request"/"response")` logging alongside a `page.route()` handler
against a local 302-redirect server) confirmed this empirically: the route handler fired once, for
the initial request, and never again for the redirect target, even though navigation completed via
that redirect.

Given this, `page.route()` could not have closed the "already issued" gap for redirects (the exact
case this plan targets) — it would have shipped as a no-op for that case while the code and README
claimed otherwise. I reverted the route()-based implementation and instead implemented the plan's
own named fallback (its "Chosen mechanism" section's Option 2): keep the `page.on("response")`
listener, but collect every redirect-validation promise into an array and `Promise.allSettled` it
before ever treating navigation as safe to capture. This reliably closes the *race* (verified 10/10
consecutive runs, no flakes) without the plan's stronger, but unachievable, claim about preventing
the request from being sent. All documentation (code comment, README, and the three amended
DIST-044 historical records) was corrected to describe the actual mechanism and to cite the
Playwright behavior that ruled out `page.route()`, rather than the plan's original wording.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Replace the racy redirect guard | `lib/ingest.ts` | ✅ (mechanism deviates from plan — see below) |
| 2 | Correct README Hardening Guide | `README.md` | ✅ (wording deviates from plan's suggested text — see below) |
| 3 | Amend DIST-044 plan record | `.agents/plans/completed/dist-044-ssrf-redirect-hardening-plan.md` | ✅ (correction text deviates — see below) |
| 4 | Amend DIST-044 report record | `.agents/reports/dist-044-ssrf-redirect-hardening-report.md` | ✅ (correction text deviates — see below) |
| 5 | Amend DIST-044 review record | `.agents/reviews/dist-044-ssrf-redirect-hardening-review.md` | ✅ (correction text deviates — see below) |
| 6 | Manual verification (scratch script) | none committed | ✅ — this step is what surfaced the deviation |
| 7 | Full validation gate | n/a | ✅ |

## Validation Results

| Check | Result |
|-------|--------|
| `npm run typecheck` | ✅ Pass |
| `npm run lint` | ✅ Pass |
| `npm run eval` | ✅ Pass — `clean-light` 100%, `dark-mode` 100%, aggregate 100% |
| `git diff --stat eval/baseline.json` | ✅ No output — baseline untouched |
| Manual redirect test (10 consecutive runs, hostname → loopback, not allowlisted) | ✅ 10/10 `UnsafeUrlError`, no flakes, no partial `RenderResult` |
| Manual redirect test (allowlisted control, redirect still completes) | ✅ `renderUrl` resolved to a full `RenderResult` |

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/ingest.ts` | UPDATE | +58/-11 |
| `README.md` | UPDATE | +16/-4 |
| `.agents/plans/completed/dist-044-ssrf-redirect-hardening-plan.md` | UPDATE | +19/-4 (append + revise correction section) |
| `.agents/reports/dist-044-ssrf-redirect-hardening-report.md` | UPDATE | +25/-3 (append + revise correction section) |
| `.agents/reviews/dist-044-ssrf-redirect-hardening-review.md` | UPDATE | +12/-6 (append + revise correction section) |

No new files committed. The Task 6 scratch verification script
(`scratch-verify-route-ssrf.ts`, written at the project root per the CLAUDE.md convention for
`npx tsx` module resolution) and an exploratory `scratch-route-redirect-test.ts` used to isolate
the Playwright routing behavior were both deleted after use, per the plan's own instruction.

## Deviations from Plan

1. **Mechanism (Task 1, major)**: The plan mandated `page.route()` interception as "the chosen
   mechanism," explicitly preferred over the await-based fallback. That mechanism does not work
   for the case this plan exists to fix — Playwright never invokes route handlers for server-side
   redirect hops (confirmed via Playwright's own docs and `microsoft/playwright#34994`, plus an
   isolated empirical reproduction). Implemented the plan's own documented fallback instead: keep
   `page.on("response")`, but await `Promise.allSettled` over all pending redirect-validation
   promises before treating navigation as safe. This closes the race (the plan's literal
   acceptance criterion: "reliably throws `UnsafeUrlError` across 10+ consecutive runs, no
   flakes" — verified). It does **not** close the "already issued" gap — no in-process mechanism
   can, given Playwright's current capabilities, so this is a permanent limitation, not something
   a future pass could still fix with more effort.
2. **`page.unroute()` / navigation-phase scoping (Task 1)**: Dropped — there is no route()
   registration to unroute now.
3. **README wording (Task 2)**: The plan's suggested replacement text asserted `page.route()`
   interception and "Playwright awaits before deciding whether to send the request." Rewrote to
   describe the actual awaited-listener mechanism and to explain, briefly, why `page.route()` was
   ruled out — otherwise the README would ship a claim the code doesn't back up.
4. **DIST-044 correction notes (Tasks 3-5)**: The plan's suggested correction text said "Both
   gaps... are fixed in DIST-049... replaces the listener with `page.route()` interception."
   Rewrote each to state that only the race is fixed, and that the "already issued"
   mischaracterization is corrected (not fixed) with the same Playwright-limitation citation.
5. Everything else — file list, task ordering, validation gate, scratch-script-then-delete
   convention — matches the plan as written.

## Tests Written

No unit-test framework in this repo (per CLAUDE.md). Verification used a temporary scratch script
(`scratch-verify-route-ssrf.ts`, deleted after use) run via `npx tsx` from the project root with
`SSRF_ALLOWLIST_HOSTS=localhost`:

| Scenario | Method | Result |
|----------|--------|--------|
| Hostname redirect to a privately-resolving, non-allowlisted host (`localhost` → `localtest.me`, 302) | 10 consecutive `renderUrl()` calls against a local `http.createServer` | 10/10 threw `UnsafeUrlError`; no partial `RenderResult` ever observed |
| Allowlisted redirect control (`localhost` → `localhost`, 302) | 1 `renderUrl()` call | Resolved to a full `RenderResult` with `finalUrl` pointing at the redirect target — proves the fix doesn't break ordinary redirect chains |

`localtest.me` was confirmed to resolve to `127.0.0.1`/`::1` in this sandbox before use
(`node -e "require('dns').lookup('localtest.me',{all:true},console.log)"`), matching the plan's
stated fallback check.
