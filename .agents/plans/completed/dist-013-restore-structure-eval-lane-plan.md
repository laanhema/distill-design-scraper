# Plan: DIST-013 — Restore the Structure Lane to the Eval Harness

## Summary

Make `npm run eval` actually exercise and score the structure lane offline. Four
layered fixes: (1) `eval/capture.ts` copies `rawHarvestNode` into the committed
`capture.json`; (2) the AI labeller is forced to its heuristic fallback on the
eval path (no network even when `ANTHROPIC_API_KEY` is set, including
DIST-030's `sectionDescriptions`); (3) `scoreStructure` scores a real
`expected` spec instead of a constant 1.0, with the **ordered `sections`
digest (DIST-028) as the primary signal** and skeleton-region presence +
component counts as secondary; (4) the structure score is folded into the
site `combined` score so it actually feeds the gate. Hand-authored expected
structure specs are written against the post-reshape output, and the baseline
is refreshed deliberately via `UPDATE_BASELINE=1`.

One prerequisite the issue didn't name but the post-reshape code makes
necessary: **neither committed fixture has a `<main>` landmark**, so
`findDigestBands` (`lib/extract/structure/sections.ts:191-202`) returns `[]`
and the `sections` digest is currently **omitted** for both corpus sites —
defeating the issue's primary scoring target. Verified empirically by running
the structure pipeline on both fixtures (AI forced off): `has sections: false`
for both. Wrapping each fixture's hero+grid in `<main>` (verified with a
throwaway temp fixture) makes `sections` emit a clean 4-band digest
`[SiteHeader, Hero, CardGrid, SiteFooter]` with zero palette/typography
impact. This plan includes that minimal fixture change; the alternative
(score skeleton+components only) leaves the primary target untested.

## User Story

As a maintainer
I want `npm run eval` to exercise and score the structure lane offline against hand-authored expected specs
So that structure-extraction regressions are caught by the gate instead of silently scoring a constant 1.0 on a lane that never runs

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | HIGH |
| Systems Affected | eval harness (`eval/`), structure lane AI-off switch (`lib/analyze.ts`, `lib/extract/structure/`), eval corpus fixtures + expected specs |
| GitHub Issue | #19 ([DIST-013]) |
| Review ref | C1 (`.agents/temp/codebase-review-fable-2026-07-23.md:124-139`) |

---

## Patterns to Follow

### Capture shape — copy every `capturePage` artifact into the `Capture` literal

```
// SOURCE: lib/analyze.ts:283-300 — captureFromRender copies rawHarvestNode straight through
export function captureFromRender(render: RenderResult, ref, capturedAt): Capture {
  return {
    source: { type: "url", ref, capturedAt },
    finalUrl: render.finalUrl,
    title: render.title,
    styleDump: render.styleDump,
    viewportShot: render.viewportShot,
    rawHarvestNode: render.rawHarvestNode,   // <-- eval/capture.ts drops this line
    responsiveHarvests: render.responsiveHarvests,
    ...
  };
}
```
`eval/capture.ts:44-58` builds the same literal but omits `rawHarvestNode`,
even though `captured` (from `capturePage`) carries it (`lib/ingest.ts:311-316,
331`). Confirmed: both committed `capture.json` files lack the top-level key
(the `rawHarvestNode` grep hits are inside `responsiveHarvests` only).

### Expected-spec shape — optional `expected.yaml` blocks loaded by the runner

```
// SOURCE: eval/score.ts:13-21 — ExpectedSpec (palette + typography today)
export interface ExpectedSpec {
  name: string;
  bucket: string;
  palette: Record<string, string>;
  typography?: { bodyFamily?: string; scale?: Record<string, number> };
}

// SOURCE: eval/scoreStructure.ts:3-6 — ExpectedStructureSpec (extend this)
export interface ExpectedStructureSpec {
  expectedRegions?: string[];
  expectedComponents?: Record<string, { count?: number; type?: string }>;
}
```

### AI-lane availability is one chokepoint — force heuristic *before* it

