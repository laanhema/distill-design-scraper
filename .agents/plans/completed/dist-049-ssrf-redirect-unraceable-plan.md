# Plan: DIST-049 — Make the SSRF redirect check unraceable (and correct the DIST-044 claim)

## Summary

Replace the racy `page.on("response", async (response) => { ... await assertSafeUrl(...) ... })` redirect guard in `lib/ingest.ts` with `page.route("**/*", handler)`-based interception, scoped to main-frame navigation requests only. `route()` handlers run *before* Chromium issues the request and Playwright awaits them, so this closes both problems named in the issue: the race (the async DNS lookup can no longer be outrun by `page.goto()` resolving) and the "already issued" gap (a blocked navigation request is `route.abort()`ed before it ever leaves the process, for the specific redirect-chain case this control targets). `assertSafeUrl` remains the single guard — the new code only changes *when* it's called, not what it checks. A residual gap survives regardless of mechanism (Chromium's own DNS resolution at actual connect time can differ from our validation-time `dns.lookup`, i.e. true DNS-rebinding TOCTOU — same limitation already documented in `ssrfGuard.ts`'s own JSDoc), so the in-code comment and README are corrected to say plainly that network-level egress filtering, not this in-process check, is the load-bearing boundary. Separately, the DIST-044 plan/report/review are amended with a correction note rather than left standing, since they claimed the old mechanism "aborted immediately... before loading response bodies" — which was never true even for the old mechanism, and is a more nuanced claim now that route() has closed part of the gap.

## User Story

As a maintainer deploying Distill publicly
I want the redirect SSRF check to complete before navigation resolves, and its documented guarantee to match what it actually does
So that I don't under-provision network-level egress filtering because an in-process guard reads as sufficient

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | MEDIUM |
| Systems Affected | `lib/ingest.ts`, `README.md`, `.agents/plans/completed/dist-044-ssrf-redirect-hardening-plan.md`, `.agents/reports/dist-044-ssrf-redirect-hardening-report.md`, `.agents/reviews/dist-044-ssrf-redirect-hardening-review.md` |
| GitHub Issue | #97 |

---

## Chosen mechanism: `page.route()` interception (not the await-based fallback)

The issue comment names two candidates and explicitly prefers option 1 unless routing overhead proves too costly:

1. **`page.route()`/`context.route()` interception** — validate before Chromium issues the request, `route.abort()` on failure. Closes both the race *and* the "already issued" gap.
2. **Await-based** — collect listener promises, `await Promise.allSettled(pending)` after `goto`/`waitForLoadState`. Closes only the race; the request is still sent.

This plan implements **option 1**. Rationale:
- It is the only mechanism that satisfies the issue's own framing of what "unraceable" should mean — Playwright *awaits* route handlers before deciding whether to send the request, by design (this is what distinguishes `route()` from the `on("response")` event API, which is fire-and-forget).
- The overhead concern in the issue's technical notes is about intercepting *all* traffic; this plan avoids that by filtering inside the handler to `request.isNavigationRequest() && request.frame() === page.mainFrame()` — every other resourceType (image/script/stylesheet/xhr/fetch/etc.) hits an immediate `route.continue()` with no `assertSafeUrl` call — and by `page.unroute()`ing right after the navigation's try/catch completes, so the interception window is limited to the navigation phase, not the page's full lifetime (asset loads during `waitForLoadState`/`capturePage` are never routed through this handler at all).
- If a future measurement shows routing overhead is still unacceptable on some class of page, the await-based fallback remains available as documented in the issue — out of scope to implement speculatively here.

---

## Patterns to Follow

### Current racy mechanism (to be replaced)
```ts
// SOURCE: lib/ingest.ts:363-378
let redirectSsrfError: Error | null = null;
page.on("response", async (response) => {
  const status = response.status();
  if (status >= 300 && status < 400) {
    const location = response.headers()["location"];
    if (location) {
      try {
        const targetUrl = new URL(location, response.url()).toString();
        await assertSafeUrl(targetUrl);
      } catch (err) {
        redirectSsrfError = err instanceof Error ? err : new Error(String(err));
        await page.close().catch(() => {});
      }
    }
  }
});

try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: navTimeout });
} catch (err) {
  if (redirectSsrfError) {
    throw redirectSsrfError;
  }
  throw err;
}
if (redirectSsrfError) {
  throw redirectSsrfError;
}
```

