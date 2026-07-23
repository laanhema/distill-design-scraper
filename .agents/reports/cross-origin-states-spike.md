# Spike Report: Hover/Focus State Capture Despite Cross-Origin CSSOM

**Issue**: #39 (`[DIST-033] Spike: hover/focus state capture despite cross-origin CSSOM`)
**Plan**: `.agents/plans/completed/dist-033-cross-origin-states-spike-plan.md`
**Status**: Spike complete — no `lib/`, `eval/corpus/*`, or `lib/schema.ts` changes in scope or made.

## Summary

The failure mode is exactly as the issue describes, and reproduced cleanly: a `<link>`ed cross-origin stylesheet throws `SecurityError` on `.cssRules`, the scan at `lib/extract/styleDump.ts:401-409` skips it silently, and the affected nodes come back with `states` unset — so `states.ts:91` returns `undefined` and the lane is omitted from the report. All three candidate strategies survive the cross-origin boundary in prototype:

- **A — fetch the sheet through Playwright and re-parse** (both acquisition variants: route interception and `context.request` re-fetch) recovers the exact same declared deltas the same-origin path produces, with unchanged downstream semantics and unchanged capture shape.
- **B — CDP `CSS.forcePseudoState` + computed-style diff** captures the *applied* result (stronger measurement, broader coverage) at ~60 ms per element×state in prototype, with clean restoration of base state.
- **C — CDP CSS-domain `getStyleSheetText`** yields cross-origin sheet text straight from the browser's own parsed sheets, with the same re-parse semantics as A but pre-navigation protocol wiring.

**Recommendation: GO with Strategy A (variant a2, `context.request` re-fetch)** — it is the only candidate that widens coverage while leaving the "declared, never simulated" semantics, the `states.ts` aggregation, the schema, the emit path, and the `capture.json` shape all byte-identical. B is the stronger fallback if applied-measurement semantics are ever wanted deliberately; C is a viable acquisition alternative to A if re-fetching proves unreliable on real CDNs.

---

## 1. Reproduction of the cross-origin skip (baseline evidence)

Scratch fixture `states-fixture.mts` (deleted after use): two local `http.createServer` origins — page on `:4191` with an inline `<style>` (same-origin control button `.btn-same`) and a `<link rel="stylesheet">` to `:4192` serving CSS *without* CORS headers (cross-origin button `.btn-xo`), rendered via direct `chromium.launch`/`page.goto` per the `eval/capture.ts` SSRF-bypass pattern, then the **existing, unmodified** `collectStyleDump`:

```
stylesheets: [
  { "href": "(inline)",                          "rules": 3 },
  { "href": "http://127.0.0.1:4192/xo.css",      "rules": "THROWS: SecurityError" },
  { "href": "http://127.0.0.1:4192/missing.css", "rules": "THROWS: SecurityError" }
]
node .btn-same → states=[hover: bg rgb(220,220,220)→rgb(30,160,30), color …→rgb(255,255,255);
                          focus: border-color rgb(0,0,0)→rgb(200,30,30)]
node .btn-xo   → states=null        ← the production-site failure, reproduced
```

Same-origin rules produce declared deltas; cross-origin rules produce nothing. This is the baseline every candidate was measured against.

## 2. Candidate strategies

### Strategy A — fetch cross-origin stylesheets through Playwright and re-parse ✅ prototyped

**Approach.** Get the cross-origin sheet's *text* Node-side, then re-parse it in a **detached same-origin document** inside the live page (`document.implementation.createHTMLDocument("")` + `<style>` element → `.sheet.cssRules` — full spec-compliant parsing for free) and run the existing `applyRule`/`resolveVarRefs` semantics (`lib/extract/styleDump.ts:294-399`) against the live DOM. Two acquisition variants were prototyped (`states-prototype-a.mts`, deleted after use):

- **a1 — `page.route(<css glob>)` interception** registered before navigation: `route.fetch()` → buffer the body → `route.fulfill({ response })`. Captures every CSS response as it flies by, but requires pre-navigation wiring and touches *all* stylesheet traffic.
- **a2 — post-load re-fetch**: enumerate `document.styleSheets` hrefs, re-fetch each via `page.context().request.get(href)` — same browser context, so cookies/UA match and auth-gated CSS works. No pre-navigation wiring; fetches only what the page actually linked.

**Prototype evidence** — both variants recovered the cross-origin deltas with values identical to the declared CSS and to the same-origin control's shape:

```json
[a1 route interception]      → .btn-xo hover:  background-color rgb(200,200,200)→rgb(30,30,200),
                                             color rgb(10,10,10)→rgb(255,255,255);
                               .btn-xo focus:  border-color rgb(0,0,0)→rgb(200,30,30)
[a2 context.request re-fetch] → (byte-identical output)
(degraded: http://127.0.0.1:4192/missing.css → HTTP 404, skipped)   ← honest miss, no throw
```

