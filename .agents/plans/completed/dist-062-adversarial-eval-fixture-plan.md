# Plan: DIST-062 — Adversarially-Shaped Eval Fixture

## Summary

Add a third committed eval fixture (`eval/fixtures/adversarial-shell.html`, corpus slug `adversarial-shell`, bucket `hostile`) whose DOM is deliberately shaped to defeat the structural proxies the extractors currently rely on: a root wrapper `<div>` with a sibling (a skip-link) so Stage 4b squash cannot flatten it away, pushing `<header>`/`<main>`/`<footer>` to depth 2; a `<div>`-based hero "section" instead of `<section>`; a `.btn` (Button recipe element) with a declared `transition` and a CSSOM `:hover` rule. Register it in `eval/corpus.ts` **without** `optional: true`, capture it via the existing `eval/capture.ts` (Playwright driven directly, not `renderUrl`, per its established pattern), hand-author `eval/corpus/adversarial-shell/expected.yaml` against the **post-DIST-063 correct** region/section names so the fixture knowingly scores below 1.00 on `main`, and commit that real score into `eval/baseline.json` via `UPDATE_BASELINE=1 npm run eval`. `forceHeuristicNaming` stays untouched. Advisory note from the issue: also set `viewport: VIEWPORT` in `eval/capture.ts`'s `Capture` literal (DIST-065/#127 hasn't landed on `main` yet) so this fixture isn't captured twice later — scoped narrowly so the two existing committed captures are not touched.

## User Story

As a maintainer
I want at least one eval fixture whose DOM violates the structure lane's positional shortcuts (tree depth, tag name)
So that heuristics gated on those shortcuts fail loudly in the regression gate instead of silently degrading on real sites — and so DIST-063's fix has something real to verify against.

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT (test/eval infrastructure) |
| Complexity | MEDIUM |
| Systems Affected | `eval/` harness only — no `lib/extract/**` changes |
| GitHub Issue | #124 (DIST-062) |

---

## Root-cause background (why this fixture shape scores <1.00 today)

Verified by reading `lib/extract/structure/{pruner,squash,ontology,regionMetrics,sections}.ts` against the PRD's §12 Phase 8 / P0-1 reproduction:

1. **`pruner.ts:58`** only collapses a wrapper when it has **exactly one child**. **`squash.ts:40`** only absorbs a generic layout container when the *parent* has **exactly one child**. So `<body>` → `<div id="app-root">` (wraps header/main/footer) survives intact only if `<body>` has a **second** child — e.g. a skip-link `<a>`. That's the adversarial trait: `<body>` ends up with `[skip-link, div#app-root]`, 2 children, so neither pruner-collapse nor squash can remove `div#app-root`, and `header`/`main`/`footer` land at **depth 2**, not depth 1.
2. **`ontology.ts:24`** gates region typing (`provisionalType = "region"`, and the `SiteHeader`/`MainContent`/`SiteFooter` name rewrite two lines below) on `depth <= 1`. At depth 2, header/main/footer never enter that branch — they fall through to `formatDefaultName`'s generic landmark fallback, `capitalize(node.landmark)` → **`Header`/`Main`/`Footer`** (verified against the PRD's own offline repro: `SiteHeader | Hero | CardGrid | SiteFooter` → `Header | Hero | CardGrid | Footer`).
3. **`regionMetrics.ts:40`** (Stage 8a) only rewrites `padY`/`h 100vh` on nodes whose `provisionalType === "region"` — so the same depth failure also drops all band-height annotations for header/main/footer.
4. **`sections.ts:findBand`** (`sections.ts:53-85`) is **not** depth-gated — it matches by `landmark`/`tagName` first, `componentName` only as a fallback — so Stage 9 still *finds* the right nodes for the digest, but reports their degraded `componentName` (`Header`/`Main`/`Footer`) as the digest entry's `name`. This is exactly what `eval/scoreStructure.ts`'s `sectionAccuracy` (ordinal name match, weight 0.5 of the structure sub-score) and `regionAccuracy` (regex-in-`skeletonAscii`, weight 0.2) will catch.
5. Separately, **`structureEmit.ts:217`** (`computeContentMaxWidth`) joins on `componentName === "MainContent" || tagName === "section"`. With `<main>` degraded to `Main` (trait 2 above) *and* the hero using `<div>` instead of `<section>` (this fixture's second required trait), **neither** disjunct holds — this is the P2-5 (#134) gap the issue references. `scoreStructure.ts` does not currently score `contentMaxWidth`, so this doesn't move the fixture's score; it just means the fixture's DOM shape is ready to catch a future P2-5 fix/regression once someone adds that assertion.
6. A `<button class="btn">` with a declared `transition` and CSSOM `.btn:hover` exercises `lib/extract/motion.ts` (`extractMotion`, gated on `classify(node)` from `lib/extract/recipes.ts` recognizing the node as a `Button`) and `lib/extract/states.ts` (`buildStates`) — neither committed fixture triggers either lane today (`CLAUDE.md`'s own note: "the two committed captures … contain no `motion`/`keyframes` at all").

None of this requires touching `lib/extract/**` — DIST-062 is fixture + harness registration only. DIST-063 (separate issue) will later flip `ontology.ts`'s gate from `depth <= 1` to a landmark-identity check, at which point this fixture's `expected.yaml` (already asserting the correct names) will make it score 1.00.

**Score-budget sanity check** (so the fixture clears `SITE_FLOOR = 0.7` in `eval/run.ts:29` even on unfixed `main`): `combinedScore` (`eval/score.ts:129`) weights `palette 0.5 / typography 0.3 / structure 0.2`. Palette/typography are unaffected by this bug (should score ~1.0 if the fixture's CSS values are copied faithfully into `expected.yaml`). Even a near-total structure-lane miss (`sectionAccuracy` ~0.5 from 2/4 bands wrong, `regionAccuracy` ~0.25 from 1/4 region words found, `componentCountAccuracy` ~1.0 since component counts aren't depth-gated) yields a structure sub-score around 0.55–0.65, i.e. `combined ≈ 0.5 + 0.3 + 0.2×0.6 ≈ 0.92` — comfortably inside `[0.7, 1.0)`. Treat this as a sanity estimate, not a value to hand-copy into `baseline.json`; the actual committed number must come from a real `npm run eval` run (see Task 8).

---

## Patterns to Follow

### Corpus registration
```ts
// SOURCE: eval/corpus.ts:31-32
{ slug: "clean-light", bucket: "clean-design-system", fixture: "clean-light.html" },
{ slug: "dark-mode", bucket: "dark-mode", fixture: "dark-mode.html" },
```
New entry follows the same shape, no `optional` key, `bucket: "hostile"` (already a valid `CorpusEntry["bucket"]` value, currently unused).

### Fixture HTML shape
```html
<!-- SOURCE: eval/fixtures/clean-light.html:52-104 (structure to diverge from) -->
<body>
  <header>...</header>
  <main>
    <section class="hero">...</section>
    <section class="grid">...repeated .card...</section>
  </main>
  <footer>...</footer>
</body>
```
This fixture instead nests everything one level deeper and swaps `<section class="hero">` for `<div class="hero">`:
```html
<body>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <div id="app-root">
    <header>...<nav>...4 links...</nav></header>
    <main id="main-content">
      <div class="hero">...h1/h2/p/2 buttons...</div>
      <div class="grid">...repeated .card ×N...</div>
    </main>
    <footer>...</footer>
  </div>
</body>
```
`<a class="skip-link">` survives `pruneAndCollapse` unconditionally because `isInteractiveElement` (`lib/extract/structure/harvester.ts:28-36`) marks every `<a>` interactive regardless of visibility styling, so it's never dropped as a "meaningless" 0-child leaf (`pruner.ts:68-76`) and it guarantees `<body>` has 2 children so neither `pruner.ts:58`'s collapse nor `squash.ts:40`'s absorb can fire on `div#app-root`.

### Button transition + hover (recipe-element motion/states)
```css
/* SOURCE: eval/fixtures/clean-light.html:44-51 (.btn, no transition/hover today) */
.btn {
  background: var(--primary);
  color: #ffffff;
  border: none;
  border-radius: 8px;
  padding: 12px 20px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 150ms ease;
}
.btn:hover {
  background: #5b21b6; /* darker shade of --primary, exact hex not load-bearing */
}
```
`classify()` (`lib/extract/recipes.ts:34-55`) maps `<button>` → `"Button"` regardless of its CSS class name, so `extractMotion` (`lib/extract/motion.ts:11-74`) and `buildStates` (`lib/extract/states.ts:38-93`) both pick this up as long as the style dump sees the declared `transition-*` computed properties and a `:hover` CSSOM rule targeting `.btn`.

### Expected.yaml shape
```yaml
# SOURCE: eval/corpus/clean-light/expected.yaml (full file)
name: clean-light
bucket: clean-design-system
palette: { background: "#ffffff", surface: "#f4f6f8", ... }
typography: { bodyFamily: "Inter", scale: { h1: 48, h2: 32, h3: 24, body: 16, small: 13 } }
structure:
  expectedSections:
    - { name: SiteHeader }
    - { name: Hero }
    - { name: CardGrid }
    - { name: SiteFooter }
  expectedRegions: [SiteHeader, MainContent, CardGrid, SiteFooter]
  expectedComponents:
    SectionCard: { count: 6 }
    TextLink: { count: 4 }
    Button: { count: 2 }
```
New fixture's `structure.expectedSections`/`expectedRegions` assert **`SiteHeader`/`MainContent`/`SiteFooter`** (the post-DIST-063 correct names) — deliberately NOT what `main` currently emits (`Header`/`Main`/`Footer`) for those three entries. `Hero`/`CardGrid`(or `GridSection`) and the component counts are **not** depth-gated (see root-cause note above) — assert whatever the actual captured/extracted output shows for those (get the real values from Task 5/6, don't guess).

### `.gitignore` fixture allowlist
```gitignore
# SOURCE: .gitignore:28-32
/eval/corpus/*/capture.json
!/eval/corpus/clean-light/capture.json
!/eval/corpus/dark-mode/capture.json
```
Needs a third `!` line for the new slug or `git add` will silently skip the committed capture.

### Capture-time viewport (advisory, DIST-065/#127 — confirmed NOT merged on `main`)
```ts
// SOURCE: eval/capture.ts:19,45-59 — VIEWPORT is defined and passed to the
// Playwright context, but the Capture object literal never sets `viewport`.
const VIEWPORT = { width: 1440, height: 900 };
...
const capture: Capture = {
  source: { ... },
  finalUrl: page.url(),
  title: await page.title(),
  styleDump: captured.styleDump,
  viewportShot: captured.viewportShot,
  rawHarvestNode: captured.rawHarvestNode,
  responsiveHarvests: captured.responsiveHarvests,
  darkCapture: captured.darkCapture,
  scrollShots: captured.scrollShots,
  panoramaShot: captured.panoramaShot,
  // ADD: viewport: VIEWPORT,
};
```
`Capture.viewport` (`lib/analyze.ts:32`) is optional and already consumed by `extractStructureFromCapture`/`extractStructure` (`lib/extract/structure/index.ts:44,56,70`) with a `{1440,900}` fallback that happens to equal `VIEWPORT` today — so adding this line is behavior-neutral for the *existing* two fixtures (whose `capture.json` files are only rewritten if someone explicitly reruns `eval:capture` for them, which this plan does not do) and gives the *new* fixture's committed capture a real `viewport` key going forward.

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `eval/fixtures/adversarial-shell.html` | CREATE | The adversarially-shaped synthetic page |
| `eval/capture.ts` | UPDATE (small, advisory) | Add `viewport: VIEWPORT` to the `Capture` literal so the new fixture's capture carries it (DIST-065 advisory) |
| `eval/corpus.ts` | UPDATE | Register the new corpus entry (`bucket: "hostile"`, no `optional`) |
| `.gitignore` | UPDATE | Add `!/eval/corpus/adversarial-shell/capture.json` negation |
| `eval/corpus/adversarial-shell/capture.json` | CREATE (generated) | Produced by `npm run eval:capture -- adversarial-shell`, then committed |
| `eval/corpus/adversarial-shell/expected.yaml` | CREATE (hand-authored) | Ground truth, asserting post-fix region/section names |
| `eval/baseline.json` | UPDATE (generated) | Refreshed via `UPDATE_BASELINE=1 npm run eval` — adds the new slug's real (sub-1.00) score |

No changes to `lib/extract/**`, `lib/analyze.ts`, or any `.tsx` files — this is fixture + harness registration only.

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Author the fixture HTML

- **File**: `eval/fixtures/adversarial-shell.html`
- **Action**: CREATE
- **Implement**: A self-contained HTML page (inline `<style>`, no external assets — same convention as the other two fixtures) with:
  - `<body>` containing exactly two children: `<a class="skip-link" href="#main-content">Skip to content</a>` and `<div id="app-root">…</div>` (the sibling requirement — root wrapper survives Stage 4b squash).
  - Inside `div#app-root`: `<header>` (with a `<nav>` of 4 `<a>` links), `<main id="main-content">`, `<footer>` — landmarks land at depth 2, below `ontology.ts`'s `depth <= 1` gate.
  - Inside `<main>`: a `<div class="hero">` (h1 + h2 + p + 2 `<button class="btn">`s) — the required `<div>`-based section (no `<section>` tag anywhere the hero would normally use one) — followed by a `<div class="grid">` wrapping N (suggest 4) repeated `<div class="card">` blocks (h3 + p + small each), mirroring `clean-light`'s card-grid shape closely enough that `isCardGrid`/`isCardWorthy` (`ontology.ts:136-139,186-193`) still fire.
  - `.btn` carries `transition: background-color 150ms ease;` and a same-document `.btn:hover { background: <darker-shade>; }` rule in the inline `<style>` block (same-origin CSSOM, no cross-origin refetch needed).
  - A distinct, hand-pickable palette/typography (e.g. background `#ffffff`, surface `#f2f4f7`, text `#12141c`, primary `#6d28d9`, border `#d8dce3`, muted `#6b7280`; a `body { font-family: "Sora", system-ui, sans-serif; font-size: 16px; }` stack; `h1`/`h2`/`h3` sizes of your choosing) — record the exact values used, they go verbatim into `expected.yaml`.
- **Mirror**: `eval/fixtures/clean-light.html` (full file) for CSS-variable/style conventions; `eval/fixtures/dark-mode.html` for a second reference point.
- **Validate**: file parses as valid HTML (no build step needed yet); visually diff the DOM shape against the "Patterns to Follow" skeleton above before moving on.

### Task 2: (Advisory) Populate `Capture.viewport` in `eval/capture.ts`

- **File**: `eval/capture.ts`
- **Action**: UPDATE
- **Implement**: Add `viewport: VIEWPORT,` as a field in the `Capture` object literal inside `captureEntry` (around line 45-59), sourced from the same `VIEWPORT` constant already passed to `browser.newContext`. Do **not** rerun `eval:capture` for `clean-light`/`dark-mode` — this task only changes code, not their committed JSON.
- **Mirror**: `eval/capture.ts:19` (`const VIEWPORT = …`) — one source, no second literal, per the DIST-065 issue text.
- **Validate**: `npm run typecheck` (Capture.viewport is optional in `lib/analyze.ts:32`, so this is additive).
- **Note**: This is the issue's advisory ("land viewport in the same capture literal if that hasn't merged"), confirmed not yet merged (`gh issue view 127` shows `DIST-065` still `OPEN`). If it lands from elsewhere before this PR merges, skip this task — check `eval/capture.ts` for a pre-existing `viewport: VIEWPORT,` line first.

### Task 3: Register the corpus entry

- **File**: `eval/corpus.ts`
- **Action**: UPDATE
- **Implement**: Add `{ slug: "adversarial-shell", bucket: "hostile", fixture: "adversarial-shell.html" }` to the `CORPUS` array, alongside (not replacing) the two existing fixture entries. No `optional` key.
- **Mirror**: `eval/corpus.ts:31-32`
- **Validate**: `npm run typecheck`

### Task 4: Allow the new capture into git

- **File**: `.gitignore`
- **Action**: UPDATE
- **Implement**: Add `!/eval/corpus/adversarial-shell/capture.json` after the existing two negation lines (`.gitignore:28-32`).
- **Validate**: `git status` after Task 5 shows the new `capture.json` as addable, not ignored.

### Task 5: Capture the fixture

- **File**: `eval/corpus/adversarial-shell/capture.json` (generated)
- **Action**: CREATE (via script, not by hand)
- **Implement**: Run `npm run eval:capture -- adversarial-shell` from the project root. This drives Playwright directly against the local fixture file (per `eval/capture.ts`'s existing SSRF-guard-avoidance pattern — do **not** route through `renderUrl`), producing `eval/corpus/adversarial-shell/capture.json`.
- **Validate**: File exists; `styleDump.nodes.length` printed by the script is nonzero; spot-check with `node -e "console.log(Object.keys(require('./eval/corpus/adversarial-shell/capture.json')))"` — should include `rawHarvestNode`, `styleDump`, and (if Task 2 was done) `viewport`.

### Task 6: Inspect actual extraction output before writing `expected.yaml`

- **File**: none (scratch inspection only — do not commit a scratch script)
- **Action**: n/a
- **Implement**: Write a throwaway `tsx` script (per `CLAUDE.md`'s "Manually verifying extraction changes" pattern) that loads `eval/corpus/adversarial-shell/capture.json`, calls `extractFromCapture` and `extractStructureFromCapture(capture, undefined, { forceHeuristicNaming: true })` (mirroring `eval/run.ts:52-67`), and prints: `report.palette`, `report.typography.scale`, whether `report.motion` and `report.states` are populated, `structReport.skeletonAscii`, and `structReport.machineBlock.sections`/`.components`. Use this to get the **real** Hero/CardGrid naming and Button/TextLink/SectionCard counts (these are *not* depth-gated, so don't hand-guess them) and to confirm `Header`/`Main`/`Footer` (not `SiteHeader`/`MainContent`/`SiteFooter`) actually appear today, confirming the bug reproduces in this fixture. Delete the script when done.
- **Validate**: Printed output shows `motion.entries` containing a `Button` transition entry and `states.entries` containing a `Button`/`hover` entry (closing the "no fixture exercises motion/states" gap named in the issue); skeleton shows landmarks two levels deep.

### Task 7: Author `expected.yaml`

- **File**: `eval/corpus/adversarial-shell/expected.yaml`
- **Action**: CREATE
- **Implement**: `name: adversarial-shell`, `bucket: hostile`, `palette`/`typography` copied verbatim from the fixture's CSS (Task 1). `structure.expectedSections`/`expectedRegions` assert `SiteHeader`/`MainContent`/`SiteFooter` (the correct, post-fix names) plus whatever the real `Hero`/`CardGrid` (or `GridSection`) names are per Task 6. `structure.expectedComponents` uses the real observed counts from Task 6 (±1 tolerance is built into `scoreStructure.ts:124`, so exact-to-the-node precision isn't required, but don't fabricate numbers).
- **Mirror**: `eval/corpus/clean-light/expected.yaml` (full file)
- **Validate**: `npm run typecheck` isn't relevant here (YAML), but re-run the Task 6 script and eyeball that palette/typography values ΔE-match (they're compared perceptually, not by exact hex, per `eval/score.ts:12`).

### Task 8: Run the eval harness and confirm the expected shape

- **File**: none
- **Action**: n/a (verification)
- **Implement**: Run `npm run eval` (no `UPDATE_BASELINE`). Confirm in the console output:
  - `adversarial-shell` is scored (not skipped/missing).
  - Its `combined` score is strictly below 100% and at/above the 70% floor (`SITE_FLOOR` in `eval/run.ts:29`) — if it's below floor, the fixture's palette/typography values in `expected.yaml` likely don't match the CSS closely enough; if it's exactly 100%, the adversarial DOM shape didn't actually trigger the depth bug (re-check Task 1 against the root-cause section above).
  - `clean-light` and `dark-mode` are unaffected (still ~100%, no regression against the *current* `baseline.json`, which doesn't yet contain the new slug so no regression check applies to it).
  - The printed `structure: …` notes list mismatches for the header/main/footer band names specifically (evidence the depth bug is what's being caught, not something else).
- **Validate**: exit code 0 (all gates pass) — the new fixture not yet being in `baseline.json` means gate 2 (regression) doesn't apply to it yet; gate 1 (floor) must still pass.

### Task 9: Commit the new baseline

- **File**: `eval/baseline.json`
- **Action**: UPDATE (generated)
- **Implement**: Run `UPDATE_BASELINE=1 npm run eval`. This rewrites `eval/baseline.json` with all three sites' real scores — `clean-light`/`dark-mode` should stay `1` (unchanged fixtures), `adversarial-shell` gets committed at its real sub-1.00 score from Task 8.
- **Mirror**: `CLAUDE.md`'s eval workflow ("Only then, refresh the baseline deliberately: `UPDATE_BASELINE=1 npm run eval`")
- **Validate**: `git diff eval/baseline.json` shows `clean-light: 1`/`dark-mode: 1` unchanged and a new `adversarial-shell` key with a value `< 1`.

### Task 10: Final gate + cleanup

- **File**: n/a
- **Action**: n/a
- **Implement**: Run `npm run typecheck`, `npm run lint`, `npm run eval` (plain, no `UPDATE_BASELINE`) one more time — should now pass cleanly with the committed baseline. Delete the Task 6 scratch script if it wasn't already removed. Confirm `git status` shows exactly: new fixture HTML, corpus registration, `.gitignore` line, new `capture.json` + `expected.yaml`, updated `baseline.json`, and (if Task 2 applied) the one-line `eval/capture.ts` diff — nothing else.
- **Validate**: `npm run typecheck && npm run lint && npm run eval`

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Eval (offline, no network/API key — must pass with the committed baseline)
npm run eval
```

## End-to-End Verification

1. `npm run eval:capture -- adversarial-shell` succeeds offline (no network — the fixture is a local file loaded via Playwright directly, same as the other two).
2. `npm run eval` (plain) shows a per-site line for `adversarial-shell` with `combined` strictly between the 70% floor and 100%, and `structure:` notes naming the header/main/footer mismatches.
3. `UPDATE_BASELINE=1 npm run eval` writes a 3-entry `eval/baseline.json`.
4. `npm run eval` (plain, post-baseline-commit) exits 0 — all three sites at/above their committed baseline, `adversarial-shell` not below the 0.7 floor.
5. `npm run typecheck && npm run lint` both pass.
6. Re-inspect the Task 6 script's output (before deleting it) to confirm `report.motion.entries` and `report.states.entries` are both non-empty — the two Phase-6 lanes this fixture is meant to close the "no fixture exercises this" gap for.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Fixture accidentally scores exactly 1.00 (DOM shape doesn't actually trigger the depth bug — e.g. squash/pruner collapse the wrapper anyway) | Task 6's scratch inspection against real `extractStructureFromCapture` output *before* writing `expected.yaml`, checked against the root-cause section's depth-2 prediction; if it's 1.00, the sibling isn't surviving harvest/pruning (double-check the skip-link has nonzero bounds and isn't `display:none`) |
| Fixture scores below the 0.7 `SITE_FLOOR`, failing CI outright even after the baseline is committed | Palette/typography must be copied exactly from the fixture's own CSS into `expected.yaml`; per the score-budget sanity check above, palette+typography alone contribute 0.8 of the combined score if accurate, leaving headroom even at structure ≈ 0 |
| Hand-computed `Hero`/`CardGrid` names or component counts in `expected.yaml` don't match real output for reasons unrelated to the depth bug (e.g. card count off-by-one, wrong grid-column count changing `CardGrid` vs `GridSection` naming) | Task 6 requires inspecting real extraction output before authoring `expected.yaml` — never hand-guess these; `scoreStructure.ts`'s ±1 instance tolerance absorbs minor slack but not a wrong name |
| `div#app-root` (the wrapper) itself gets mislabeled `Hero` by `isHeroSection`'s recursive `containsTag` search (it contains an `h1` near the top, same as the PRD's own repro notes) | Cosmetic only — `sections.ts:findBand` finds the real header/main/footer by landmark/tag, not by walking through the wrapper's own name, so this doesn't affect `sectionAccuracy`/`regionAccuracy`. Documented here so a future reader isn't confused by an extra "Hero" line in `skeletonAscii`; out of scope to "fix" in this story |
| Committing `eval/capture.ts`'s `viewport: VIEWPORT` line accidentally changes the two existing committed fixtures | The line only affects captures written by a *future run* of `eval:capture` for a given slug; this plan never reruns capture for `clean-light`/`dark-mode`, so their committed `capture.json` files are untouched. If DIST-065 lands independently first, Task 2 becomes a no-op (skip it) |
| `npm run eval:capture -- adversarial-shell` picks up stray CORPUS entries or clobbers other fixtures | `selectEntries` (`eval/capture.ts:67-76`) filters by the named slug when args are passed — verified by reading the function; only the new entry's directory is written |
| DIST-063 (the actual fix) is out of scope but a future implementer might be tempted to "fix" `ontology.ts` here to make the score hit 1.00 | Explicitly out of scope — the issue and its comment both require the fixture to fail on `main` at `d619f19`/current HEAD and pass only once DIST-063 lands; do not modify `lib/extract/**` in this story |

---

## Acceptance Criteria

- [ ] `eval/fixtures/adversarial-shell.html` exists with all five required DOM traits: root wrapper `<div>` with a sibling; a `<div>`-based page section (no `<section>`); a landmark nested below depth 1; a declared `transition` on a `Button`-classified element; a CSSOM `:hover` rule.
- [ ] `eval/corpus.ts` registers `adversarial-shell` without `optional: true`.
- [ ] `eval/corpus/adversarial-shell/capture.json` is committed (produced by `npm run eval:capture -- adversarial-shell`, driven directly through Playwright per the existing pattern, not `renderUrl`).
- [ ] `.gitignore` allows the new `capture.json` through.
- [ ] `eval/corpus/adversarial-shell/expected.yaml` asserts `SiteHeader`/`MainContent`/`SiteFooter` (post-fix correct names) and real (Task-6-verified) band/section/component values.
- [ ] `npm run eval` scores the fixture on both palette/typography and structure lanes, fully offline, with `forceHeuristicNaming` untouched.
- [ ] The fixture's committed score in `eval/baseline.json` is below 1.00 and at/above 0.7, and `clean-light`/`dark-mode` remain at 1.
- [ ] `report.motion` and `report.states` are confirmed populated for this fixture (verified in Task 6, not separately scored).
- [ ] `npm run typecheck`, `npm run lint`, `npm run eval` all pass on the final tree.
- [ ] No scratch verification scripts left in the repo.