### Single-guard contract (do not duplicate)
```ts
// SOURCE: lib/security/ssrfGuard.ts:160-197
/**
 * Throws `UnsafeUrlError` unless `rawUrl` is a public http(s) address safe to
 * navigate a headless browser to. Must be called before any navigation —
 * this is the guard, not a post-hoc check.
 */
export async function assertSafeUrl(rawUrl: string): Promise<void> { /* ... */ }
```
`lib/ingest.ts` is the only caller today (`renderUrl` pre-check at line 344, plus the redirect handler). The fix must keep calling this same function — no second inline IP/DNS check.

### Documented TOCTOU limitation (source of truth for the doc corrections)
```ts
// SOURCE: lib/security/ssrfGuard.ts:11-16
/**
 * Known limitation (TOCTOU / DNS rebinding): validation resolves via
 * `dns.lookup` at submission time, but Chromium re-resolves independently when
 * it navigates — a rebinding DNS name can answer public here and private
 * there. That gap is out of scope for this in-process guard; the mitigation is
 * network-layer egress filtering (README "Layer 2 — network-restrict the
 * container").
 */
```

### README structure to extend (Layer 1 bullet, not Layer 2 — Layer 2 already covers the general TOCTOU case)
```md
<!-- SOURCE: README.md:182-185 -->
- **Redirect re-validation**: the guard is re-applied to the `Location` target of every `3xx`
  response Chromium receives during navigation, so an open redirect on a public host can't be
  used to bounce the browser into a private range. A failing redirect aborts the render and
  surfaces the same `UnsafeUrlError`.
```

### Manual verification convention (no unit-test framework in this repo)
```md
<!-- SOURCE: CLAUDE.md, "Manually verifying extraction changes"; mirrored in
     .agents/plans/completed/ssrf-guard-url-analysis-plan.md Task 5 -->
Spin up a local http.createServer, run scratch scripts with `npx tsx` from the
project root (tsx/esbuild resolves node_modules relative to the script's own
location), and either set `SSRF_ALLOWLIST_HOSTS=localhost` or drive Playwright
directly to route around the SSRF guard blocking the loopback fixture server
itself. Delete scratch scripts after use — nothing under this task is committed.
```

### Historical-record correction convention (append, don't silently rewrite)
```md
<!-- SOURCE: .agents/PRDs/PRD.md:413 — this is how the project already
     records a documented-vs-actual gap once discovered, rather than quietly
     editing the original claim away -->
| **A shipped security control is documented as stronger than it is** (proven: the DIST-044
report claims redirects are "aborted immediately … before loading response bodies"; neither
holds) | Operators under-provision the real boundary because the in-process guard reads as
sufficient | Validate security controls against the adversarial case, not the convenient one...
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/ingest.ts` | UPDATE | Replace the racy `page.on("response")` redirect guard with `page.route()` interception scoped to main-frame navigation; correct the in-code comment |
| `README.md` | UPDATE | Correct "Deploying Publicly — Hardening Guide" Layer 1 bullet to state the request is still issued in the residual DNS-rebinding case and egress filtering is load-bearing |
| `.agents/plans/completed/dist-044-ssrf-redirect-hardening-plan.md` | UPDATE | Append a correction note fixing the "aborted immediately... before loading response bodies" claim in the Summary |
| `.agents/reports/dist-044-ssrf-redirect-hardening-report.md` | UPDATE | Append a correction note fixing the same claim (Summary line + "Tests Written" line) |
| `.agents/reviews/dist-044-ssrf-redirect-hardening-review.md` | UPDATE | Append a correction note fixing "Navigation is cleanly aborted... before response body load" |

No new files. No schema/eval-corpus changes (this is entirely inside the ingestion path, not the measured extraction lane `extractFromCapture` consumes).

---

## Tasks

### Task 1: Replace the redirect guard with `page.route()` interception in `lib/ingest.ts`