```
// SOURCE: lib/extract/structure/structureAI.ts:147-152
export async function runStructureAILabeller(root: PrunedNode): Promise<StructureAIResult> {
  const fallback = buildFallbackComponentMap(root);
  if (!aiLaneAvailable()) {
    return { root, components: fallback, naming: "heuristic" };
  }
  const client = new Anthropic();   // <-- network happens here; eval must never reach it
  ...
```
The eval path must short-circuit **before** `aiLaneAvailable()` so the
`Anthropic` client is never constructed. This also suppresses DIST-030's
`sectionDescriptions` (only produced on the AI path, `structureAI.ts:190-199`).

### Options threading into the structure pipeline (existing pattern)

```
// SOURCE: lib/extract/structure/index.ts:17-27, 56-68 — ExtractStructureOptions + rawHarvestNode replay
export interface ExtractStructureOptions {
  sourceUrl: string;
  capturedAt?: string;
  viewport?: { width: number; height: number };
  rawHarvestNode?: RawHarvestNode;   // <-- "For offline replay in eval harness"
  dump?: StyleDump;
  report?: Report;
  responsiveHarvests?: ResponsiveHarvest[];
}
```
A new optional flag rides this same options object; the live callers
(`analyzeUrlStructure`, `app/api/analyze/route.ts:197`) pass nothing → default
behaviour unchanged.

### Combined-score weighting (extend to include structure)

```
// SOURCE: eval/score.ts:119-126
export function combinedScore(palette: PaletteScore, typography: TypographyScore | null): number {
  if (!typography) return palette.roleAccuracy;
  return palette.roleAccuracy * 0.6 + typography.scaleAccuracy * 0.4;
}
```
Today `structureScore` is computed (`eval/run.ts:57-66`) but never enters
`combined` (`eval/run.ts:55`), so structure cannot move the gate. Extend
`combinedScore` to take an optional structure score and re-weight when present.

### Section digest requires a `main` band

```
// SOURCE: lib/extract/structure/sections.ts:191-202
export function findDigestBands(root: PrunedNode): PrunedNode[] {
  const main = findBand(root, "main");   // landmark === "main" || tagName === "main"
  if (!main) return [];                   // <-- no <main> → no digest → sections omitted
  ...
}
```
`findBand("main")` (`sections.ts:53-85`) matches `landmark === "main"` or
`tagName === "main"` only. `<section>` yields `landmark: "section"`, so the
fixtures' hero/grid are never the main band. This is the documented
"omit-don't-guess" contract (DIST-028 plan, Risks) — do **not** weaken it;
fix the fixtures instead.

### Validation commands

- `npm run typecheck` — `tsc --noEmit` (run after any `lib/` change)
- `npm run lint` — `eslint .`
- `npm run eval` — offline regression gate; must pass, then refreshed via `UPDATE_BASELINE=1`
- `npm run eval:capture` — re-renders offline fixtures into `eval/corpus/<slug>/capture.json`

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `eval/fixtures/clean-light.html` | UPDATE | Wrap hero+grid `<section>`s in `<main>` so the digest is emitted |
| `eval/fixtures/dark-mode.html` | UPDATE | Same `<main>` wrapper |
| `eval/capture.ts` | UPDATE | Copy `rawHarvestNode` into the written `Capture` (Task 2) |
| `lib/extract/structure/structureAI.ts` | UPDATE | Accept `forceHeuristicNaming`; short-circuit before `aiLaneAvailable()` (Task 3) |
| `lib/extract/structure/index.ts` | UPDATE | Add `forceHeuristicNaming` to `ExtractStructureOptions`; thread into Stage 7 (Task 3) |
| `lib/analyze.ts` | UPDATE | Add opts to `extractStructureFromCapture`; thread into `extractStructure` (Task 3) |
| `eval/scoreStructure.ts` | UPDATE | Add `expectedSections`; real non-constant scoring with sections primary (Task 4) |
| `eval/score.ts` | UPDATE | Add `structure?` to `ExpectedSpec`; extend `combinedScore` to weight structure (Task 5) |
| `eval/run.ts` | UPDATE | Pass `forceHeuristicNaming: true` + `expected.structure`; fold structure into combined (Task 5) |
| `eval/corpus/clean-light/expected.yaml` | UPDATE | Hand-author `structure:` block (Task 6) |
| `eval/corpus/dark-mode/expected.yaml` | UPDATE | Hand-author `structure:` block (Task 6) |
| `eval/corpus/clean-light/capture.json` | REGENERATE | `npm run eval:capture` — now carries top-level `rawHarvestNode` (Task 2) |
| `eval/corpus/dark-mode/capture.json` | REGENERATE | Same (Task 2) |
| `eval/baseline.json` | UPDATE | `UPDATE_BASELINE=1 npm run eval` once scores are real (Task 7) |

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Add `<main>` wrapper to both fixtures

