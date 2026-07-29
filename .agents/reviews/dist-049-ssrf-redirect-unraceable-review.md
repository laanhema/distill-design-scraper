# Code Review: fix/dist-049-ssrf-redirect-unraceable

**Scope**: Diff of branch `fix/dist-049-ssrf-redirect-unraceable` against `main`, including
uncommitted changes (nothing committed yet). Touches `lib/ingest.ts`, `README.md`, and correction
notes appended to the three DIST-044 `.agents/` records.
**Related**: GitHub issue #97 (racy SSRF redirect check).
**Recommendation**: APPROVE

## Summary

The core change replaces a fire-and-forget `page.on("response", async (response) => { ... await
assertSafeUrl(...) ... })` redirect-validation listener with one that pushes each validation
promise into `pendingRedirectValidations` and `Promise.allSettled`s the array both on the
`page.goto()` error path and the success path, before the render is ever treated as safe. This
closes the real race described in issue #97: Playwright does not await `on()` handlers, so a
fast-resolving DNS lookup for a malicious redirect hostname could previously let `page.goto()`
resolve before `assertSafeUrl` finished. The fix's correctness rests on one ordering assumption —
that every 3xx response for a navigation's redirect chain is delivered to the `"response"`
listener before `domcontentloaded` fires for the final destination — which is architecturally
sound (CDP delivers `Network.responseReceived` before the corresponding lifecycle event, over the
same connection, in order) and was empirically verified in the implementation report via 10
consecutive hostname-redirect-to-loopback runs with zero flakes, plus a same-target control run
proving normal redirects still complete.

Notably, the implementation report documents that the plan's originally *preferred* mechanism
(`page.route()` interception) was tried first and found not to work at all for this case —
Playwright never invokes route handlers for server-side redirect hops — and the fallback
(await-based) mechanism actually shipped was used instead, with the code comment, README, and the
three amended DIST-044 historical records all corrected to state plainly that the request to a
redirect target is always issued before this check can act, and that network-level egress
filtering remains the load-bearing control. This is a good example of catching and correcting an
overclaimed security guarantee rather than shipping the more impressive-sounding but inaccurate
wording — consistent with the project's "measured, never faked" ethos even outside the extraction
lanes it usually applies to.

## Issues Found

### Critical
None.

### High Priority
None.

### Medium Priority
None.

### Suggestions

- **`lib/ingest.ts:410-427`** — The `page.on("response", ...)` listener is never removed
  (`page.off`/`removeListener`) once the initial navigation's redirect validation window has
  passed; it stays attached for the rest of the page's life, including through
  `waitForLoadState("networkidle")` and `capturePage(page)` (screenshots, DOM harvest, scroll
  nudges that can trigger further lazy-loaded subresource requests). A late 3xx response with an
  unsafe `Location` — e.g. an ad/analytics beacon or lazy image redirecting to a private address
  during capture, entirely plausible on a real page — will still call `page.close()`
  asynchronously out from under `capturePage`, which isn't guarded by a try/catch around it in
  `renderUrl`. This is pre-existing behavior (identical in the code before this diff) and not a
  security regression — `browser.close()` in the outer `finally` still guarantees cleanup, and
  `redirectSsrfError` set at that point is never re-checked, so the practical effect is a crashed
  render with a generic error rather than a silent bypass — but since this branch already touches
  this exact block for the same underlying concern, it would be a natural, low-cost addition to
  `page.off("response", ...)` (or track/ignore validations queued after the initial await) right
  after the redirect-check window closes, scoping the listener's lifetime the same way the
  originally-planned `page.route()` + `page.unroute()` approach would have. Worth a quick
  follow-up issue if not addressed here; does not block this fix.
- **`lib/ingest.ts:415-424`** — `Promise.allSettled` is used to await
  `pendingRedirectValidations`, but every promise in that array is guaranteed to fulfill (all
  errors are caught inside the IIFE itself). `Promise.all` would communicate the actual guarantee
  more directly; purely stylistic, no behavioral difference.
- The correctness of the whole fix leans on an implementation-detail ordering guarantee of
  Playwright/CDP event delivery that isn't part of Playwright's documented public contract. The
  10/10 manual verification in the implementation report is solid evidence for the current
  Playwright version, but there's no regression coverage (by design — no unit-test framework, and
  this path is outside the eval harness's offline-replayable scope) that would catch a future
  Playwright upgrade silently changing that ordering. Not asking for new test infra given the
  project's documented conventions — just flagging it as the one assumption worth re-verifying
  manually (per the CLAUDE.md "Manually verifying extraction changes" scratch-script convention)
  after any future Playwright version bump.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`, also spot-checked `npx eslint lib/ingest.ts` directly) | PASS |
| Tests | N/A — no unit-test framework in this repo (per CLAUDE.md); `eval/baseline.json` confirmed unchanged in the diff, consistent with this fix being entirely inside the render/ingestion path, outside `extractFromCapture`'s measured lane |
| Manual verification | Not re-run in this review; implementation report documents 10/10 consecutive hostname-redirect-to-loopback runs throwing `UnsafeUrlError` with no flakes, plus a same-target control proving normal redirects still complete — reasoning checks out against the code as written |

## What's Good

- Closes the actual race named in issue #97: the fix moves from "fire-and-forget async listener
  racing `page.goto()`" to "collect every validation promise, `Promise.allSettled` before treating
  the render as safe," on both the `goto()` throw path and the success path.
- Honest, corrected documentation: the code comment, README "Redirect re-validation" bullet, and
  all three amended DIST-044 historical records now state plainly that (a) the request to a
  redirect target is always issued before any in-process check can act, and (b) network-level
  egress filtering is the load-bearing boundary — replacing prior wording ("aborted immediately...
  before loading response bodies") that overstated the guarantee. This matches the codebase's
  stated "measured, never faked" principle.
- Good-faith engineering trail: the report documents that the plan's preferred `page.route()`
  mechanism was tried, found non-functional for server-side redirect hops (backed by Playwright's
  own docs and a maintainer confirmation on `microsoft/playwright#34994`), and reverted in favor of
  the plan's own documented fallback — rather than shipping a mechanism that silently didn't work.
- Historical records amended via appended, dated correction sections rather than silently rewriting
  the original claims — preserves the audit trail.
- No stray scratch files left in the working tree; `eval/baseline.json` untouched; typecheck and
  lint both clean.

## Recommendation

Approve. The suggestions above are non-blocking (one pre-existing robustness nit, one style nit,
one process note about re-verifying an event-ordering assumption on future Playwright upgrades) —
none of them undermine the security property this fix delivers.