- **File**: `lib/ingest.ts`
- **Action**: UPDATE
- **Implement**:
  1. Remove the `page.on("response", async (response) => {...})` block (current lines 363-378).
  2. In its place, before `page.goto(...)`, register:
     ```ts
     let redirectSsrfError: Error | null = null;
     await page.route("**/*", async (route) => {
       const request = route.request();
       // Only the top-level document request and each subsequent redirect hop
       // need validation here — subresources (images/scripts/xhr/etc.) are a
       // separate, already-documented gap (README "Layer 2") that this
       // control has never claimed to close.
       if (!request.isNavigationRequest() || request.frame() !== page.mainFrame()) {
         await route.continue().catch(() => {});
         return;
       }
       try {
         await assertSafeUrl(request.url());
         await route.continue().catch(() => {});
       } catch (err) {
         redirectSsrfError = err instanceof Error ? err : new Error(String(err));
         await route.abort("blockedbyclient").catch(() => {});
       }
     });
     ```
  3. Keep the existing `try { await page.goto(...) } catch (err) { if (redirectSsrfError) throw redirectSsrfError; throw err; }` block as-is — `route.abort()` makes `page.goto()` reject with a Playwright navigation error, which this catch already translates into the more specific `redirectSsrfError` when present. Keep the defensive `if (redirectSsrfError) throw redirectSsrfError;` immediately after the try/catch too (belt-and-suspenders against any ordering edge case).
  4. Immediately after that defensive check (i.e., navigation has definitely succeeded and no redirect was blocked), call `await page.unroute("**/*").catch(() => {});` before `page.waitForLoadState(...)` — this is what keeps the interception window scoped to the navigation phase rather than the page's whole lifetime, so ordinary asset loads during capture aren't routed through the handler.
  5. Update the in-code comment. The old comment (if any exists nearby — check for one at the `page.on` site) and any new comment on the `page.route` block must state plainly: (a) this closes the race and, *for the specific navigation/redirect requests it validates*, prevents Chromium from issuing the request at all when blocked; but (b) a DNS-rebinding attacker can still slip through because our `assertSafeUrl` resolves the hostname once via `dns.lookup` and Chromium performs its own independent resolution when it actually connects after `route.continue()` — the two resolutions are not guaranteed to agree. State explicitly that network-level egress filtering (README "Layer 2") is the load-bearing boundary against that residual case, not this control. Do not claim the request is unconditionally "not issued" — only that a request whose *own* pre-connect DNS lookup this guard performed and rejected is aborted before send.