- **Files**: `eval/fixtures/clean-light.html`, `eval/fixtures/dark-mode.html`
- **Action**: UPDATE
- **Implement**: Wrap the `<section class="hero">` and `<section class="grid">`
  in `<main> … </main>` (between `</header>` and `<footer>`). No CSS, class,
  or content changes — purely a semantic wrapper. This is the minimal change
  that makes `findDigestBands` find a main band so Stage 9 emits `sections`.
- **Why here, not in `sections.ts`**: weakening the omit-don't-guess contract
  (DIST-028 plan Risks) to handle main-less pages is a structure-lane semantic
  change out of scope for an eval-harness issue. The corpus is meant to span
  real pages, and real landing pages have `<main>`.
- **Mirror**: existing fixture structure (`eval/fixtures/clean-light.html:54-112`).
- **Validate**: `npm run typecheck` (no code); visual no-op.

### Task 2: Copy `rawHarvestNode` into the eval capture + re-capture

- **File**: `eval/capture.ts`
- **Action**: UPDATE (lines 44-58)
- **Implement**: Add `rawHarvestNode: captured.rawHarvestNode,` to the `Capture`
  literal, mirroring `captureFromRender` (`lib/analyze.ts:294`). Then run
  `npm run eval:capture` (offline fixtures only — the default, no network) to
  regenerate both `eval/corpus/<slug>/capture.json` files. Verify each new
  capture has a top-level `rawHarvestNode` (e.g.
  `node -e 'console.log("rawHarvestNode" in JSON.parse(require("fs").readFileSync("eval/corpus/clean-light/capture.json","utf8")))'`
  → `true`). Commit the refreshed captures.
- **Mirror**: `lib/analyze.ts:283-300` (captureFromRender).
- **Precedent**: CLAUDE.md §45 — touching committed `capture.json` is sanctioned
  when the capture *shape* changes (same precedent as `responsiveHarvests` /
  `darkCapture` / `panoramaShot`).
- **Validate**: `npm run eval:capture` succeeds; both captures carry `rawHarvestNode`.

### Task 3: AI-off switch — thread `forceHeuristicNaming` through the structure lane

- **Files**: `lib/extract/structure/structureAI.ts`, `lib/extract/structure/index.ts`, `lib/analyze.ts`
- **Action**: UPDATE
- **Implement**:
  - `structureAI.ts`: change signature to
    `runStructureAILabeller(root: PrunedNode, opts?: { forceHeuristicNaming?: boolean }): Promise<StructureAIResult>`.
    As the **first** statement, before `aiLaneAvailable()`:
    `if (opts?.forceHeuristicNaming) return { root, components: buildFallbackComponentMap(root), naming: "heuristic" };`
    This guarantees the `Anthropic` client is never constructed on the eval
    path → no network, no `sectionDescriptions`, deterministic. Default
    (no opts) → current behaviour.
  - `index.ts`: add `forceHeuristicNaming?: boolean` to `ExtractStructureOptions`
    (alongside the existing `rawHarvestNode` replay comment, line 21); pass it
    at the Stage 7 call (`index.ts:86-91`):
    `await runStructureAILabeller(typedRoot, { forceHeuristicNaming: opts.forceHeuristicNaming })`.
  - `analyze.ts`: extend
    `extractStructureFromCapture(capture, report?, opts?: { forceHeuristicNaming?: boolean })`
    and thread `forceHeuristicNaming: opts?.forceHeuristicNaming` into the
    `extractStructure({ ... })` call (`analyze.ts:113-120`).
- **Blast radius (verified)**: `extractStructureFromCapture` callers are
  `eval/run.ts` (passes `forceHeuristicNaming: true`), `analyzeUrlStructure`
  (`analyze.ts:355`, no opts → AI-on when key set), and
  `app/api/analyze/route.ts:197` (no opts → AI-on). `eval/stability.ts`
  (eval:ai) does **not** call the structure lane — it calls `extractFromCapture`
  + `interpret` directly, so the AI stability check is unaffected and still
  makes live calls as intended.
