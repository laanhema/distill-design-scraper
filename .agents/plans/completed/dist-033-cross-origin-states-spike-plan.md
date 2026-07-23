# Plan: Cross-Origin States Capture (Spike)

## Summary

This is a time-boxed **spike**, not a feature build: the deliverable is a write-up at `.agents/reports/cross-origin-states-spike.md` plus disposable prototype code, **not** merged extraction/capture code. The investigation answers the question from issue #39 (DIST-033): the `:hover`/`:focus-visible` state capture in `styleDump.ts` reads declared deltas from the CSSOM, but cross-origin (CDN-hosted) stylesheets throw on `.cssRules` and are silently skipped (`lib/extract/styleDump.ts:401-409`), so `states.ts` comes back empty for most production sites. The spike prototypes ≥2 candidate strategies that survive cross-origin stylesheets — (A) fetching stylesheet text through the Playwright context and re-parsing it, (B) forcing pseudo-states via CDP and re-reading computed styles, (C, if time permits) CDP CSS-domain `getStyleSheetText` — assesses each against the "measured, never faked" invariant, capture-shape impact on `capture.json`, offline replayability for eval, and failure-degradation behavior, then closes with a recommendation and a rough implementation estimate. No `lib/`, `lib/schema.ts`, `lib/emit.ts`, or `eval/corpus/*` changes are in scope; those are deferred to a follow-up story if the recommendation is "go."

## User Story

As a builder wanting interaction-state tokens
I want a capture strategy that survives CDN-hosted stylesheets
So that `states.ts` doesn't come back empty for most production sites

## Metadata

| Field | Value |
|-------|-------|
| Type | SPIKE (research + prototype; no merged production code) |
| Complexity | MEDIUM (time-boxed 1–2 days) |
| Systems Affected | none merged — prototypes are scratch files; report lands under `.agents/reports/` |
| GitHub Issue | #39 (`[DIST-033] Spike: hover/focus state capture despite cross-origin CSSOM`) |

---

## Patterns to Follow

### The silently-skipped cross-origin scan (the problem being spiked)

```ts
// SOURCE: lib/extract/styleDump.ts:401-409
for (const sheet of document.styleSheets) {
  let rules: CSSRuleList | null;
  try {
    rules = sheet.cssRules;
  } catch {
    continue; // cross-origin stylesheet — can't be read, skip silently.
  }
  if (rules) scanRules(rules);
}
```
Any candidate strategy must preserve this "honest miss, never a wrong answer" posture while widening coverage. The existing same-origin pipeline (`applyRule` → `resolveVarRefs` → per-node `states` deltas, `lib/extract/styleDump.ts:294-399`) is the semantic baseline every candidate is compared against: **declared** deltas, attributed to interactive nodes already in the dump.

### The downstream consumer (what "empty for production sites" means)

```ts
// SOURCE: lib/extract/states.ts:91-92
if (entries.length === 0) return undefined;
return { provenance: "measured", entries };
```
When the CSSOM scan finds nothing (cross-origin skip), `buildStates` returns `undefined`, the `states` field is omitted from the report, and `renderStates` in `lib/emit.ts` never fires — an omitted field, not a fake one. Candidates must degrade to exactly this, not error and not fabricate.

### Capture-time vs. extract-time split (the load-bearing constraint)

```ts
// SOURCE: lib/analyze.ts:57-95 (extractFromCapture consumes capture.styleDump, browser-free)
// SOURCE: lib/ingest.ts:372 (captured = await capturePage(page) — the only place a live page exists)
```
`extractFromCapture` must stay browser-free and network-free (CLAUDE.md: "never make `extractFromCapture` reach for the network or an API key"). Therefore **every candidate must run at capture time** (inside/alongside `collectStyleDump` or as a cheap follow-up pass in `capturePage`, like `darkCapture`), baking results into `capture.json` — that is what keeps eval offline-replayable. A candidate requiring live page access at extract time is disqualified by construction.

### Cheap follow-up capture pass precedent (where a strategy would slot in)

```ts
// SOURCE: lib/ingest.ts:171-180 (dark-scheme pass)
await page.emulateMedia({ colorScheme: "dark" });
const styleDump = await collectStyleDump(page);
// ... best-effort; failure logs a warning and the field is simply absent
```
All passes are best-effort: a failure logs and the field is absent, which every consumer treats as "nothing observed". A cross-origin states pass must follow the same envelope.

### SSRF-guard bypass for local fixtures (how prototypes render synthetic pages)

```ts
// SOURCE: CLAUDE.md "Manually verifying extraction changes" + eval/capture.ts
// eval/capture.ts drives Playwright directly (chromium.launch + page.goto)
// rather than renderUrl, so the SSRF guard doesn't block localhost fixtures.
```
Scratch scripts run via `npx tsx` **from the project root** and are deleted after use.

