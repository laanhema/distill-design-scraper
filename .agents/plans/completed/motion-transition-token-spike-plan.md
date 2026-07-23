# Plan: Motion/Transition Token Extraction (Spike)

## Summary

This is a time-boxed (1–2 day) **spike**, not a feature build: the deliverable is a write-up at `.agents/reports/motion-spike.md` plus disposable prototype code, **not** merged extraction/schema code. The investigation answers three questions from issue #6 — (1) what motion signal (`transition-*`/`animation-*` computed styles, CSSOM `@keyframes`) is actually *measurable* vs. requires inference, (2) whether it fits inside the existing single-walk `styleDump.ts` `page.evaluate` or needs a new capture field (⇒ corpus-refresh implications), and (3) a proposed schema shape following the repo's optional-lane contract — then closes with a go/no-go recommendation and follow-up story estimates. No `lib/schema.ts`, `lib/emit.ts`, or `eval/corpus/*` changes are in scope; those are explicitly deferred to a follow-up story if the recommendation is "go."

## User Story

As a maintainer
I want a time-boxed investigation into extracting motion tokens (transition durations, easings, keyframe animations)
So that we can decide whether a `motion` lane fits the "measured, never faked" contract before committing to it

## Metadata

| Field | Value |
|-------|-------|
| Type | SPIKE (research + prototype; no merged extraction code) |
| Complexity | MEDIUM (time-boxed 1–2 days) |
| Systems Affected | none merged — prototype only touches scratch files; report lands under `.agents/reports/` |
| GitHub Issue | #6 (`[DIST-005] Spike: motion/transition token extraction`) |

---

## Patterns to Follow

### The single-walk capture primitive (what any new harvest must slot into)

```ts
// SOURCE: lib/extract/styleDump.ts:84-95, 233
export async function collectStyleDump(page: Page): Promise<StyleDump> {
  // ... await page.evaluate(() => { /* __name shim */ });
  return page.evaluate((cap) => {
    // self-contained: no imports, only DOM APIs
    for (const el of all) {
      const cs = getComputedStyle(el);
      // ... existing color/layout/typography reads ...
      if (colors.length === 0 && !hasText && !hasLayout) continue; // ← record is skipped unless *some* signal fired
      nodes.push(record);
    }
  }, NODE_CAP);
}
```
The prototype's first question is whether `transitionProperty/Duration/TimingFunction` reads slot into this same per-node loop (cheap `getComputedStyle` calls, same walk) — per the issue's own technical note — or whether the `hasLayout`-style gate needs a `hasMotion` sibling so transition-only nodes (no color/layout signal) aren't silently dropped.

### CSSOM iteration for declared rules (the `:hover`/`:focus` precedent — `@keyframes` would follow the same shape)

```ts
// SOURCE: lib/extract/styleDump.ts:376-394
function scanRules(rules: CSSRuleList) {
  for (const rule of rules) {
    if (rule instanceof CSSMediaRule) { scanRules(rule.cssRules); continue; }
    if (rule instanceof CSSStyleRule) applyRule(rule);
  }
}
for (const sheet of document.styleSheets) {
  let rules: CSSRuleList | null;
  try { rules = sheet.cssRules; } catch { continue; } // cross-origin — skip silently
  if (rules) scanRules(rules);
}
```
`@keyframes` at-rules (`CSSKeyframesRule`) would need a parallel branch in `scanRules` — same cross-origin try/catch discipline, same "silent skip, never fabricate" posture.

### Deterministic modal aggregation (how a `motion` extractor would summarize per-element-class findings)

```ts
// SOURCE: lib/extract/tokens.ts:5-19, 147-175
function mode<T>(values: T[]): T { /* most frequent value, ties keep first-seen */ }

export function extractElevation(dump: StyleDump): Elevation {
  // ... rank by frequency, take top N, name by increasing magnitude ...
  return { provenance: "measured", shadows };
}
```
A motion extractor prototype should mirror this: frequency-rank observed durations/easings, take the modal value per element class — not every observed instance.

### Attribution to a palette/recipe target (the `states.ts` precedent for "who does this belong to")

```ts
// SOURCE: lib/extract/states.ts:38-93
export function buildStates(dump: StyleDump, palette: Palette): States | undefined {
  // buckets keyed by `${role}::${state}`, modal from/to per property
  if (entries.length === 0) return undefined; // no fake entries for sites with nothing observed
  return { provenance: "measured", entries };
}
```
Confirms the "return `undefined` when nothing was observed" contract the prototype must also honor — this is the mechanism that keeps `render*` functions in `lib/emit.ts` conditional (`if (report.states) …`).

### Optional-lane schema shape (what the *proposed* — not implemented — schema in the write-up should mirror)

```ts
// SOURCE: lib/schema.ts:176-197
export const stateEntrySchema = z.object({
  target: colorRoleSchema,
  state: z.enum(STATE_KINDS),
  changes: z.array(stateChangeSchema),
});
export const statesSchema = z.object({
  provenance: provenanceSchema,
  entries: z.array(stateEntrySchema),
});
```
Top-level field would be `optional()` on `reportSchema`, own `provenance`, and a `renderMotion` in `lib/emit.ts` gated `if (report.motion)` — per `lib/emit.ts:78-82`'s existing pattern for `states`/`elevation`. The write-up documents this shape; it does not add it to `lib/schema.ts`.