- **Alternative (rejected)**: an env guard read inside `runStructureAILabeller`
  (e.g. `DISTILL_EVAL_OFFLINE`). The issue permits it ("an explicit option *or*
  env guard"), but a threaded option is testable, scoped, and doesn't couple
  the library to an eval-specific env var. Do **not** rely on unsetting
  `ANTHROPIC_API_KEY` in the env (issue AC: must stay offline even when set).
- **Mirror**: `lib/aiLane.ts:12-14` (availability chokepoint),
  `structureAI.ts:150-152` (fallback return shape).
- **Validate**: `npm run typecheck && npm run lint`.

### Task 4: Real, non-constant `scoreStructure` against `expected` (sections primary)

- **File**: `eval/scoreStructure.ts`
- **Action**: UPDATE
- **Implement**:
  - Extend `ExpectedStructureSpec` with
    `expectedSections?: Array<{ name: string; instances?: number }>` — the
    ordered section-digest names/instances (DIST-028), the primary target.
  - Keep the `if (!expected) return …1.0` early return as a defensive neutral
    (eval will always pass a spec after Task 5; the issue's "stop returning
    1.0" is satisfied because eval no longer hits this branch).
  - In the `expected` branch, add a **section-order** score before the existing
    region/component scores:
    - If `expected.expectedSections` is provided: let `emitted = report.machineBlock.sections ?? []`.
      For each expected entry at index `i`, a hit requires `emitted[i]` to exist
      and `emitted[i].name` to case-insensitively match `expected[i].name`; if
      `expected[i].instances` is set, also require `emitted[i].instances === expected[i].instances`.
      `sectionAccuracy = hits / expected.expectedSections.length`. If
      `expected.expectedSections` is non-empty but `emitted` is empty →
      `sectionAccuracy = 0` (real regression signal). If `expectedSections`
      absent → `sectionAccuracy = null` (excluded from combined).
    - Region accuracy (existing, `scoreStructure.ts:34-48`) and component-count
      accuracy (existing, `:50-76`) stay as the secondary signals.
  - `combined` weighting: when `sectionAccuracy !== null`,
    `combined = sectionAccuracy*0.5 + regionAccuracy*0.2 + componentCountAccuracy*0.3`
    (sections primary). When `sectionAccuracy === null`, keep the current
    `(regionAccuracy + componentCountAccuracy) / 2`. Add `sectionAccuracy` to
    `StructureScoreResult` (and surface it in `SiteResult`/notes via Task 5).
  - Misses: push `"Missing/extra section at ordinal N: expected X, got Y"` and
    `"Sections digest absent but expectedSections provided"` so failures explain
    themselves.
- **Mirror**: existing region/component scoring (`scoreStructure.ts:32-85`).
- **Validate**: `npm run typecheck`.

### Task 5: Wire the spec + structure score into the eval gate

- **Files**: `eval/score.ts`, `eval/run.ts`
- **Action**: UPDATE
- **Implement**:
  - `score.ts`: add `structure?: ExpectedStructureSpec` to `ExpectedSpec`
    (import the type from `./scoreStructure`). Extend
    `combinedScore(palette, typography, structure?: number | null)`:
    when `structure` is a number, weight `palette*0.5 + typography*0.3 + structure*0.2`
    (typography falls back to palette-only when null, as today); when
    `structure` is null/undefined, keep `palette*0.6 + typography*0.4`.
  - `run.ts`:
    - Call `extractStructureFromCapture(capture, undefined, { forceHeuristicNaming: true })` (`run.ts:60`).
    - Pass the spec: `scoreStructure(structReport, expected.structure)` (`run.ts:61`).
    - Feed the gate: `const combined = combinedScore(pal, typo, structResult.combined);` (`run.ts:55`).
    - Carry `sectionAccuracy` + structure misses into `SiteResult.notes` (mirrors palette/type notes, `run.ts:68-82`).
- **Why fold into `combined` (not a separate gate)**: the issue AC4 requires a
  deliberate structure break to "drop below baseline and the gate fail" —
  folding structure into `combined` makes a structure regression lower the
  very number the baseline gate compares, with no second baseline file. The
  deliberate `UPDATE_BASELINE=1` refresh (Task 7) records the new combined.
- **Mirror**: `eval/score.ts:119-126` (combinedScore), `eval/run.ts:44-94` (scoreSite).
- **Validate**: `npm run typecheck && npm run lint`.

### Task 6: Hand-author expected structure specs per corpus site

- **Files**: `eval/corpus/clean-light/expected.yaml`, `eval/corpus/dark-mode/expected.yaml`
- **Action**: UPDATE
- **Implement**: Add a `structure:` block to each. **Author against the real
  re-captured output after Tasks 1–5 land** — run a throwaway scratch script
  (per CLAUDE.md "Manually verifying extraction changes"; `npx tsx` from the
  project root; force AI off via `env -u ANTHROPIC_API_KEY`; delete after)
  that captures each fixture and prints `machineBlock.sections`,
  `skeletonAscii`, and `components`. Do **not** trust predicted names — read
  them from the actual emit. Based on the temp-fixture investigation, the
  expected values are approximately:
  - **clean-light** (with `<main>`):
    ```yaml
    structure:
      expectedSections:
        - { name: SiteHeader }
        - { name: Hero }
        - { name: CardGrid }
        - { name: SiteFooter }
      expectedRegions: [SiteHeader, MainContent, CardGrid, SiteFooter]
      expectedComponents:
        SectionCard: { count: 6 }
        TextLink:    { count: 4 }
        Button:      { count: 2 }
    ```
  - **dark-mode** (with `<main>`): section names `[SiteHeader, Hero, GridSection, SiteFooter]`
    (note: `GridSection`, not `CardGrid` — heuristic naming differs because the
    section's text/class differ; the real name from the scratch run is
    authoritative). `expectedRegions: [SiteHeader, MainContent, GridSection, SiteFooter]`.
    Component counts: `SectionCard: { count: 5 }` (the 6th card contains a
    `<code>` block, so repetition collapse yields `SectionCard ×5` + one
    outlier `Section` — spec the real `5`, not the HTML's 6), `TextLink: { count: 4 }`,
    `Button: { count: 2 }`.
- **Mirror**: existing expected.yaml shape (`eval/corpus/clean-light/expected.yaml`).
- **Validate**: `npm run eval` — structure score is non-constant and > 0.

### Task 7: Deliberate baseline refresh

- **File**: `eval/baseline.json`
- **Action**: UPDATE (via the runner, not hand-edited)
- **Implement**: Once Tasks 1–6 pass and `npm run eval` is green, run
  `UPDATE_BASELINE=1 npm run eval`. Confirm `baseline.json` now holds the new
  combined scores (palette+typography+structure) for both sites — they should
  be `1.0` (or very near) if the specs match reality. Commit the refreshed
  baseline. Do **not** reflexively refresh if scores look wrong; investigate
  first (issue comment: "only accept intended changes").
- **Mirror**: `eval/run.ts:148-154` (UPDATE_BASELINE path).
- **Validate**: a second plain `npm run eval` passes all gates.

### Task 8: Negative-case verification (AC4)

- **Action**: VERIFY (no committed change)
- **Implement**: Temporarily break the structure extractor (e.g. short-circuit
  `findDigestBands` to return `[]`, or skip Stage 5 repetition in
  `lib/extract/structure/index.ts`). Run `npm run eval` and confirm the gate
  **fails**: the structure score drops, `combined` falls below the refreshed
  baseline, and the failure notes name the missing sections. Revert the break.
  This proves the lane is actually under test.
- **Validate**: gate fails on the break, passes after revert.

---

## Validation

```bash
npm run typecheck     # tsc --noEmit — after lib/ and eval/ changes
npm run lint          # eslint .
npm run eval          # offline gate — must pass with the refreshed baseline
```

## End-to-End Verification

1. `npm run eval:capture` (default = offline fixtures only) regenerates both
   `capture.json`; assert each has a top-level `rawHarvestNode`
   (`node -e '…'` → `true` for both slugs).
2. With `ANTHROPIC_API_KEY` **set** in the shell, run `npm run eval` and
   confirm via a quick `console.warn`/network probe (or `runStructureAILabeller`
  `naming` field) that `naming: "heuristic"` and no HTTP call occurs — the
   structure report carries no `description:` (intent) lines on any digest.
3. Run `npm run eval` twice consecutively; assert byte-identical
   `structureScore` per site (determinism).
4. `npm run eval` passes all gates with the Task-7 baseline.
5. Task 8 negative case: a deliberate structure break fails the gate.
6. `npm run eval:ai` (`stability.ts`) still makes live AI calls when the key is
   set — confirm it is not silenced by the eval-path switch.

---

## Acceptance Criteria

- [ ] `eval/capture.ts` writes `rawHarvestNode`; both regenerated `capture.json` carry it and are committed
- [ ] Both fixtures wrapped in `<main>`; `sections` digest is emitted for both corpus sites
- [ ] With `ANTHROPIC_API_KEY` set, `npm run eval` makes **no network call** — `naming: "heuristic"`, no `sectionDescriptions`, repeated runs deterministic
- [ ] `scoreStructure` receives an `expected` spec and produces a real, non-constant score; sections digest is the primary signal, skeleton regions + component counts secondary
- [ ] Structure score is folded into `combined` so it feeds the site gate
- [ ] Hand-authored `structure:` blocks in both `expected.yaml`, authored against post-reshape output
- [ ] A deliberate structure-extractor break drops the score below baseline and fails the gate
- [ ] `eval/baseline.json` refreshed deliberately via `UPDATE_BASELINE=1 npm run eval`
- [ ] `npm run typecheck`, `npm run lint`, `npm run eval` all pass
- [ ] `eval:ai` (stability) unaffected — still makes live AI calls when the key is set

## Risks

| Risk | Mitigation |
|------|------------|
| Fixtures lack `<main>` → `sections` digest absent → primary target untestable | Task 1 adds `<main>` (verified: emits a 4-band digest); palette/typography unaffected. Alternative (score skeleton+components only) rejected as it leaves the primary target untested |
| Heuristic component names are deterministic but arbitrary (`CardGrid` vs `GridSection`) | Author specs against real re-captured output (Task 6), not predicted names; AI forced off in eval keeps naming stable across runs |
| dark-mode 6th card has `<code>` → repetition collapse yields `SectionCard ×5` + outlier `Section`, not `×6` | Spec the real count (`5`); flag as a known structural quirk; do not "fix" the fixture to force `×6` (it's a useful partial-collapse test case) |
| Folding structure into `combined` changes baseline numbers | Deliberate `UPDATE_BASELINE=1` refresh in Task 7 (the issue's sanctioned refresh); investigate before refreshing if scores look wrong |
| Threading `forceHeuristicNaming` changes 3 signatures | All defaults false; live callers (`analyzeUrlStructure`, `route.ts`) verified to pass nothing → unchanged; `eval:ai` doesn't call structure → unaffected |
| `forceHeuristicNaming` must also suppress DIST-030 `sectionDescriptions` | Short-circuit is the first statement in `runStructureAILabeller`, before the `Anthropic` client is constructed — `sectionDescriptions` only exists on the AI path |
| Structure scoring too strict → gate flaky | Heuristic naming + offline replay are deterministic; specs authored against real output; break-test (Task 8) confirms a real regression fails without borderline flakiness |
| Adding `<main>` shifts hero/grid from depth-1 `region` to depth-2 `container` | Verified empirically: digest still emits `[SiteHeader, Hero, CardGrid/GridSection, SiteFooter]` with correct `contents`/instances; skeleton now shows `MainContent` as a region (a spec target, not a break) |

## Open Questions

1. **Combined-score weighting (0.5/0.3/0.2).** The plan picks palette 0.5 /
   typography 0.3 / structure 0.2 when structure is present (vs. 0.6/0.4
   today). This keeps palette dominant while making a full structure collapse
   (`0.0`) drop combined by 0.2 — comfortably past `REGRESSION_EPS = 0.01`.
   If a maintainer prefers a separate structure gate (own floor + own
   baseline entry) instead of folding into `combined`, Task 5 is the branch
   point; the rest of the plan is unaffected.
2. **Should the live URL/API path also gain a `forceHeuristicNaming` knob?**
   Out of scope here (eval-only), but the threaded option makes it available
   to `analyzeUrlStructure`/`route.ts` later if a caller ever wants
   deterministic structure without the AI call.
3. **Live corpus sites (stripe/linear/vercel).** Their captures are
   git-ignored and not in the CI gate. This plan only authors specs for the
   two committed fixtures. Authoring specs for live sites is a follow-up
   (capture on demand, then add `structure:` to their `expected.yaml`); it
   doesn't block the gate.
