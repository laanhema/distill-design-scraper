# Spike report: view-obscuring overlays, cookie walls, and paywalls

**Issue**: #166 (spike for the overlay acceptance criterion of #156)
**Status**: Spike complete. No `lib/`, `eval/`, or schema changes were made. The prototypes ran from a scratch directory outside the repo.
**Date**: 2026-10-07

## Summary

Today Distill takes its screenshot behind the overlay on most sites that show one. On the 17 live sites tested, the current `dismissConsentBanner` (`lib/ingest.ts:88`) left an overlay in place on 10 sites. On 7 of those, a full-viewport consent wall or modal covered the whole screenshot. The overlay does not just spoil the picture. It changes the measured report. On yle.fi the `background` role comes out as `#878787`, which is the dimmed backdrop gray. With the overlay cleared, the role is `#f1f2f4`, and a `border` role appears that was missing before.

Overlays can be handled well with open-source tools that fit the current stack. In the second run, a layered pass left all 16 sites measuring clear. The pass combines three parts. The Ghostery adblocker engine applies cookie and annoyance filter lists. DuckDuckGo's autoconsent works through consent-manager flows. A guarded generic heuristic handles the rest. The work is not a deep architectural change. It stays inside the `lib/ingest.ts` seam, plus one additive capture field and the error mapping in the API route and UI.

Paywalls are a different case, and the recommendation is not to bypass them. Distill needs a site's design, not its article text. A paywalled page still shows that design. Every known bypass technique is legally exposed, defeated by the publishers that matter, or breaks the design measurement itself. Bot challenges (Cloudflare, DataDome) are also not something to evade. They should produce the clear error that the first acceptance criterion of #156 already asks for.

**Recommendation: GO** with a four-layer pipeline: prevent, consent, generic clear, detect. When an overlay is still there after mitigation, return a typed error or warning. The fallback the issue asked for becomes the last layer of the design, not a substitute for it.

---

## 1. What is being blocked, and what each case needs