### Manual/scratch verification convention (how prototypes in this repo are built and discarded)

```
// SOURCE: .agents/reports/tablet-viewport-responsive-diff-report.md:31-38 (prior spike-adjacent precedent)
Built a throwaway synthetic fixture ... rendered via capturePage against a file:// URL
(bypasses the SSRF guard the same way eval/capture.ts does for local fixtures) ...
Scratch script and fixture HTML deleted after verification.
```
`CLAUDE.md`'s "Manually verifying extraction changes" section is the canonical instruction: synthetic `http.createServer` HTML, `npx tsx` from project root, delete scratch files after use.

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `.agents/reports/motion-spike.md` | CREATE | The spike deliverable: measurable-vs-inferred findings, capture-shape recommendation, proposed schema shape, go/no-go + follow-up estimates |
| *(scratch, not committed)* `/tmp/.../motion-prototype.ts` + synthetic HTML fixture | CREATE, then DELETE | Disposable prototype proving out the `page.evaluate` transition/`@keyframes` reads against real rendered pages before writing the report's evidence section |

No files under `lib/`, `eval/corpus/`, or `.agents/PRDs/` are modified by this plan — `PRD.md` §12 Phase 4's `[ ] Motion/transition token exploration (spike)` checkbox flip to `[x]` (spike delivered, not the feature) is a candidate one-line follow-up but is left for the implementer to decide alongside the report, matching how other spikes have landed.

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Inventory what CSS motion properties are actually computable per-node

- **File**: n/a (research)
- **Action**: n/a
- **Implement**: For a representative set of interactive elements (buttons, links, cards with hover transforms), enumerate what `getComputedStyle(el).transitionProperty/transitionDuration/transitionTimingFunction/transitionDelay` and `animationName/animationDuration/animationTimingFunction/animationIterationCount` actually return — including the shorthand-vs-longhand and multi-value-list (`transition: color .2s, background .3s`) parsing gotchas. Note whether values need the same `resolveVarRefs`-style `var()` resolution `styleDump.ts:300-316` already does for state deltas.
- **Mirror**: `lib/extract/styleDump.ts:206-224` (the existing per-node computed-style property reads) for the reading pattern; `lib/extract/styleDump.ts:300-316` (`resolveVarRefs`) for the var-resolution precedent.
- **Validate**: n/a — this is desk research; capture findings as bullet notes to fold into the report.

### Task 2: Prototype a `page.evaluate` motion harvest against synthetic fixtures

- **File**: scratch script + scratch HTML (project root working dir, per `CLAUDE.md`'s manual-verification convention; delete after use)
- **Action**: CREATE, then DELETE
- **Implement**: Spin up a local `http.createServer` HTML fixture with (a) a CSS transition on `:hover` (e.g. `transition: background-color .2s ease-in-out`), (b) a `@keyframes` animation applied via `animation: spin 1s linear infinite`, and (c) a JS-driven transition (class toggled by a script, not a CSS rule) as a deliberate negative case. Render with Playwright (`renderUrl`/`capturePage` per `lib/analyze.ts`, `file://` or local-server URL bypassing the SSRF guard the same way `eval/capture.ts` does), then evaluate a standalone snippet (not wired into `styleDump.ts`) that reads per-node transition properties and iterates `document.styleSheets` for `CSSKeyframesRule`s (parallel to `scanRules` at `lib/extract/styleDump.ts:376-394`, same cross-origin try/catch).
- **Mirror**: `lib/extract/styleDump.ts:84-95` (`page.evaluate` harness + `__name` shim), `lib/extract/styleDump.ts:376-394` (CSSOM rule iteration).
- **Validate**: Run via `npx tsx <script>` from the project root (required for `node_modules` resolution per `CLAUDE.md`). Confirm: (a) is captured as a measured per-node property, (b) is captured via keyframes CSSOM walk, (c) is honestly absent (no fabricated transition entry for the JS-driven case) — this (c) result is itself a key finding for the report's measured-vs-inferred section.

### Task 3: Prototype modal aggregation + palette/recipe attribution

- **File**: same scratch script as Task 2
- **Action**: UPDATE (scratch), then DELETE
- **Implement**: Feed the raw per-node motion observations from Task 2 through a throwaway aggregator mirroring `extractElevation`'s frequency-rank + modal-per-element-class approach, and check whether transition targets attribute cleanly to existing recipe element classes (Button/Card/etc. from `lib/extract/recipes.ts`) the same way `states.ts` attributes to palette roles — or whether motion needs its own grouping key (e.g. keyed by CSS selector/animation-name rather than color-role nearest-match, since there's no "nearest ΔE" analog for durations).
- **Mirror**: `lib/extract/tokens.ts:5-19,147-175` (`mode()` + `extractElevation`), `lib/extract/states.ts:38-93` (`buildStates` attribution + `undefined`-when-empty contract).
- **Validate**: `npx tsx <script>`; confirm the aggregator returns `undefined`/empty for a fixture with no motion (mirrors `states.ts:91`), and a sensible modal summary for the fixture with transitions/keyframes.