- **Mirror**: `lib/security/ssrfGuard.ts:1-17` (module doc-comment style for stating a known limitation plainly, without hedging); `lib/ingest.ts:87-91` (`dismissConsentBanner`'s doc-comment style: state the guarantee and its boundary in one paragraph).
- **Validate**: `npm run typecheck && npm run lint`

### Task 2: Correct the README "Deploying Publicly — Hardening Guide"

- **File**: `README.md`
- **Action**: UPDATE
- **Implement**: Rewrite the "Redirect re-validation" bullet (README.md:182-185) to state plainly that (a) the request to the redirect target is still issued by Chromium in the residual DNS-rebinding case (the guard's own DNS lookup and Chromium's connect-time DNS lookup are independent), and (b) network-level egress filtering (Layer 2, already below it) is the actual load-bearing boundary — not "a failing redirect aborts the render" read in isolation as if that were airtight. Suggested replacement text:
  ```md
  - **Redirect re-validation**: before each navigation request Chromium is about to send — the
    initial request and every subsequent `3xx` hop — the guard re-validates the target via
    `page.route()` interception, which Playwright awaits before deciding whether to send the
    request, and aborts it (surfacing `UnsafeUrlError`) rather than letting it go out when the
    target resolves privately. This closes the *race* a fire-and-forget check would have. It does
    **not** close the underlying TOCTOU: our check resolves the hostname once via `dns.lookup`,
    but Chromium performs its own independent DNS resolution when it actually connects — a
    DNS-rebinding attacker whose second answer differs from the first can still cause the request
    to reach a private target. Network-level egress filtering (Layer 2, below) is what actually
    stops that case; treat this control as a fast-fail for the common case, not a hard boundary.
  ```
  Cross-check that the existing Layer 2 paragraph (README.md:200-205), which already describes this TOCTOU for the *initial* URL, reads consistently with the updated Layer 1 bullet now that the same limitation is stated for redirects too — light-touch edit only if the two paragraphs end up saying the same thing in conflicting words (e.g. make Layer 2 clearly cover "and the same applies to every redirect hop, not just the initial URL" if it doesn't already).
- **Mirror**: README.md:192-205 (Layer 2's existing "no in-process check can close this race" framing) — reuse that phrasing rather than inventing new wording for the same limitation.
- **Validate**: manual read-through; no build step touches README.

### Task 3: Amend the DIST-044 plan record

- **File**: `.agents/plans/completed/dist-044-ssrf-redirect-hardening-plan.md`
- **Action**: UPDATE
- **Implement**: Append a `## Correction (2026-07-29, DIST-049)` section at the end of the file (do not silently edit the original Summary — this is a historical record of what was planned/shipped at the time) stating: the Summary's claim that navigation is "aborted... immediately before loading redirect response bodies" was inaccurate — by the time the `page.on("response")` event fired, Chromium had already issued the request to the redirect target, and the async handler additionally raced `page.goto()` resolving (Playwright does not await `on()` listeners), so a hostname-based private redirect could slip through undetected. Link to DIST-049 / `.agents/plans/dist-049-ssrf-redirect-unraceable-plan.md` as the fix.
- **Validate**: manual read-through.

### Task 4: Amend the DIST-044 report record

- **File**: `.agents/reports/dist-044-ssrf-redirect-hardening-report.md`
- **Action**: UPDATE
- **Implement**: Append the same `## Correction (2026-07-29, DIST-049)` note (Summary line 9's "aborted immediately" and the "Tests Written" line 38's "before loading response bodies" are the two overstated claims — quote and correct both). State that the DIST-044 synthetic test only exercised a literal IP redirect target (`169.254.169.254`), which resolves instantly and therefore always won the race, masking both the race and the already-issued gap; the untested case was a redirect to a *hostname* resolving privately.
- **Validate**: manual read-through.

### Task 5: Amend the DIST-044 review record

- **File**: `.agents/reviews/dist-044-ssrf-redirect-hardening-review.md`
- **Action**: UPDATE
- **Implement**: Append the same correction note, quoting and correcting line 8's "Navigation is cleanly aborted on unsafe target IP ranges before response body load."
- **Validate**: manual read-through.

### Task 6: Manually verify the fix (no unit-test framework in this repo)

- **File**: none committed — scratch script only, under the scratchpad dir
- **Action**: n/a
- **Implement**: Following the CLAUDE.md "Manually verifying extraction changes" convention and the precedent in `.agents/plans/completed/ssrf-guard-url-analysis-plan.md` Task 5, write a throwaway script run via `npx tsx <script>` **from the project root**:
  1. Start a local `http.createServer` on `localhost` that 302-redirects every request to `http://localtest.me:<same-port>/` (or another hostname confirmed to resolve to `127.0.0.1`/`::1` in the execution environment — `getent hosts localtest.me` / `node -e "require('dns').lookup('localtest.me',{all:true},console.log)"` confirms this resolves to loopback in this sandbox already).
  2. Call `renderUrl("http://localhost:<port>/")` with `SSRF_ALLOWLIST_HOSTS=localhost` set (so the *entry* hostname is allowed, but `localtest.me` is not — exactly the case DIST-044's literal-IP test never covered) — run this **10+ consecutive times in a loop** and assert every run throws `UnsafeUrlError`, with zero flakes (directly targets the issue's first acceptance criterion).
  3. Assert no partially-captured result is ever returned (the loop only records pass/fail on whether a `RenderResult` object appeared) and that repeated runs don't leak browser processes (spot check `ps` or rely on the existing `finally { browser.close() }`).
  4. As a control, redirect to a normal public target instead (e.g. `http://` → `https://` on a real reachable host, or simply a same-server 302 to a second local path that itself resolves publicly-equivalent) and confirm navigation still completes — i.e. the route-based interception doesn't break ordinary redirect chains. A simpler in-sandbox control: redirect `localhost` → `localhost` (both allowlisted) and confirm the render completes normally, proving `route.continue()` still works end-to-end for allowed targets.
  5. Delete the scratch script after use.
  - If `localtest.me` is not resolvable in whatever environment runs this (e.g. an offline CI-like sandbox with no DNS), fall back to a temporary `/etc/hosts`-style override is not available without root — instead stub `dns.lookup` is not an option since `assertSafeUrl` imports the real `dns` module directly; in that case use a hostname already confirmed to resolve to loopback locally, or note the environment limitation in the report rather than silently skipping the acceptance criterion.
- **Validate**: 10/10 consecutive runs throw `UnsafeUrlError` with no flakes; normal redirect chain still completes.

### Task 7: Full validation gate

- **File**: n/a
- **Action**: n/a
- **Implement**: Run the full gate and confirm `eval/baseline.json` is untouched (this change is entirely in `lib/ingest.ts`'s render path, outside `extractFromCapture`'s offline-replayable measured lane — any score movement would mean something leaked incorrectly, per the issue's own acceptance criterion).
- **Validate**: `npm run typecheck && npm run lint && npm run eval` — then `git diff --stat eval/baseline.json` must show no changes.

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Eval harness (must pass with eval/baseline.json unchanged — this path is
# outside the measured lane)
npm run eval
git diff --stat eval/baseline.json   # expect no output
```

## End-to-End Verification

1. Local redirect-server scratch script (Task 6) run from the project root via `npx tsx`:
   - Hostname-redirect-to-loopback case: `UnsafeUrlError` thrown on 10/10 consecutive runs, no flakes, no partially-populated `RenderResult` ever observed.
   - Allowed-target redirect case: `renderUrl` still resolves to a full `RenderResult` (proves `route.continue()` doesn't itself break ordinary navigation).
2. Read `lib/ingest.ts`'s new comment aloud against the acceptance criterion wording — it must not claim the request is never issued in the residual TOCTOU case; it must name egress filtering as load-bearing.
3. Read the updated README "Deploying Publicly — Hardening Guide" Layer 1 bullet against the same criterion.
4. Diff the three amended `.agents/` DIST-044 files — confirm the original text is preserved (historical record) and a clearly-dated correction section is appended, not a silent rewrite.
5. `npm run typecheck && npm run lint && npm run eval`, then confirm `eval/baseline.json` shows no diff.

---

## Risks

| Risk | Mitigation |
|------|------------|
| `page.route("**/*", ...)` intercepts every request, not just navigations, which could add latency to asset-heavy pages | In scope: filter to `isNavigationRequest() && frame() === page.mainFrame()` inside the handler (immediate `route.continue()` for everything else, no `assertSafeUrl` call) and `page.unroute()` right after navigation settles, so the interception window doesn't cover the page's full asset-loading lifetime. Residual per-request IPC overhead from Playwright's routing mechanism itself (even for requests that hit the fast `continue()` path) is inherent to using `route()` at all and is accepted per the issue's explicit preference for this mechanism; not further optimized in this pass. |
| `route.abort()` causes `page.goto()` to reject with a generic Playwright navigation error rather than directly surfacing `UnsafeUrlError` | Already handled by the existing `try { goto } catch (err) { if (redirectSsrfError) throw redirectSsrfError; throw err; }` pattern carried over unchanged from the current code — no new logic needed, just confirm it still fires with the new abort path via Task 6's manual test. |
| Comparing `request.frame() === page.mainFrame()` by object identity could be fragile if Playwright ever returns non-stable `Frame` references | Playwright's documented behavior is that `Frame` objects are stable/cached per navigation context; this is also the pattern Playwright's own docs recommend for "route only the main frame." If Task 6's manual verification shows otherwise, fall back to comparing frame URLs or drop the mainFrame filter (accepting slightly broader — but still resourceType-scoped — validation) as a follow-up, not blocking this plan. |
| `localtest.me` (or another public wildcard-DNS-to-loopback domain) might not resolve in the implementer's execution environment (offline sandbox, restricted egress) | Confirmed resolvable in this repo's current sandbox (`getent hosts localtest.me` → `127.0.0.1`/`::1`) at plan time. If unavailable at implementation time, document the environment gap in the implementation report rather than silently skipping the hostname-redirect test case — the acceptance criterion specifically requires a *hostname*, not a literal IP, so this test can't be silently downgraded back to the literal-IP case DIST-044 already covered. |
| Amending three historical `.agents/` records could read as rewriting history rather than correcting it | Mitigation is procedural: append a clearly dated `## Correction (2026-07-29, DIST-049)` section to each file rather than editing the original claims in place, matching the precedent already set in `.agents/PRDs/PRD.md`'s own risk table (§14) for recording a documented-vs-actual gap. |
| `assertSafeUrl`'s DNS-rebinding TOCTOU (Chromium's connect-time resolution vs. our validation-time resolution) is *not* fixed by this change | Explicitly out of scope — the issue's acceptance criteria ask for correct documentation of this residual gap (Task 1's comment, Task 2's README edit), not for closing it. Closing it would require either controlling Chromium's own DNS resolution (not exposed by Playwright) or full network-level egress filtering, which is already the documented Layer 2 mitigation. |

---

## Acceptance Criteria

- [ ] A page that 30x-redirects to a hostname resolving to a private/loopback address reliably throws `UnsafeUrlError` across 10+ consecutive runs, no flakes (Task 6).
- [ ] When it throws, no partially-captured `RenderResult` is returned and the browser context is closed (Task 1's `finally { browser.close() }` already guarantees this; confirmed by Task 6).
- [ ] A normal public redirect chain still completes navigation as before, no added latency regression beyond DNS lookups already performed (Task 6 control case).
- [ ] `lib/ingest.ts`'s in-code comment and README's "Deploying Publicly — Hardening Guide" both state plainly that (a) the request can still be issued in the residual DNS-rebinding case and (b) network-level egress filtering is the load-bearing boundary (Tasks 1 & 2).
- [ ] The DIST-044 plan, report, and review records are amended with a correction rather than left standing (Tasks 3, 4, 5).
- [ ] `npm run typecheck`, `npm run lint`, `npm run eval` all pass with `eval/baseline.json` unchanged (Task 7).
- [ ] `assertSafeUrl` remains the single guard — no second inline IP/DNS check introduced anywhere.