| Obstruction | Example (tested) | Design still visible underneath? | Bypassable in principle? | Right response |
|---|---|---|---|---|
| Cookie banner (bottom bar, corner panel) | IKEA OneTrust, Figma, BBC bar | Yes, partly covered | Yes | Dismiss or hide |
| Consent wall (full cover + scroll lock) | Guardian, Spiegel, HS.fi, Yle (Sourcepoint, in-house) | Yes, under a backdrop | Yes | Dismiss (opt out) |
| "Consent or pay" wall | Guardian Ad-Lite, Le Monde | Yes | Yes, through the reject path | Dismiss (opt out) |
| Newsletter, promo, or sign-in modal | Booking.com "Genius" modal | Yes | Yes | Escape, close, or hide |
| Soft or metered paywall | News sites | Yes, the chrome and lead-in render | Not needed | Capture as-is, annotate |
| Hard paywall or login wall | Subscription-only pages | The subscribe page uses the same design system | Only through circumvention | Capture as-is, or warn |
| Bot challenge or HTTP block | Stack Overflow (Cloudflare 403), nytimes.com 403, economist.com 403 | No, the page is a challenge page | Only through detection evasion | Error (#156, first acceptance criterion) |

The first four rows are what this spike set out to fix. The last three are what the issue asked about under "bypass", and the answer for them is in section 5.

## 2. What the current code does

`capturePage` calls `dismissConsentBanner` once, before any screenshot. The function looks for a button in the main frame whose accessible name exactly matches one of nine English phrases ("accept all", "ok", and so on), and clicks it. The measured gaps:

- **Iframes.** Sourcepoint, which runs on the Guardian, Spiegel, BBC, and HS.fi, renders its buttons inside an iframe. `page.getByRole` on the main frame never sees them. All four stayed fully blocked.
- **Language and wording.** The function missed Yle's "Hyväksy kaikki", IKEA's "Hyväksy kaikki evästeet", and Figma's "Allow all cookies". The last one failed because the pattern is anchored to `^allow all$`.
- **Non-consent modals.** Nothing handles newsletter, promo, or sign-in modals, or scroll locks.
- **Timing.** The function runs once. On BBC, the first screenshot showed only a bottom cookie bar. By the first panorama tile, a full-viewport Sourcepoint wall had appeared, and it covered all six tiles measured (`coverage = 1.0`). Late overlays corrupt `panoramaShot`, and `panoramaShot` is what the palette area-weighting reads.
- **No signal.** `bannerDismissed` is returned through `RenderResult` and `meta`, but the UI never renders it, and nothing checks whether the view is actually clear.

### Measured impact on the report

The real pipeline (`capturePage`, then `captureFromRender`, then `extractFromCapture`) ran on the same URL with and without mitigation.

| Site | Field | Overlay present | Overlay cleared |
|---|---|---|---|
| yle.fi | palette `background` | `#878787` (backdrop gray) | `#f1f2f4` |
| yle.fi | palette `border` | missing | `#e8e9eb` |
| theguardian.com | palette `surface` / `primary` / `muted` | `#041f4a` / `#c70000` / `#dcdcdc` | `#f6f6f6` / `#ffe500` / `#707070` |
| ikea.com | recipes `Button` | extra `text` variant (black pill, 20px 24px padding, weight 700) | absent |

The IKEA extra Button variant matches the OneTrust "Hyväksy kaikki evästeet" pill buttons. That attribution is inferred from the screenshot, not traced node by node. The Guardian overlay lives in an iframe, so it never enters the style dump. The palette shift there comes from the backdrop dimming the screenshot that area-weighting reads.

## 3. Options surveyed

| Option | How it works | Measured result | Cost and risk | Verdict |
|---|---|---|---|---|
| **A. Ghostery adblocker + filter lists** (`@ghostery/adblocker-playwright`, Fanboy Annoyances, Fanboy Cookiemonster, uBO cookies) | `enableBlockingInPage(page)` before `goto`. Blocks CMP scripts at the network layer and injects cosmetic `display:none` rules that persist for the page's life | Cleared BBC, IKEA, Zalando, Notion. Missed every Sourcepoint wall and Yle | MPL-2.0, about 4.5 MB installed. Lists are CC BY 3.0 (EasyList/Fanboy) and GPLv3 (uBO). Parsing takes 343 to 762 ms once per process, and loading a serialized engine takes 7 ms. Uses `page.route`, which disables Playwright's HTTP cache | **Adopt** as the prevention layer |
| **B. DuckDuckGo autoconsent** (`@duckduckgo/autoconsent` standalone bundle) | `addInitScript` before `goto`. Detects 300+ consent managers, including ones inside iframes, and clicks through the opt-out flow. Has a heuristic tier for unknown banners | Cleared Guardian, Spiegel, HS.fi, IKEA, Zalando, Le Monde, Notion, Airbnb, Stripe. Missed Yle, Figma, the BBC bottom bar, and the Booking promo modal | MPL-2.0. The bundle is 449 KB and the package is 15 MB installed, mostly extension builds. Default action is opt-out, so no tracking consent is granted | **Adopt** as the consent layer |
| **C. Generic heuristic** (Escape, `dialog.close()`, hide large fixed layers, unlock `overflow` on `html`/`body`) | One `page.evaluate` after load | v1 cleared Yle, Booking, Le Monde, Wired's banner. v1 also **removed Wired's real 364 px fixed header**. v2 (guarded) **removed Apple's global nav** | No dependency. Every rule has false positives, and both versions deleted a real design element | **Adopt, gated and guarded**, as the last layer. It must skip `nav`, `header`, `[role=banner]`, and `[role=navigation]` |
| **D. JavaScript disabled** (`javaScriptEnabled: false`) | No scripts run, so no overlays appear | Cleared overlays on every site, but Booking served a "JavaScript is disabled, verify you're not a robot" page, Figma lost its hero image, and Zalando timed out | Breaks hydration, JS-loaded fonts, and client-rendered layout. That measures a different design from the one users see | **Reject** |
| **E. Pre-seeded consent cookies or TCF string** | Write the CMP's "already consented" cookie before navigating | Not tested | Each consent manager needs its own cookie. Autoconsent covers the same cases with a maintained rule set | **Reject**, B covers it |
| **F. LLM-driven dismissal** (Stagehand-style `act("dismiss the popup")`, or a vision check) | A model reads the page and clicks | Not tested | Non-deterministic, adds seconds and per-call cost, and needs a key. AGENTS.md forbids the measured lane from depending on an API key | **Reject** for the measured lane. A vision "is this obstructed?" check could be an optional second opinion when `aiLaneAvailable()` |
| **G. Hosted screenshot or browser APIs** (Urlbox, ScreenshotOne, Browserless `blockConsentModals`) | A vendor renders the page | Not tested | Sends every user URL to a third party and costs money per call. Screenshot-only APIs give no DOM, so no `styleDump`. Conflicts with the local and BYOK direction in #158 | **Reject** |
| **H. Playwright `addLocatorHandler`** | Runs a handler when an overlay blocks an action | Not tested | Fires only before actions such as clicks. Distill only screenshots and evaluates, so the handler would never fire. This is from the Playwright API contract, not a measurement | **Not applicable** |

## 4. Prototype evidence

A scratch Playwright harness rendered each site with the same viewport (1440×900), user agent, and color scheme as `renderUrl`, then applied one strategy. It then measured obstruction in the page. The measurement sampled a 24×15 grid with `elementFromPoint`, descending into shadow roots. It walked up from the topmost element to its outermost `position: fixed` ancestor. Top-anchored bars shorter than 20% of the viewport were ignored. It also recorded scroll locks on `html`/`body` and visible `dialog[open]` and `[aria-modal]` elements. Every ambiguous cell was checked against its screenshot.

### Run 1: 17 sites × 6 strategies

`coverage` is the share of viewport sample points covered by a non-header fixed layer. "Blocked" means coverage 1.0 or a scroll lock.

| Site | Current code | A. Ghostery | B. Autoconsent | C. Heuristic v1 | D. No JS |
|---|---|---|---|---|---|
| theguardian.com | blocked | blocked | clear | clear | clear |
| spiegel.de | blocked | blocked | clear | clear | clear |
| hs.fi | blocked | blocked | clear | clear | clear |
| bbc.com | blocked | clear | bottom bar left (0.07) | clear | clear |
| lemonde.fr | blocked | clear | clear | clear | clear |
| yle.fi | blocked | blocked | blocked | clear | clear |
| booking.com | blocked | blocked (promo modal) | blocked (promo modal) | clear | JS-required robot page |
| zalando.fi | 0.33 | clear | clear | 0.33 | timeout |
| ikea.com | 0.15 | clear | clear | 0.15 | clear |
| figma.com | 0.11 | 0.11 | 0.11 | 0.11 | clear, hero image missing |
| wired.com | clear | clear | clear | **removed real header** | clear |
| notion.com, airbnb.com, medium.com | clear | clear | clear | clear | clear |
| nytimes.com, economist.com, stackoverflow.com | HTTP 403 block page | same | same | same | same |

Two raw metric readings were wrong and were corrected from the screenshots. Wired's 0.40 is its tall fixed header, which is not an overlay. Le Monde's leftover modal count comes from a hidden `[aria-modal]` node, and the page is visually clear. A production detector needs both fixes. It should count tall top-anchored headers as headers, and count a modal only if a hit test at its center lands inside it.

Sources A and B complement each other. A catches banners that B's rules miss (BBC, Notion). B catches the iframe walls that A's lists don't hide (Sourcepoint). C catches the in-house dialogs that neither covers (Yle).

### Run 2: layered pipeline (A + B + guarded C) with panorama re-checks

Each render scrolled through up to six panorama tiles and re-measured at every tile. It then waited 3 s, scrolled back to the top, and measured again, to catch late overlays.

- Current code: BBC, Booking, Yle, Le Monde, IKEA, and Figma stayed obstructed on every tile. On BBC a full Sourcepoint wall arrived after the first screenshot.
- Layered: every one of the 16 sites measured 0 coverage on every tile and on the late re-check. The only exception was IKEA's 56×58 chat bubble, at 0.003.
- False positive: the guarded heuristic hid `nav#globalnav` on apple.com, because the nav sits 70 px from the top under a region banner. The rule that excludes landmarks, `header`, and `nav` was added to the recommendation because of this.
- Typical Distill targets (stripe.com, linear.app, vercel.com, notion.com, airbnb.com, apple.com) were clear before and after. Autoconsent opted out of Stripe's banner through its heuristic tier.

### Cost

Wall-clock time per render went from about 6 to 28 s for the current code to about 13 to 31 s for the layered pass. The workers ran four at a time, so these timings are noisy. Most of the added time is the prototype's fixed wait of up to 6.8 s for an autoconsent "done" message, and that wait expires in full on sites with no consent manager. A production version would end the wait on autoconsent's `autoconsentDone` message, or on "no CMP detected", with a short cap. The added time should then be much smaller. That is a guess and needs measuring during implementation. Building the filter engine costs up to 762 ms once per process. Loading a serialized engine costs 7 ms.

## 5. Why not bypass paywalls or bot blocks

The techniques that exist, and why each one fails for Distill:

| Technique | What it does | Why not |
|---|---|---|
| Googlebot or Bingbot user agent | Pretends to be a search crawler that publishers let through | Publishers verify crawlers by reverse DNS against Google's published IP ranges ([Google docs](https://developers.google.com/search/docs/crawling-indexing/verifying-googlebot)), so the publishers who care block it. It also misrepresents who is fetching |
| JavaScript disabled | Client-side paywalls never run | Measured in run 1. It also changes the design being measured (option D) |
| Archive caches (archive.org, archive.ph) | Fetches someone else's stored copy | Captures a stale, re-hosted version of the page. Routes user URLs through a third party. Adds a fetch path the SSRF guard does not cover |
| Referrer spoofing, paywall-specific filter lists (for example Bypass Paywalls Clean) | Tricks metering, or hides the paywall element specifically | This is circumvention by design. Publishers have used DMCA claims against it. 12ft.io was taken offline after News/Media Alliance pressure, and a paywall-bypass Firefox add-on was removed after a DMCA claim ([Slashdot](https://news.slashdot.org/story/25/07/17/2029207/news-publishers-take-paywall-blocker-12ftio-offline)) |

Bypassing also adds little for this product. Distill extracts tokens and layout, not article text. A metered or lead-in paywall still renders the header, typography, palette, and cards around a truncated article. Google's own guidance requires publishers to serve that lead-in ([flexible sampling](https://developers.google.com/search/docs/appearance/flexible-sampling)). A hard paywall usually lands on a subscribe page built from the same design system. Each render also starts in a fresh browser (`renderUrl` launches one per call), so metered counters start at zero for every capture. That is the normal state of any first-time visitor, not a bypass.

The recommended paywall stance is to capture what a first-time visitor sees and to dismiss consent and promo overlays. Do not target the paywall itself. Annotate the report when the page declares itself paywalled. Publishers mark this in JSON-LD with `isAccessibleForFree: false` ([Google docs](https://developers.google.com/search/docs/appearance/flexible-sampling)). That signal looks cheap to read from the page, but this spike did not test it.

Bot challenges get the same answer. Stealth plugins and fingerprint spoofing are detection evasion, which this project should not ship. In run 1, 3 of 17 sites returned HTTP 403 block pages, and zalando.fi returned a 403 on some attempts. Today `renderUrl` ignores the response status, so Distill would extract the design of the challenge page and present it as the site's design. That breaks the "measured, never faked" rule. The first acceptance criterion of #156 already tracks this gap, so it is not filed again here.

## 6. Recommended design

### Data shape

The capture records what was done to the page and what state the page was measured in. The state is a discriminated union, so "blocked but has a report" cannot be represented:

```ts
type Mitigation =
  | { kind: "consent"; cmp: string; action: "optOut" | "optIn" }      // autoconsent
  | { kind: "filterLists"; lists: string[] }                           // Ghostery engine was active
  | { kind: "overlayHidden"; descriptor: string; rule: "fullCover" | "floatingPanel" | "dialog" | "escape" }
  | { kind: "scrollUnlocked" };

type Obstruction = { coverage: number; scrollLocked: boolean; culprit?: string; at: "viewport" | "dark" | `tile-${number}` };

type CaptureAccess =
  | { state: "clear"; mitigations: Mitigation[] }
  | { state: "obstructed"; mitigations: Mitigation[]; obstructions: Obstruction[] }
  | { state: "blocked"; reason: "httpStatus" | "botChallenge" | "navigationFailed"; status?: number };
```

`RenderResult.bannerDismissed` is removed, and `access` takes its place. `access` is optional on `Capture`, so the committed eval captures without it replay unchanged. That follows the "additive by construction" rule in AGENTS.md.

### Pipeline (all inside `lib/ingest.ts`)

1. **Prevent.** Before `goto`, call `blocker.enableBlockingInPage(page)`. The engine is built once per process from cached lists, either refreshed at startup or vendored as a serialized snapshot. Its cosmetic rules persist through the panorama, dark-scheme, and responsive passes. That persistence is why BBC stayed clear on every tile.
2. **Consent.** Before `goto`, call `page.addInitScript(autoconsentBundle)`. After `networkidle`, wait for `autoconsentDone`, a "no CMP" result, or a short cap.
3. **Generic clear.** Run this only if step 4 reports an obstruction. Press Escape, call `close()` on any open `<dialog>`, then hide non-landmark fixed layers that cover over 60% of the viewport, or floating panels that hold controls and more than 80 characters of text. Finally, unlock `overflow` on `html`/`body`. Record every hidden element as an `overlayHidden` mitigation. This step replaces `dismissConsentBanner`. Autoconsent covers what the click list tried to do.
4. **Detect.** Run `measureObstruction` before the viewport shot, before the dark-scheme shot, and before each panorama tile. If an overlay appears late, run step 3 once more and retake the shot. If it is still there, record it.
5. **Decide.** `blocked`, or `obstructed` with coverage ≥ 0.5 or a scroll lock on the viewport shot, becomes a typed error. Follow the `UnsafeUrlError` pattern so the route returns an actionable 4xx message instead of the generic 502. Smaller obstructions proceed with a warning in the report body and the UI. Do not cache a response that carries a warning, matching how the route already skips caching `structureUnavailableReason`.

### What changes outside `lib/ingest.ts`

- `lib/analyze.ts` passes `access` into `Capture` and `meta`.
- `lib/schema.ts` and `lib/emit.ts` get an optional `capture.access` block in the frontmatter. The body renders one line, such as "Captured after opting out of the OneTrust consent banner; 1 overlay hidden", only when mitigations happened. This is the provenance rule applied to capture conditions.
- `app/api/analyze/route.ts` maps the new error type to a 4xx.
- `app/page.tsx` shows the blocked error and an "obstructed" warning state. This is the fourth acceptance criterion of #156.
- `eval/capture.ts` gets the mitigation for free, because it calls `capturePage`. The offline eval cannot regression-test the mitigation, because it replays frozen captures. That needs a `/verify` scenario against a synthetic fixture: a newsletter modal, a scroll lock, a corner cookie panel, and a sticky `nav` that must survive.

### Interaction with existing invariants

- **SSRF guard.** `page.route` (used by Ghostery) and the redirect guard's `page.on("response")` are independent. As `lib/ingest.ts` documents, `route` cannot see redirect hops, so the guard's design is unchanged. Filter-list downloads go to fixed hosts, not user-supplied URLs.
- **Measured, never faked.** Hiding an overlay removes nodes the user never meant to measure. Recording each hidden element keeps that honest. A capture still obstructed after mitigation becomes a refusal or a labeled warning, never a silent report.
- **Licenses.** Both libraries are MPL-2.0, which is fine to depend on. The uBO list is GPLv3. Downloading it at runtime is the safe default. Vendoring it into the repo needs a license check first.

## 7. Proposed follow-up issues

1. **Detect and report blocked navigations.** Check the response status and recognise challenge pages, then raise a typed error that the route and UI render. This is the first, second, and fourth acceptance criteria of #156. It is independent of the work below, and it is the highest-value fix, because today Distill presents challenge pages as designs.
2. **Obstruction detector and `CaptureAccess` shape.** Add `measureObstruction` with the two metric fixes from section 4, plus the capture, schema, and emit field, with no mitigation yet. This makes the problem visible before anything changes the page.
3. **Consent and filter-list layers.** Add autoconsent and the Ghostery engine, with list caching and serialization.
4. **Guarded generic clear plus per-tile re-checks.** Cover the panorama and dark passes. Ship it with the `/verify` fixture scenario, including the landmark-survival assertion.
5. **(Optional) Paywall annotation** from the JSON-LD `isAccessibleForFree` signal.

The order follows the dependencies. Item 2 measures the problem, so items 3 and 4 can each show a before and after on the same detector.

## Appendix: method notes

- The harness lived in a scratch directory with `playwright@1.61.1` (the project's pinned version), `@duckduckgo/autoconsent@16.47.0`, and `@ghostery/adblocker-playwright@2.18.2`. It did not touch the repo. The pipeline-impact check ran a temporary script from the project root, as AGENTS.md prescribes, and deleted it afterwards.
- `tsx` compiles with `keepNames`, which injects `__name(...)` calls into `page.evaluate` callbacks and makes them throw `ReferenceError: __name is not defined` in the page. The harness defined `globalThis.__name` first. Production code compiled by Next does not hit this, but any scratch or eval script that passes named inner functions to `page.evaluate` will.
- Downloading `fanboy-annoyance.txt` (2.1 MB) through Node's `fetch` inside `PlaywrightBlocker.fromLists` failed with `TypeError: terminated` on this network, while `curl` succeeded. Production code should fetch with retries or ship a cached copy, rather than call `fromLists` on the request path.
- Results depend on the tester's location (Finland, so GDPR banners show) and on the day. Consent managers and bot defenses change often.