### Task 4: Answer the capture-shape question

- **File**: n/a (analysis, feeds directly into the report)
- **Action**: n/a
- **Implement**: Based on Tasks 1–3, determine definitively: does motion data fit inside the existing single `styleDump.ts` walk (new fields on `NodeStyle`, no second walk — load-bearing per `CLAUDE.md`), or does `@keyframes` enumeration need to live at the `StyleDump`-top-level (parallel to `nodes`/`totalVisible`/`truncated`) since keyframes aren't per-node? Either way this is a **capture-shape change** — state explicitly whether/how it should batch with #5 (DIST-004)'s eval-corpus refresh, per the issue's dependency note and `CLAUDE.md`'s "fixtures refreshed only when capture shape itself changes, in the same PR" policy.
- **Mirror**: `lib/extract/styleDump.ts:67-73` (`StyleDump` interface — where a new top-level `keyframes` field would sit) vs. `lib/extract/styleDump.ts:59-65` (`NodeStyle.states` — where per-node transition fields would sit).
- **Validate**: n/a — this is the report's central technical recommendation.

### Task 5: Draft the proposed schema shape (documentation only)

- **File**: n/a — content goes into the report, not `lib/schema.ts`
- **Action**: n/a
- **Implement**: Write a `motionSchema` sketch (Zod-shaped, following `statesSchema`'s exact contract: `provenance`, an `entries` array keyed by whatever Task 3 determined is the right attribution target) as a code block in the report. Note it is a *proposal*, explicitly not added to `lib/schema.ts` in this spike.
- **Mirror**: `lib/schema.ts:176-197` (`stateEntrySchema`/`statesSchema`).
- **Validate**: n/a — reviewed as part of the report, not compiled/typechecked (it's illustrative, not live code).

### Task 6: Write `.agents/reports/motion-spike.md`

- **File**: `.agents/reports/motion-spike.md`
- **Action**: CREATE
- **Implement**: Structure per the issue's acceptance criteria exactly:
  1. What's measurable vs. requires inference (Tasks 1–3 findings, with the JS-driven-transition negative case as concrete evidence of the "measured, never faked" boundary).
  2. Proposed schema shape (Task 5), stating it follows the optional-lane contract (optional field, own `provenance`, conditional `render*`, absence for motion-less sites).
  3. Capture-shape answer (Task 4): single-walk-compatible or new capture field, and the corpus-refresh/batching-with-#5 implication.
  4. Go/no-go recommendation with estimated follow-up story breakdown (e.g. "capture extension" / "aggregation + schema + emit" / "eval corpus refresh" as separate stories, sized the way existing `.agents/stories/` entries are sized — check that directory for the house style before estimating).
- **Mirror**: `.agents/reports/tablet-viewport-responsive-diff-report.md` for overall report tone/structure (Summary → findings → validation evidence → deviations), adapted since this report has no "Tasks Completed" implementation table — it's a findings write-up, not a change log.
- **Validate**: Re-read against the issue's four acceptance-criteria checkboxes one by one; every one must be answerable by pointing at a section of the report.

### Task 7: Delete scratch artifacts and confirm no repo pollution

- **File**: scratch script + fixture HTML from Tasks 2–3
- **Action**: DELETE
- **Implement**: Remove the throwaway prototype and fixture files; confirm via `git status` that only `.agents/reports/motion-spike.md` (and optionally the PRD checkbox, if the implementer chooses to flip it) appear as changes.
- **Mirror**: `.agents/reports/tablet-viewport-responsive-diff-report.md:38` ("Scratch script and fixture HTML deleted after verification").
- **Validate**: `git status` shows a clean, minimal diff.

---

## Validation

```bash
# Type check — only relevant if any scratch .ts touches real imports; run before deleting scratch files
npm run typecheck

# Lint — historically broken on main (interactive next lint wizard, no eslint config);
# do not treat lint failure as caused by this spike unless first reproduced as broken on main
npm run lint

# No eval run expected — this spike makes no lib/extract or lib/emit changes, so
# npm run eval should be unaffected. Run it once anyway as a sanity check that
# prototype scratch work never leaked into committed extraction code.
npm run eval
```

---

## Acceptance Criteria

- [ ] `.agents/reports/motion-spike.md` created, answering all four bullets in issue #6's Acceptance Criteria section
- [ ] Report cites concrete prototype evidence (code pointers or inline snippets) for the measured-vs-inferred boundary, not just assertions
- [ ] Report explicitly states whether motion fits the existing single-walk `StyleDump` or needs a new capture field, and the corpus-refresh implication
- [ ] Report includes a go/no-go recommendation with follow-up story estimates
- [ ] No changes to `lib/schema.ts`, `lib/emit.ts`, or `eval/corpus/*` (deferred to follow-up stories per go/no-go)
- [ ] All scratch prototype files deleted; `git status` shows only the report (and optionally a PRD checkbox flip)
- [ ] `npm run typecheck` and `npm run eval` pass unchanged