**Trade-offs vs. "measured, never faked".** Semantics are *preserved*, not just approximated: the deltas are still declared rule text diffed against the element's computed base, exactly like the same-origin path — `states.ts`, the schema, and `renderStates` need zero changes. Two documented caveats, both honest-skip by design: (1) relative `url()`s inside fetched CSS would resolve against the *page's* base, not the sheet's — irrelevant for the four `STATE_PROPS` channels (`background-color`/`color`/`border-color`/`box-shadow`), which never carry URLs; (2) `@import` inside a fetched sheet is *not* followed (one resolution pass would be a follow-up refinement; today it's an honest skip, same posture as the JS-guarded `.is-hovering` miss `styleDump.ts:290-293` already documents). A production implementation must fetch **only the sheets that threw** on `.cssRules`, or same-origin linked sheets would be processed twice.

### Strategy B — force pseudo-state via CDP and re-read computed styles ✅ prototyped

**Approach.** `context.newCDPSession(page)` → `DOM.enable` + `CSS.enable` → `DOM.getDocument`/`DOM.querySelector` for each interactive element → `CSS.forcePseudoState({ nodeId, forcedPseudoClasses: ["hover"] })` → re-read the `STATE_PROPS` channels via `getComputedStyle` → diff against the pre-forcing base read → un-force (empty `forcedPseudoClasses`). Prototyped in `states-prototype-b.mts` (deleted after use).

**Prototype evidence** — cross-origin deltas captured as *applied* computed values, page provably restored afterwards:

```json
.btn-xo hover:         background-color rgb(200,200,200)→rgb(30,30,200), color rgb(10,10,10)→rgb(255,255,255)
.btn-xo focus-visible: border-color rgb(0,0,0)→rgb(200,30,30)
"restoredToBase": true            ← base == post-unforce read, both buttons
per (element × state) force+read+unforce: [63, 60, 59, 59] ms   ← incl. a fixed 50 ms settle wait
```