### Prior spike deliverable shape (the house style for the write-up)

```
// SOURCE: .agents/reports/motion-spike.md
// Summary (with GO/NO-GO up top) → §1 measured-vs-inferred findings with
// prototype evidence → §2 proposed shape (documentation only) →
// §3 capture-shape answer → §4 recommendation + follow-up story table →
// Evidence artifacts (scratch files, deleted) → Deviations from plan
```
The DIST-033 write-up adapts this: per-candidate sections (approach / prototype evidence / trade-offs vs "measured, never faked" / capture-shape impact / offline replayability / failure behavior) → assessment matrix → recommendation + rough estimate.

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `.agents/reports/cross-origin-states-spike.md` | CREATE | The spike deliverable: candidate strategies with prototype evidence, trade-off assessment, recommendation + rough estimate |
| *(scratch, not committed)* `states-prototype.ts` + synthetic HTML fixture(s) | CREATE, then DELETE | Disposable prototypes proving out the candidate strategies against a two-origin local fixture before writing the report's evidence sections |

No files under `lib/`, `eval/corpus/`, `.agents/PRDs/`, or `.agents/stories/` are modified by this plan. Branch: `feature/dist-033-cross-origin-states-spike` (house style: `feature/dist-032-zero-width-border-color`, `feature/motion-transition-token-spike`).

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Build a two-origin synthetic fixture that reproduces the cross-origin skip

