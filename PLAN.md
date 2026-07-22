# Fix Plan — Report Quality Issues

Issues found by generating real reports from the `clean-light` fixture and a live
stripe.com run (2026-07-22). Grouped by track, ordered by impact. Each item has
the defect, root cause, proposed fix, and acceptance criteria. All fixes are
deterministic (no AI lane changes) except P2-2.

**Regression gate:** after each phase, `npm run eval` must pass; refresh the
baseline (`UPDATE_BASELINE=1 npm run eval`) only when a score change is the
intended result of a fix.

---

## Phase 1 — Correctness bugs (do first)

### P1-1 · Spacing scale is garbage on real sites

- **Symptom:** stripe.com emits `Base unit: 4px, Scale: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]`.
- **Cause:** `lib/extract/tokens.ts:51-57` sorts observed values *ascending* and
  takes `slice(0, 10)` — i.e. the ten smallest px values ever observed, not the
  most representative ones. Noise (1–3px margins) crowds out the real rhythm.
- **Fix:**
  1. Rank candidate values by frequency, not magnitude.
  2. Snap survivors to multiples of the detected base unit (drop values that
     aren't within ±1px of a base multiple).
  3. Sort the final scale ascending for presentation; cap at ~8 steps.
- **Accept:** stripe.com produces a plausible scale (multiples of 4/8);
  `clean-light` still yields `[4, 8, 16, 24, 32, 48, 64]`; eval passes.

### P1-2 · ASCII skeleton connectors are malformed

- **Symptom:** every emitted tree shows `└─` before `├─` siblings and stray `│`
  continuation bars under last children (e.g. `└─ Nav` followed by `│  └─ Button`).
- **Cause:** `lib/extract/structure/structureEmit.ts:111` computes
  `childPrefix` from the **current** node's `isLast` instead of the child's:
  `prefix + (isLast ? "   " : "│  ")` should be `prefix + (childIsLast ? "   " : "│  ")`.
- **Fix:** one-line change; move `childPrefix` inside the loop using `childIsLast`.
- **Accept:** fixture skeleton renders a well-formed box-drawing tree (verify by
  eye + a unit test on a 3-level synthetic `PrunedNode`).

### P1-3 · Script/style text leaks into text snippets

- **Symptom:** stripe.com's root node snippet is a JSON-LD blob
  (`"{'@context':'https://schema.org'…"`).
- **Cause:** `lib/extract/structure/harvester.ts:88` uses `el.textContent`,
  which aggregates text from *all* descendants — including `<script>`/`<style>`
  children that were themselves skipped as nodes (line 65).
- **Fix:** compute snippet text from a filtered walk that excludes
  `script/style/noscript/template` subtrees (clone-and-strip, or accumulate
  visible text during the existing recursive harvest). While here:
  - truncate at a word boundary instead of a hard `slice(0, 40)`,
  - collapse internal whitespace/newlines to single spaces so snippets can't
    break the skeleton's line structure (fixes the multi-line `Body "…"` header).
- **Accept:** no JSON/CSS fragments in any snippet on stripe.com; all snippets
  single-line.

### P1-4 · Machine-block `instances` counts are wrong

- **Symptom:** stripe.com component map says `Image — instances: 1` (dozens
  exist), `Button — instances: 44`; some defs are self-referential
  (`Button` composed of `Button`, `Span`/`Small` typed `container`).
- **Cause:** the fallback component map in
  `lib/extract/structure/structureAI.ts` (`buildFallbackComponentMap`) counts
  and composes inconsistently; leaf components fall through to a self-naming
  composition and a default `container` type.
- **Fix:**
  1. Count instances by a full-tree walk (sum of node occurrences per
     `componentName`, multiplied through `instanceCount`).
  2. Leaf components get `composition: []` (render as `—` in the map), never
     their own name.
  3. Type leaves with text/interactive flags as `atom`, not `container`.
- **Accept:** counts in `## Components` match what the skeleton shows; no
  self-referential compositions; structure eval score does not regress.

---

## Phase 2 — Missing information a rebuild needs

### P2-1 · Font fallback stacks are discarded

- **Symptom:** stripe.com typography emits family `sohne-var` alone — a
  proprietary font a new site can't load; the measured fallback stack is thrown
  away.
- **Cause:** `lib/extract/typography.ts` (`firstFamily`, line ~36) reduces each
  stack to its first entry by design.
- **Fix:** keep the primary name as the family key (dedupe/cluster still works),
  but record the full stack. Schema change in `lib/schema.ts`
  (`fontFamilySchema` gains `stack: z.array(z.string())`), emit change in
  `lib/emit.ts` (`renderTypography` shows `Inter · fallback: system-ui, sans-serif`).
- **Accept:** frontmatter contains the full stack; body shows primary +
  fallbacks; eval body-family check still matches on the primary name.

### P2-2 · Layout mechanics are measured but never emitted

- **Symptom:** README promises "max-width constraints, sticky headers,
  responsive breakpoint rules"; no report contains any of them. Harvester
  measures `bounds` for every node but the emitter drops all dimensional data.
- **Fix (deterministic subset first):**
  1. **Content max-width:** widest common width among `MainContent`/section
     children that is < viewport width (from existing `bounds`) → emit as
     `contentMaxWidth` in the structure header block.
  2. **Sticky/fixed header:** capture `position` in
     `lib/extract/structure/harvester.ts` for landmark nodes → `header: sticky`
     annotation on `SiteHeader`.
  3. **Region heights:** emit rounded px heights for `region`-typed nodes as an
     annotation (e.g. `SiteHeader [h 75px]`), giving a rebuild vertical rhythm.
  4. **Breakpoints (larger, optional follow-up):** re-render at 2–3 viewports in
     `lib/ingest.ts` and diff grid column counts → `responsive:` block. Do this
     last; it changes capture shape and eval fixtures.
- **Accept:** structure header shows viewport + content max-width + sticky flag
  for stripe.com; README claims match reality (or trim the README claim if 4 is
  deferred).

### P2-3 · Radius scale admits composite values; elevation is unnamed

- **Symptom:** stripe.com radius scale contains `0px 0px 6px 6px`; shadows are
  raw strings with no token names.
- **Cause:** `lib/extract/tokens.ts:79-84` keeps multi-value radii verbatim when
  corners differ; `extractElevation` emits frequency-sorted raw strings.
- **Fix:**
  1. Radius: when corners differ, keep the dominant corner value (mode of the
     four) instead of the composite string; drop `0px` results.
  2. Elevation: name levels by y-offset/blur magnitude ascending →
     `{ name: "sm" | "md" | "lg" | "xl", value: string }`. Schema + emit update.
- **Accept:** all radius entries are single values or `9999px`; shadows render
  as `- **md** \`rgba(…)…\``.

### P2-4 · Spacing units ambiguous in the emitted body

- **Symptom:** `Base unit: 4px` next to `Scale: [4, 8, 16, 24, 32, 48, 64]` —
  px or multipliers? A generator can guess wrong.
- **Fix:** `lib/emit.ts` (`renderSpacing`): emit `Scale (px): \`[4, 8, …]\``,
  and add `unit: "px"` to `spacingSchema` frontmatter so the machine contract is
  explicit too.
- **Accept:** both frontmatter and body are unit-unambiguous.

---

## Phase 3 — Format & consumption improvements

### P3-1 · Cross-link structure components to design tokens

- **Gap:** the two reports never reference each other; `SectionCard` has no tie
  to `surface`/`radius`/`h3`, so a consumer re-derives token usage per component.
- **Fix:** in the combined (`both`) mode, join structure nodes to the style dump
  by bounds overlap and emit per-component token hints in the component map:
  `- tokens: bg=surface · radius=8px · gap=24`. New joining module
  (`lib/extract/structure/tokenLink.ts`); only runs when both lanes are present.
- **Accept:** stripe.com `both` run shows token hints on at least the
  card/header/footer components; hints only name tokens that exist in the
  design report.

### P3-2 · Machine block bloat and duplication

- **Symptom:** stripe.com structure report is 909 lines, ~⅔ pretty-printed JSON
  restating the skeleton.
- **Fix:** serialize the machine block compact (`JSON.stringify(x)` per
  top-level key, or 1-space indent). Keep the tree — it *is* the machine
  contract — but stop double-spacing it. Optionally validate the block with
  `structureMachineBlockSchema.parse` before emit (Track A validates; Track B
  currently doesn't).
- **Accept:** stripe.com report shrinks ≥40%; block parses; schema-validated.

### P3-3 · Layout annotation alignment

- **Symptom:** `structureEmit.ts:95` appends annotations with a fixed 18-space
  literal, producing ragged pseudo-columns.
- **Fix:** either a plain single space before `[grid · 3col]`, or pad to a real
  column computed from the longest sibling line. Single space is fine — the
  fake alignment is worse than none.
- **Accept:** skeleton lines have no arbitrary interior gaps.

### P3-4 · Minor emit polish

- Empty `## Elevation` section renders a dangling `Shadows:` header when the
  shadow list is empty (`lib/emit.ts:137-144`) → omit the section when empty
  (schema already allows omission upstream).
- Palette entries with `areaWeight: 0` and no distinct role value (stripe's
  `border #000000` at 0%) → drop swatches below a small area threshold unless
  their role is otherwise unfilled.
- `lib/extract/structure/structureAI.ts:6` pins `claude-3-7-sonnet-20250219` →
  bump to a current model id and re-run `npm run eval:ai` for stability.

---

## Suggested order & verification

| Step | Items | Verify with |
|---|---|---|
| 1 | P1-2, P1-3, P3-3 (emit-only, no schema change) | fixture + stripe.com re-run, eyeball skeleton |
| 2 | P1-1, P2-3, P2-4 (tokens.ts + schema) | `npm run eval`, stripe.com spacing sane |
| 3 | P1-4 (fallback component map) | structure eval score |
| 4 | P2-1 (typography stack, schema) | eval body-family check |
| 5 | P2-2 items 1–3 (layout mechanics) | stripe.com header block |
| 6 | P3-1, P3-2, P3-4 | `both` mode run, report size diff |
| 7 | P2-2 item 4 (breakpoints) — separate PR | new eval fixtures |

Schema changes (P2-1, P2-3, P2-4) touch `lib/schema.ts` frontmatter shape —
they are additive, but bump any downstream consumers/tests that assert exact
frontmatter, and refresh `eval/corpus/*/expected.yaml` only if scoring keys off
the changed fields.

---
---

# Fix Plan — Round 2: Rebuild-Sufficiency Gaps

Issues found 2026-07-22 by generating real reports from the `clean-light`
fixture (design lane replayed from the cached capture; structure lane run live
over HTTP with the AI lane disabled) and auditing the emit path against the
stated goal: *the two markdown files should be sufficient to build a new
website*. Phases 1–3 above are implemented; this round starts at Phase 4.

**Regression gate (unchanged):** after each phase, `npm run eval` must pass;
refresh the baseline only when a score change is the intended result.

---

## Phase 4 — Correctness bugs (do first)

### P4-1 · `TextLink`/`Input` names are unreachable — links emit as `Button`

- **Symptom:** fixture nav renders `Button ×4 "Product"` for four `<a>`
  elements; a rebuild would produce buttons where the site has links.
- **Cause:** `lib/extract/structure/ontology.ts:34` checks
  `node.tagName === "button" || node.isInteractive` *first*, and
  `isInteractive` includes `a/input/select/textarea`
  (`structureSchema.ts:111`) — so the `"a"` → `TextLink` branch (line 35) and
  the `input` → `Input` branch (line 38) can never fire.
- **Fix:** name by tag before the interactive catch-all:
  `a` → `TextLink`, `input|select|textarea` → `Input`, `h*` → `Heading`,
  `img|svg` → `Image`, `button` → `Button`; only *then* fall back to `Button`
  for any remaining interactive node.
- **Accept:** fixture skeleton shows `TextLink ×4` in the nav and `Button ×2`
  in the hero CTA row; structure eval score does not regress.

### P4-2 · Component map loses composition on name collisions

- **Symptom:** hero section and feature-grid section both named `Section`
  (`instances: 2`); the map keeps only the first-seen composition
  (`Heading + P + Span`), so `SectionCard` vanishes from `Section`'s
  definition — the map contradicts the machine-block tree.
- **Cause:** two defects compound:
  1. `buildFallbackComponentMap` / `populateMissingComponentDefs`
     (`structureAI.ts:145-196`) freeze `composition` at the first occurrence.
  2. `assignOntologyTypes` branch 1 (`ontology.ts:15-26`) keeps the generic
     `formatDefaultName` result for landmark-ish `<section>` nodes, so
     structurally different sections collide on the name `Section`.
- **Fix:**
  1. Map aggregation: union child names across *all* occurrences of a
     component name (dedup, still excluding self-references).
  2. Naming: make section defaults structure-aware so distinct sections don't
     collide — first `<section>` containing an `h1` in the top viewport band
     → `Hero`; a section whose annotation includes `grid` → `GridSection`
     (the existing `formatDefaultName` logic, made reachable in branch 1);
     otherwise `Section`.
- **Accept:** fixture map defines `Hero` and `GridSection` separately, each
  with the composition the skeleton actually shows; map and machine block
  never disagree on a component's children.

---

## Phase 5 — Missing information a rebuild needs

### P5-1 · No interactive states, no semantic colors

- **Gap:** one flat hex per role; no hover/focus/active/disabled, no
  success/error/warning. A rebuilt button has no hover behavior to copy.
- **Fix (keep the "measured, never faked" principle):**
  1. **Harvest:** in `lib/extract/styleDump.ts`, scan `document.styleSheets`
     (CSSOM) for rules whose selector carries `:hover`/`:focus-visible` and
     whose base selector matches an interactive element already in the dump;
     record the declared `background-color`/`color`/`border-color`/
     `box-shadow` deltas. Cross-origin sheets that throw on `cssRules` are
     skipped silently.
  2. **Schema:** add optional `states` lane to `lib/schema.ts` —
     `{ provenance, entries: [{ target: role, state: "hover" | "focus",
     changes: { property, from, to }[] }] }`. Omitted when nothing observed.
  3. **Semantic roles:** extend `COLOR_ROLES` with
     `success | warning | danger` and assign only on strong evidence (hue
     band + usage context, e.g. observed on form/alert elements); never
     synthesized from the primary.
  4. **Emit:** new `## States` section in `renderBody`
     (`- **primary** hover: \`#1557b0\` (background)`).
- **Accept:** a site with a plain CSS `:hover` rule on its primary button
  emits that hover color in frontmatter + body; sites without observable
  states omit the section entirely; eval passes untouched (new lane is
  additive).

### P5-2 · Single-viewport capture — no responsive information

- **Gap:** everything is measured at 1440×900; `grid · 3col` is desktop-only
  truth and no breakpoint exists in either report. (This is round-1 P2-2
  item 4, deferred then; promote it now.)
- **Fix:**
  1. `lib/ingest.ts`: after the primary 1440px render, resize to 390px
     (and optionally 768px), re-run the harvest only (no screenshot, no
     style dump) — cheap second pass in the same page session.
  2. New diff module `lib/extract/structure/responsive.ts`: match nodes
     across viewports by `signature`/landmark, record layout-annotation
     deltas (`3col → 1col`, `flex · row → column`, region height changes).
  3. Emit: `viewports: [1440×900, 390×844]` in the structure header and a
     `responsive` map in the machine block
     (`{"GridSection": {"1440": "grid · 3col", "390": "grid · 1col"}}`) plus
     one `## Responsive` bullet list in the body.
  4. Typography (smaller follow-up): re-read `h1/h2` computed sizes at 390px
     and emit optional `sizePxMobile` on scale steps that differ.
- **Accept:** fixture (grid collapses via its own media query) shows the
  3col → 1col delta; capture JSON shape change is versioned — refresh
  `eval/corpus/*/capture.json` via `npm run eval:capture` in the same PR.
- **Note:** largest item in the plan; ship as its own PR.

### P5-3 · Heuristic fallback names degrade to PascalCase tags

- **Gap:** without `ANTHROPIC_API_KEY`, output names are `Section`, `P`,
  `Span` — the AI pass (Stage 7) carries most of the report's semantics.
- **Fix:** strengthen `ontology.ts` defaults with cheap positional/content
  heuristics (no AI): `Hero` (P4-2's rule), `NavLinks` (repeated `TextLink`
  group inside `nav`), `CtaRow` (button group inside hero), `FooterColumns`
  (grid/flex inside footer), `CardGrid` (container whose children are one
  repeated content-block). `P`/`Span`/`Small` atoms render as `Text`
  with the tag kept in the machine block only.
- **Accept:** fixture run with no API key names hero, nav links, and CTA row
  semantically; AI pass still overrides names when available; structure eval
  score improves or holds.

---

## Phase 6 — Image-path parity with the stated goal

### P6-1 · UI/API accept exactly one image; goal says "multiple images"

- **Symptom:** `app/api/analyze/route.ts:13` takes `image?: string`;
  `app/page.tsx:192-202` uses `files[0]` only.
- **Fix:**
  1. API: accept `images?: { data: string; name?: string }[]` (keep `image`
     as a deprecated alias mapping to a one-element array); cache key hashes
     all images.
  2. Extraction: run `extractImagePalette` per image, then merge — union
     swatches, dedupe by ΔE < 5 keeping the higher-areaWeight one,
     re-normalize `areaWeight` across the set, recompute contrast pairs.
  3. AI lane: pass all screenshots (cap ~4) to `interpret` for
     identity/mood.
  4. UI: multi-file drop + thumbnail strip; report header lists all source
     refs (`source.ref` becomes a joined list or `source.refs` array —
     additive schema change).
- **Accept:** two screenshots of the same site yield one merged palette with
  no near-duplicate hexes; single-image requests behave exactly as before.

### P6-2 · Image mode produces no layout structure at all

- **Gap:** half the stated goal (structure from images) is unmet; image mode
  emits only `palette-mood`.
- **Fix (two steps, cheapest first):**
  1. **Scope honestly (immediate):** README + UI copy say image mode yields
     *Palette & Mood* only; the mode toggle hides the `structure`/`both`
     options for image input.
  2. **Vision structure lane (follow-up PR):** new `structureFromImage.ts` —
     one vision call returns the same `nodeUpdates`/`componentDefinitions`
     JSON contract as Stage 7, validated by `aiStructureResponseSchema`,
     emitted through the existing `emitStructureReport` with
     `fidelity: "inferred"` (the enum already supports it,
     `structureSchema.ts:63`). Bounds/heights are omitted, not guessed —
     skeleton and component map only. Gated on API key; image mode without a
     key states why structure is unavailable.
- **Accept:** step 1 — no UI path promises what the pipeline can't deliver;
  step 2 — an uploaded landing-page screenshot yields a plausible skeleton
  clearly stamped `fidelity: inferred`.

---

## Suggested order & verification

| Step | Items | Verify with |
|---|---|---|
| 1 | P4-1 (ontology ordering) | fixture skeleton shows `TextLink`; eval |
| 2 | P4-2 (map union + section naming) | fixture map vs machine block agree |
| 3 | P5-3 (fallback naming heuristics) | no-key fixture run reads semantically |
| 4 | P6-1 (multi-image) + P6-2 step 1 (honest copy) | two-image upload; UI copy |
| 5 | P5-1 (states + semantic colors, schema) | site with `:hover` rules; eval |
| 6 | P5-2 (responsive capture) — separate PR | fixture 3col→1col; refreshed corpus |
| 7 | P6-2 step 2 (vision structure) — separate PR | screenshot → inferred skeleton |

Dependencies: P4-2 builds on P4-1 (naming changes ripple into the map);
P5-3 builds on P4-2's `Hero` rule. P5-1/P6-1 are additive schema changes —
same caveat as round 1 about consumers asserting exact frontmatter. P5-2
changes the capture shape: refresh `eval/corpus/*/capture.json` and
`baseline.json` deliberately in that PR, never as a side effect.