**Trade-offs vs. "measured, never faked".** This is a *stronger* measurement — real cascade, real `var()` resolution (no `resolveVarRefs` workaround needed), and coverage extends to cross-origin sheets, JS-injected `<style>`s, and shadow DOM for free; it also captures deltas on properties the current scanner's `STATE_PROPS` list doesn't name. But the semantics change from *declared delta* to *applied sample*: only elements present and interactive **at capture time** are sampled (per-element cost, ~10 ms + settle wait each; 50 interactive nodes × 2 states ≈ 6 s at the prototype's conservative 50 ms settle — reducible by batching reads and shortening the wait, but never free), and it adds an ordering constraint inside `capturePage` (must run after screenshots/panorama/dark passes, or provably restore — the prototype confirms restoration works). JS-guarded states (`mouseenter` handlers) remain honestly absent, matching the current posture.

### Strategy C — CDP CSS-domain stylesheet text ✅ prototyped

**Approach.** `DOM.enable` + `CSS.enable` **before navigation**, collect `CSS.styleSheetAdded` events, then `CSS.getStyleSheetText({ styleSheetId })` per sheet — the browser hands over the text of every sheet it parsed, including cross-origin ones; re-parse exactly as in Strategy A. Prototyped in `states-prototype-c.mts` (deleted after use).

**Prototype evidence:**

```
styleSheetAdded events: 2
--- http://127.0.0.1:4191/ (inline, 34 chars) ---        .btn-same { color: rgb(1, 2, 3); }
--- http://127.0.0.1:4192/xo.css (129 chars) ---         .btn-xo { … }  .btn-xo:hover { … }   ← full cross-origin text
```

Protocol gotcha found the hard way: `CSS.enable` fails with `DOM agent needs to be enabled first` unless `DOM.enable` precedes it.

**Trade-offs vs. "measured, never faked".** Identical declared-delta semantics to A (same re-parse step), with arguably better provenance — the text is what the *browser actually parsed*, not a second network fetch that could theoretically diverge. Costs: pre-navigation wiring inside `renderUrl`/`capturePage`, one protocol round-trip per sheet, and event-buffer management during load. No re-fetch means no cookie/auth/redirect divergence risk, but also no way to retry a sheet the browser itself failed to load.

### Rejected without prototyping (documented for completeness)

- **Real input simulation** (`page.hover()` / keyboard `Tab` focus): genuine user-level measurement, but O(N) real input events, `:focus-visible`-via-Tab is heuristic-flaky, off-viewport elements need scrolling (colliding with the panorama pass's scroll bookkeeping at `lib/ingest.ts:210-271`), and hover-triggered JS menus mutate the DOM mid-capture — high cost and new failure modes for marginal fidelity gain over B.
- **In-page `fetch()` of the stylesheet**: blocked by CORS exactly where it matters (opaque CDN sheets) — strictly weaker than A's Node-side/context re-fetch.
- **Proxying all CSS same-origin at render time** (route interception that re-serves cross-origin CSS under the page's origin): changes what the *page itself* executes — risks breaking relative URLs, SRI, and CSP, and perturbs every other capture lane. Disproportionate blast radius for a states-only gap.

## 3. Per-candidate impact assessment

| Axis | A — fetch + re-parse | B — CDP force pseudo-state | C — CDP `getStyleSheetText` |
|---|---|---|---|
| **Semantics** | Declared delta — *unchanged* from today | Applied sample — deliberately different, broader | Declared delta — unchanged |
| **`capture.json` shape** | Identical (`NodeStyle.states` same fields) → old fixtures replay fine; a *coverage* refresh (`npm run eval:capture`) is desirable but the fixture policy's "same shape" bar means no shape-driven refresh | Identical entry shape (from/to per property) → same as A | Identical → same as A |
| **Offline replayability for eval** | Full — runs at capture time, results baked into `capture.json`; `extractFromCapture` stays browser-free per the load-bearing CLAUDE.md constraint | Full — same capture-time placement (a follow-up pass in `capturePage`, mirroring the dark-scheme envelope at `lib/ingest.ts:171-180`) | Full — same |
| **Failure behavior** | Per-sheet skip → omitted fields (proven: 404 → silent skip, no throw) | Per-element try/catch → omitted fields; un-force in `finally` (restoration proven) | Per-sheet skip → omitted fields |
| **Implementation cost** | Small–Medium: one acquisition helper + reusing existing `applyRule`/`resolveVarRefs` logic; a2 needs no pre-navigation wiring | Medium: CDP session plumbing, per-element loop, capture-ordering constraints, settle-time tuning | Medium: pre-navigation protocol wiring + event buffer + same re-parse as A |

## 4. Recommendation + rough implementation estimate

**GO with Strategy A, variant a2 (`context.request` re-fetch).** It is the only candidate that closes the production-site gap while leaving the declared-delta semantics, `states.ts` aggregation, schema, emit path, and `capture.json` shape all untouched — the smallest possible delta from the code that already works for same-origin sheets, and the only option with zero downstream changes. C is the fallback if re-fetching proves unreliable against real CDNs (its acquisition is more faithful but more invasive to wire); B is the deliberate upgrade path if applied-measurement semantics are ever wanted (noted for the record, not recommended now — its per-element cost and capture-ordering constraints buy fidelity the `states` lane doesn't currently need).

### Follow-up story breakdown (sized per the `.agents/stories/` house style)

| Story | Scope | Complexity | Notes |
|---|---|---|---|
| **Cross-origin states capture** | In `collectStyleDump`'s states scan (or a thin follow-up pass in `capturePage`), collect hrefs of sheets that threw on `.cssRules`, re-fetch via `page.context().request.get`, re-parse via the detached-document `<style>` trick, feed through the existing `applyRule`/`resolveVarRefs` path. Per-sheet try/catch → silent skip. | Medium | Mostly self-contained in `styleDump.ts` + (if a follow-up pass) `ingest.ts`; acquisition must be Node-side, parsing in-page, so the split needs one small interface |
| **Corpus coverage refresh** | `npm run eval:capture` for the corpus, commit refreshed `capture.json`s so eval sites with cross-origin CSS populate `states` | Small | Same PR as the capture change, per fixture-policy precedent (DIST-004); capture *shape* is unchanged, so this is a coverage refresh, not a shape migration |
| **Verify against a live production site** | One manual `renderUrl` + `extractFromCapture` run against a CDN-CSS site (e.g. stripe.com) confirming `states` populates | Small | Fold into the capture story's verification, per the repo's scratch-script convention |

Total rough estimate: **~1–2 days**, one story plus its fixture refresh — comfortably inside the repo's "≤ ~2 days" sizing norm. No schema/emit/downstream stories required.

---

## Evidence artifacts

- `states-fixture.mts` — two-origin reproduction fixture (deleted after use)
- `states-prototype-a.mts` — Strategy A, both acquisition variants (deleted after use)
- `states-prototype-b.mts` — Strategy B, CDP force-pseudo-state (deleted after use)
- `states-prototype-c.mts` — Strategy C, CDP CSS-domain text (deleted after use)
- Raw prototype output is reproduced inline in §1–§2 above.

## Deviations from plan

None. All three issue-#39 acceptance-criteria bullets are answered above (§2 documents three candidate strategies with "measured, never faked" trade-offs plus rejected alternatives; §3 assesses each on `capture.json` shape impact, offline replayability, and failure degradation; §4 closes with a recommendation and a rough implementation estimate).