- **File**: scratch `states-fixture.mts` + inline HTML/CSS (project root working dir, per CLAUDE.md's manual-verification convention; delete after use)
- **Action**: CREATE, then DELETE
- **Implement**: Spin up **two** local `http.createServer` servers on different ports (different origins): server 1 serves an HTML page with an interactive button/link whose `:hover` and `:focus-visible` rules live in (a) an inline `<style>` block (same-origin control case) and (b) a `<link rel="stylesheet">` pointing at server 2 (the cross-origin case). Server 2 serves the CSS **without** CORS headers (`Access-Control-Allow-Origin` absent) so the browser treats it as an opaque cross-origin sheet. Render with Playwright driven directly (`chromium.launch` + `page.goto` — the `eval/capture.ts` pattern, bypassing the SSRF guard), then run the *existing* `collectStyleDump` against it.
- **Mirror**: `eval/capture.ts` (direct Playwright driving); `lib/extract/styleDump.ts:84-95` (`page.evaluate` harness + `__name` shim).
- **Validate**: `npx tsx states-fixture.mts` from the project root. Confirm the reproduction: the same-origin inline `:hover` rule **does** produce `states` on the button's `NodeStyle`, and the cross-origin-linked rule **does not** — this is the baseline failure the spike exists to fix, captured as report evidence.

### Task 2: Prototype Strategy A — fetch cross-origin stylesheets through Playwright and re-parse

- **File**: scratch `states-prototype-a.mts` (delete after use)
- **Action**: CREATE, then DELETE
- **Implement**: Against the Task-1 fixture, capture the cross-origin stylesheet **text** two ways and compare: (a1) `page.route("**/*.css", …)` interception registered before navigation, buffering response bodies; (a2) after load, enumerate `document.styleSheets` hrefs Node-side and re-fetch via `page.context().request.get(href)` (same browser context → same UA/cookies; public CDN CSS re-fetches cleanly). Then get the text back into a parseable CSSOM: inside `page.evaluate`, create a **detached same-origin document** (`document.implementation.createHTMLDocument`), insert a `<style>` element with the fetched text, and read its `.sheet.cssRules` — full spec-compliant parsing for free, with base-URL caveat noted (`url()`/`@import` inside the fetched CSS resolve relative to the *page*, not the original sheet — document the impact; for the states use-case only selector text + declaration values matter, so relative-URL breakage is irrelevant, but recursive `@import` would need one resolution pass or an honest skip). Feed the resulting rules through logic mirroring `applyRule`/`resolveVarRefs` (`lib/extract/styleDump.ts:294-399`).
- **Mirror**: `lib/extract/styleDump.ts:294-399` (STATE_PROPS, `resolveVarRefs`, `applyRule`, `scanRules` — the exact semantics to reproduce).
- **Validate**: `npx tsx states-prototype-a.mts`; confirm the cross-origin `:hover` delta now appears with identical from/to values as the same-origin control, and that an unfetchable sheet (make server 2 return 404 for one href) degrades to "no states from that sheet" with no throw.

### Task 3: Prototype Strategy B — force pseudo-state via CDP and re-read computed styles

- **File**: scratch `states-prototype-b.mts` (delete after use)
- **Action**: CREATE, then DELETE
- **Implement**: Against the Task-1 fixture, drive `page.context().newCDPSession(page)`: `DOM.enable` + `CSS.enable`, `DOM.getDocument` → `DOM.querySelectorAll` for the interactive elements (or reuse `DOM.resolveNode` from an `ElementHandle` via `elementHandle`… simplest: `DOM.performSearch`/query by tag+class), then `CSS.forcePseudoState({ nodeId, forcedPseudoClasses: ["hover"] })`, wait a tick, and `page.evaluate` a computed-style read of the STATE_PROPS channels (`lib/extract/styleDump.ts:294-299`) on the same element; diff against the base read taken before forcing. Repeat for `focus-visible` and for the same-origin control element. Note: this measures the **applied** style — real cascade, real `var()` resolution, includes cross-origin rules, JS-injected sheets, and shadow DOM — a *stronger* measurement than rule-text reads, but a different semantic (computed result vs. declared delta) whose consequences the report must discuss (e.g. it captures hover rules the current scanner's `STATE_PROPS` list doesn't name, and it can only sample elements actually present/interactive at capture time; per-element cost is one forced-style-recalc × 2 states × N interactive nodes — measure the wall-clock on the fixture).
- **Mirror**: `lib/ingest.ts:171-180` (the dark-scheme pass — analogous "temporarily change page state, re-read, restore" envelope); `lib/extract/styleDump.ts:294-299` (STATE_PROPS channel list for the diff).
- **Validate**: `npx tsx states-prototype-b.mts`; confirm (1) cross-origin hover delta captured as computed from/to, (2) values match the control, (3) after removing the forced state the element returns to base (no pollution of subsequent capture passes — ordering matters vs. the dark-scheme pass and screenshots; document it), (4) record rough per-element timing to size the production cost.

### Task 4: Prototype or desk-check Strategy C — CDP CSS-domain stylesheet text

- **File**: scratch `states-prototype-c.mts` (delete after use) — or fold into Task-2 script if cheap
- **Action**: CREATE, then DELETE
- **Implement**: `CSS.enable` **before** navigation, collect `CSS.styleSheetAdded` events, then `CSS.getStyleSheetText({ styleSheetId })` for each — the browser hands over text of every sheet including cross-origin ones, no re-fetch and no route interception. Assess against Strategy A: same parsing question as A (detached-document `<style>` trick applies identically), different acquisition cost (protocol chatter during load, one extra enable + N round-trips; must be enabled pre-navigation, which `capturePage` doesn't currently do). If the CDP event flow proves fiddly, a documented desk-check (API surface verified against Playwright 1.61.1's CDP session support + Chromium protocol docs) is acceptable for this Low-priority spike — say so in the report rather than over-investing.
- **Mirror**: Task 2's parsing half.
- **Validate**: `npx tsx` run or desk-check notes; either way the report records whether cross-origin sheet text was actually obtained.

### Task 5: Record rejected alternatives and the assessment matrix

- **File**: n/a (analysis, feeds the report)
- **Action**: n/a
- **Implement**: Document, with one paragraph each, why these were rejected without prototyping: (i) **real input simulation** (`page.hover()` / keyboard `Tab` focus) — genuine user-level measurement, but O(N) real mouse/keyboard events, `:focus-visible` via synthesized Tab is heuristic-flaky, off-viewport elements need scrolling (collides with the panorama pass's scroll bookkeeping), and hover-triggered JS menus mutate the DOM mid-capture — high cost, new failure modes, for marginal fidelity gain over B; (ii) **in-page `fetch()` of the stylesheet** — blocked by CORS exactly where it matters (opaque CDN sheets), strictly weaker than A's server-side/context re-fetch; (iii) **proxying/rewriting all CSS same-origin at render time** — a network-level transform (route interception fulfilling with re-fetched bodies under the page's origin) that changes what the *page itself* executes, risks breaking relative URLs/SRI/CSP, and perturbs every other capture lane — disproportionate blast radius for a states-only gap. Then build the assessment matrix: rows = A / B / C, columns = fidelity vs. "measured, never faked" (declared-delta vs. applied-measurement semantics), capture-shape impact on `capture.json`, offline replayability for eval, failure degradation (must be omitted fields), implementation cost.
- **Mirror**: `.agents/reports/motion-spike.md:60-64` ("Requires inference" — honest-boundary framing); CLAUDE.md's "only touch `eval/corpus/*/capture.json` when the capture shape itself changes" (the fixture-refresh axis).
- **Validate**: n/a — reviewed as part of the report.

### Task 6: Write `.agents/reports/cross-origin-states-spike.md`

- **File**: `.agents/reports/cross-origin-states-spike.md`
- **Action**: CREATE
- **Implement**: Structure per the issue's acceptance criteria exactly:
  1. **Summary** — the problem (cross-origin skip at `styleDump.ts:401-409`), reproduction evidence from Task 1, recommendation up top.
  2. **Candidate strategies** — one section each for A, B, C: approach, prototype evidence (inline JSON/timing snippets), trade-offs vs. "measured, never faked" (Task 5 matrix column 1 — A preserves the existing *declared-delta* semantics and current `states.ts` downstream unchanged; B upgrades to *applied* measurement with broader coverage but different semantics and per-element cost; C is A with cheaper acquisition but pre-navigation wiring), plus the rejected-alternatives paragraph from Task 5.
  3. **Per-candidate impact assessment** — for each: capture-shape impact on `capture.json` (does `StyleDump`/`NodeStyle.states` change shape, or is it same-shape-wider-coverage? — A/C keep the shape identical, so old fixtures replay fine and only a *coverage* refresh via `npm run eval:capture` is wanted; B likely keeps the shape too but must say whether the richer computed diff stays within the current `StateEntry.changes` schema), offline replayability (all run at capture time per the load-bearing constraint — confirm each), failure behavior (each must degrade to the current silent-skip → `states: undefined` outcome; evidence from Task 2's 404 case).
  4. **Recommendation + rough implementation estimate** — pick one (expected: A or B, decided by prototype evidence), with a follow-up story table sized per the `.agents/stories/` house style (capture change + any corpus refresh in one story per fixture policy; downstream `states.ts`/schema/emit changes only if semantics changed).
- **Mirror**: `.agents/reports/motion-spike.md` for tone/structure; `.agents/plans/completed/motion-transition-token-spike-plan.md` Task 6 for the acceptance-criteria-mapping discipline.
- **Validate**: Re-read against issue #39's three acceptance-criteria checkboxes one by one; every one must be answerable by pointing at a section of the report.

### Task 7: Delete scratch artifacts and confirm no repo pollution

- **File**: all scratch `.mts`/fixture files from Tasks 1–4
- **Action**: DELETE
- **Implement**: Remove the throwaway prototypes and fixtures; confirm via `git status` that the only change is `.agents/reports/cross-origin-states-spike.md` (plus the pre-existing untracked `.agents/temp/temp.txt`, which stays untracked and untouched).
- **Mirror**: `.agents/reports/motion-transition-token-spike-report.md:37` ("CREATE, then DELETE … deleted after validating findings, not committed").
- **Validate**: `git status` shows a clean, minimal diff.

---

## Validation

```bash
# Type check — run after any scratch .ts touches real imports, before deleting scratch
npm run typecheck

# Lint — eslint flat config exists on main (eslint.config.mjs); must pass
npm run lint

# Eval sanity check — this spike makes no lib/extract or lib/emit changes, so
# npm run eval must pass unchanged, proving no prototype code leaked into the
# committed extraction path.
npm run eval
```

## End-to-End Verification

The spike's end-to-end proof is the Task-1→Task-3 prototype chain run via `npx tsx` from the project root: (1) the two-origin fixture reproduces the empty-`states` failure with the *existing* `collectStyleDump`; (2) Strategy A's prototype recovers the cross-origin `:hover`/`:focus-visible` deltas with values identical to the same-origin control; (3) Strategy B's prototype recovers the same deltas via CDP-forced pseudo-states, leaves the page in its base state afterwards, and yields per-element timing; (4) the 404-sheet negative case degrades to omitted fields with no throw in every prototype. All four outcomes are reproduced inline as evidence in the report, scratch files deleted, and `git status` shows only `.agents/reports/cross-origin-states-spike.md`.

## Acceptance Criteria

- [ ] `.agents/reports/cross-origin-states-spike.md` created, answering all three bullets in issue #39's Acceptance Criteria section
- [ ] Report documents ≥2 candidate strategies (target: 3) with prototype evidence, including trade-offs against the "measured, never faked" invariant
- [ ] Each candidate is assessed on: `capture.json` capture-shape impact (fixture-refresh implications per CLAUDE.md), offline replayability for eval, and failure degradation to omitted fields
- [ ] Report ends with a recommendation and a rough implementation estimate (follow-up story breakdown) — no production code
- [ ] No changes to `lib/`, `lib/schema.ts`, `lib/emit.ts`, or `eval/corpus/*` (deferred to follow-up stories)
- [ ] All scratch prototype files deleted; `git status` shows only the report
- [ ] `npm run typecheck`, `npm run lint`, and `npm run eval` pass unchanged
