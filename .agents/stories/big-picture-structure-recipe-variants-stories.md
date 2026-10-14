# Stories: Big-Picture Structure Report + Recipe Variant Clustering

**Source**: `.agents/temp/plan.md` (2026-07-23)
**Generated**: 2026-07-23
**Last Updated**: 2026-10-14

The plan reshapes the structure report to lead with per-section big-picture specs and fixes recipe modal-averaging across heterogeneous instances. Phases below follow the plan's own implementation order (each step independently verifiable). Eval-safety: the gate only scores palette/typography, so structure/recipe output shape is free to change — every story still carries the "eval passes untouched" criterion.

**Cross-cutting definition of done** (applies to every story): `npm run typecheck`, `npm run lint`, and `npm run eval` all pass with no baseline refresh; work happens on a feature branch; no commits/pushes unless asked.

**Backlog re-sequencing (2026-07-23):** DIST-013 (#19, restore structure lane to the eval harness) was re-sequenced to land **after** this epic — its hand-authored expected specs must be written against the reshaped output (section digests from DIST-028 as the primary scoring target), not the old 24-node skeleton. DIST-023/024/028/029 therefore block DIST-013. DIST-020 (#26, doc sync) slides later with it and absorbs this epic's doc impact (none of the stories below carry their own doc updates).

---

## Status

All 11 stories are done: each issue (#29–#39) is closed as completed and each pull request (#55–#65) is merged into `main`. No issue or pull request of this file is still open.

| Story | Issue | Pull request | Phase | Status | Acceptance criteria ticked |
| --- | --- | --- | --- | --- | --- |
| DIST-023 Structure naming fixes | #29 | #55 | 1 | done | 4 of 4 |
| DIST-024 Squash wrapper chains | #30 | #56 | 2 | done | 4 of 4 |
| DIST-025 Nav buttons to NavItem | #31 | #57 | 3 | done | 3 of 3 |
| DIST-026 Cluster recipes by bg role | #32 | #58 | 3 | done | 5 of 5 |
| DIST-027 Recipe `variant` label | #33 | #59 | 3 | done | 3 of 3 |
| DIST-028 Section digest (Stage 9) | #34 | #60 | 4 | done | 5 of 5 |
| DIST-029 Page sections lead the body | #35 | #61 | 4 | done | 4 of 4 |
| DIST-030 AI section descriptions | #36 | #62 | 5 | done | 3 of 4 |
| DIST-031 Desktop h1 anchoring | #37 | #63 | Follow-up | done | 3 of 3 |
| DIST-032 Zero-width border color | #38 | #64 | Follow-up | done | 3 of 3 |
| DIST-033 Cross-origin states spike | #39 | #65 | Follow-up | done | 3 of 3 |

The criteria were checked on 2026-10-14 against the code at `4291324` and an offline `npm run eval` run (all gates passed); the product was not run. A criterion that names a synthetic fixture is ticked on the validation section of the story's implementation report in `.agents/reports/dist-0NN-*-report.md`, where the code still holds the behaviour. A ticked box means the code satisfies the criterion now, an unticked box carries a note with what is missing, and an As Built section records where the result differs from the text or where it lives. Plans are in `.agents/plans/completed/`, reviews in `.agents/reviews/`.

### Open Items Without a Story

**Open GitHub issues that no story names**

- #156 [TODO-1] Handle inaccessible URLs, bot-blocks, and view-obscuring overlays gracefully
- #158 [TODO-3] Investigate secure local distribution and sharing models (Docker / BYOK)
- #166 [TODO-1] Spike: bypass or detect view-obscuring overlays, cookie walls, and paywalls before capture

## [DIST-023] Fix structure naming: no root "Hero", no bogus `*Card` suffixes

**Type**: Bug
**GitHub Label**: bug
**Priority**: High
**Complexity**: Small
**Phase**: 1 (plan step 1b — "smallest, kills the worst artifacts")
**Labels**: `structure-lane`
**Status**: done — issue closed, PR #55 merged

### Description

As a builder reading a structure report, I want component names that reflect what the elements actually are, so that the skeleton doesn't present `document.body` as a "Hero" with 4 bogus instances or animated counter digits as `SpanCard ×11`.

### Acceptance Criteria

- [x] Given any capture, when the ontology stage names the depth-0 node, then it is named `Page` — `isHeroSection` never applies to the root, regardless of h1 position.
- [x] Given a repeated unit whose tag is not in `div/section/article/li`, or that has neither children nor mixed text+image content, when it is named, then it keeps its base name without the `*Card` suffix (no `SpanCard`, no `LiCard`).
- [x] Given a repeated `div`/`article` unit with real card-like content, when it is named, then the `*Card` suffix still applies as before.
- [x] Given the synthetic verification fixture, when the report is emitted, then the skeleton root is `Page` and no `SpanCard` appears.

### Technical Notes

- `lib/extract/structure/ontology.ts`: `isHeroSection` (~line 145) currently names *any* div/section containing an h1 above y=900 "Hero"; pass depth into `formatDefaultName` and special-case depth 0. `*Card` suffix gate is ~line 75.
- Verify with a synthetic-fixture scratch script per CLAUDE.md ("Manually verifying extraction changes"), run with `npx tsx` from project root, deleted afterwards.

### As Built

- `formatDefaultName` in `lib/extract/structure/ontology.ts` returns `Page` at depth 0; `isCardWorthy` gates the `*Card` suffix to `div`/`section`/`article`/`li` nodes with children or mixed text and image content.
- A repeated bare span (counter digits) is named `Text ×N`, and `isHeroSection` also refuses a container that wraps a page-level region.

### Dependencies

- Blocked by: —
- Blocks: DIST-028 (digest names build on fixed ontology names), DIST-013 (#19 — eval expected specs are authored against the reshaped output)

---

## [DIST-024] Squash single-child generic wrapper chains in the pruned tree

**Type**: Enhancement
**GitHub Label**: enhancement
**Priority**: High
**Complexity**: Medium
**Phase**: 2 (plan step 1a)
**Labels**: `structure-lane`
**Status**: done — issue closed, PR #56 merged

### Description

As a builder reading a structure report, I want `Hero → Hero [grid · 1col] → Hero [grid · 12col]` chains collapsed to one node, so that the skeleton reads at section altitude instead of echoing every layout wrapper.

### Acceptance Criteria

- [x] Given a single-child node whose child is a generic layout container (no landmark, not interactive, not a semantic tag), when the squash pass runs, then the two merge into one node.
- [x] Given a merged pair with differing layout annotations, when squashed, then the more specific annotation wins (`grid · Ncol` > `grid · 1col` > `flex · row` > none) and the outer node's landmark (if any) is kept.
- [x] Given a single-child node whose child is a landmark, interactive, or semantic element, when the pass runs, then no merge happens.
- [x] Given the synthetic fixture with wrapper-chain nesting in the hero, when the report is emitted, then the hero appears as a single node with the innermost content grid's annotation.

### Technical Notes

- New post-pass in `lib/extract/structure/pruner.ts` (or a small new `squash.ts`); the existing collapse rule (`pruner.ts:52-65`) exempts flex/grid wrappers, which is what preserves these chains — don't change that rule, add the pass after it.
- Wire into `lib/extract/structure/index.ts` (~lines 69-75): after `pruneAndCollapse`, before `detectRepetition`.

### As Built

- The pass is `squashWrapperChains` in its own `lib/extract/structure/squash.ts` (Stage 4b), called from `lib/extract/structure/index.ts` between `pruneAndCollapse` and `detectRepetition`.
- The ranking is `grid · Ncol` > `grid · 1col` / bare `grid` > `flex …` > none, ties going to the child; a `sticky`/`fixed` suffix is stripped before ranking and re-appended.
- A vision-inferred node (no `tagName`) is never squashed, and the pass also runs on the secondary-viewport trees of the responsive diff.

### Dependencies

- Blocked by: —
- Blocks: DIST-028 (digests descend past squashed wrappers to find the real content grid), DIST-013 (#19)

---

## [DIST-025] Route nav `<button>`s to NavItem instead of the Button recipe

**Type**: Bug
**GitHub Label**: bug
**Priority**: High
**Complexity**: Small
**Phase**: 3 (plan step 2a)
**Labels**: `tokens-lane`, `recipes`
**Status**: done — issue closed, PR #57 merged

### Description

As a builder using the Button recipe, I want nav dropdown-trigger `<button>`s classified as NavItem, so that unstyled nav triggers stop polluting the sitewide Button recipe (the source of `Button: padding 0px`).

### Acceptance Criteria

- [x] Given a `<button>` inside a nav, when `classify()` runs, then it is routed to NavItem, matching the existing `<a inNav>` behavior.
- [x] Given `styleDump.ts` output for a nav containing `<button>`s, when inspected, then those nodes carry `inNav: true` (add it in the dump walk if currently link-only).
- [x] Given the synthetic fixture's nav with dropdown `<button>`s plus real page buttons, when recipes are emitted, then the Button recipe's padding/background reflect only the real buttons.

### Technical Notes

- `lib/extract/recipes.ts:26` routes only `<a inNav>` to NavItem; extend the condition to `<button>`.
- First verify whether `lib/extract/styleDump.ts` sets `inNav` for buttons — the fix may need a small addition inside the `page.evaluate` walk (plain DOM APIs only, no imports inside the callback).

### As Built

- `classify` in `lib/extract/recipes.ts` routes a button-like node with `inNav === true` to `NavItem`; `<input type=submit|button>` counts as button-like.
- `styleDump.ts` sets `inNav` on every node inside `nav, [role="navigation"]`, not only on links.

### Dependencies

- Blocked by: —
- Blocks: DIST-026 (clustering should run on the cleaned Button class)

---

## [DIST-026] Cluster recipe instances by background role before taking modals

**Type**: Enhancement
**GitHub Label**: enhancement
**Priority**: High
**Complexity**: Medium
**Phase**: 3 (plan step 2b)
**Labels**: `tokens-lane`, `recipes`
**Status**: done — issue closed, PR #58 merged

### Description

As a builder using component recipes, I want per-property modals computed within visually coherent variant clusters, so that each recipe entry describes a real set of elements instead of a chimera averaged across heterogeneous instances.

### Acceptance Criteria

- [x] Given an element class with instances, when recipes are built, then instances are first clustered by resolved background palette role (via the existing `nearestPaletteRole`), with transparent/no-background as its own cluster.
- [x] Given a cluster, when its recipe entry is computed, then `modalPadding`/`modalRadius`/`modalColorValue`/`modalType` run per cluster, unchanged in themselves.
- [x] Given the full cluster set for a class, when entries are kept, then only clusters with ≥3 instances or ≥15% share of the class survive, capped at 3 per element class, ordered by count.
- [x] Given the synthetic fixture with two visually distinct button variants, when recipes are emitted, then ≥2 Button entries appear, each with sane (non-zero where styled) padding.
- [x] Given `npm run eval`, when run after the change, then it passes with no baseline refresh.

### Technical Notes

- `lib/extract/recipes.ts` — variant key is the bg role from `lib/extract/roleMatch.ts`'s `nearestPaletteRole`; do not add a new inline role matcher.
- Reuse the modal helpers unchanged; the fix is *where* they run (per cluster), not *how*.

### As Built

- `buildRecipes` in `lib/extract/recipes.ts` clusters by `variantKey`: the bg palette role, else the normalized hex of an unmatched bg, else the `none` sentinel.
- The survival rule is `MIN_CLUSTER_INSTANCES = 3` or `MIN_CLUSTER_SHARE = 0.15`, capped at `MAX_VARIANTS_PER_ELEMENT = 3`, with a stable sort so ties keep document order.

### Dependencies

- Blocked by: DIST-025
- Blocks: DIST-027

---

## [DIST-027] Emit recipe variants with a measured `variant` label

**Type**: Enhancement
**GitHub Label**: enhancement
**Priority**: Medium
**Complexity**: Small
**Phase**: 3 (plan step 2c)
**Labels**: `tokens-lane`, `schema`
**Status**: done — issue closed, PR #59 merged

### Description

As a consumer of the report frontmatter and body, I want each recipe variant labeled by its measured background role (e.g. `Button (primary)`), so that variants are distinguishable without inventing semantics like "secondary".

### Acceptance Criteria

- [x] Given `recipeEntrySchema` (`lib/schema.ts:150`), when a variant cluster produced the entry, then an optional `variant: z.string()` field carries the bg-role-derived label (`primary`, `surface`, `transparent`).
- [x] Given `renderRecipes` in `lib/emit.ts`, when an entry has `variant`, then it renders as `**Button (primary)** — …`; entries without `variant` render byte-identical to today.
- [x] Given an old committed capture with no variant data, when the report is built, then nothing errors and no `variant` field is fabricated.

### Technical Notes

- Follows the mandatory optional-field convention from CLAUDE.md: optional schema field + conditional rendering; no faked values.
- One-line touches only; the clustering logic lands in DIST-026.

### As Built

- `variant` is optional on `recipeEntrySchema` in `lib/schema.ts` and is set only when a class kept more than one cluster; the no-background cluster is labelled `transparent`.
- `renderRecipes` in `lib/emit.ts` writes `- **Button (primary)** — …`.

### Dependencies

- Blocked by: DIST-026
- Blocks: —

---

## [DIST-028] Build the deterministic section digest (Stage 9) + schema fields

**Type**: Feature
**GitHub Label**: enhancement
**Priority**: High
**Complexity**: Large
**Phase**: 4 (plan steps 1c + 1d)
**Labels**: `structure-lane`, `schema`
**Status**: done — issue closed, PR #60 merged

### Description

As a builder planning a new site from a source site, I want an ordered, measured per-section digest (name, band, layout, contents, tokens, responsive deltas), so that the report can describe each page section once, at intent altitude.

### Acceptance Criteria

- [x] Given the metrics-annotated root + `tokenHints` + responsive deltas, when Stage 9 runs, then it emits an ordered `SectionDigest[]` — `SiteHeader`, each direct child of `MainContent`, `SiteFooter` — with a repeated group (e.g. `SectionCard ×7`) as **one** entry carrying `instances: 7`.
- [x] Given a digest entry, when populated, then `band` comes from Stage 8a region metrics, `layout` is the first multi-child flex/grid annotation found descending into the section, `contents` is a counted subtree summary (headings, paragraphs, CTAs, images, repeated groups), and `tokens`/`responsive` are joined by component names in the subtree — all measured, nothing synthesized.
- [x] Given `lib/extract/structureSchema.ts`, when extended, then `sectionDigestSchema` + optional `sections` on `structureMachineBlockSchema` + `sectionsText` on `StructureReport` are all additive and optional — old captures simply omit them without erroring.
- [x] Given a capture where a digest input (e.g. `tokenHints`, responsive deltas) is absent, when the digest builds, then the corresponding field is omitted, not guessed.
- [x] Given `npm run eval`, when run after the change, then it passes with no baseline refresh.

### Technical Notes

- New file `lib/extract/structure/sections.ts`, orchestrated from `lib/extract/structure/index.ts` after Stage 8b.
- Deterministic, measured-only — provenance stays honest per the "measured, never faked" invariant.
- `tokens` join only runs meaningfully in `both` mode (Stage 8b `tokenLink.ts` is `both`-mode-only); absent hints ⇒ omitted field.

### As Built

- Stage 9 lives in `lib/extract/structure/sections.ts`; `findDigestBands` is shared with the Stage 7 prompt so both name the same sections.
- `sectionDigestSchema` and the optional `sections` field are in `lib/extract/structureSchema.ts`; `band` keeps only the `sticky`/`fixed`/`h …`/`padY …` segments, and a section that Stage 8a did not annotate omits it.
- No identifiable `main` region yields no digest at all.

### Dependencies

- Blocked by: DIST-023, DIST-024 (digest quality depends on fixed names and squashed chains)
- Blocks: DIST-029, DIST-030, DIST-013 (#19 — the section digest is the primary scoring target for the restored eval gate)

---

## [DIST-029] Lead the structure body with `## Page sections`; demote the skeleton

**Type**: Enhancement
**GitHub Label**: enhancement
**Priority**: High
**Complexity**: Medium
**Phase**: 4 (plan step 1e)
**Labels**: `structure-lane`, `emit`
**Status**: done — issue closed, PR #61 merged

### Description

As a reader of the structure report, I want the body to open with one block per page section and push the exhaustive tree into detail/machine sections, so that the report reads as "here's the navbar pattern, here's the hero pattern" instead of a 24-node nested dump.

### Acceptance Criteria

- [x] Given a report with `sections` digests, when the body is emitted, then a new `## Page sections` section renders **first**, one block per digest.
- [x] Given the skeleton, when emitted, then it renders depth-capped (~3 levels) under `## Skeleton (detail)` (or machine-block-only), while the `skeletonAscii` *field* on `StructureReport` stays fully populated — `scoreStructure` greps it for region names.
- [x] Given the `## Components` body section, when emitted, then only `region`/`content-block`/`composite` entries appear in the body; atoms and generic containers (`FlexContainerCard` etc.) remain machine-block-only.
- [x] Given a report without `sections` (old capture), when emitted, then no `## Page sections` heading appears and the report renders without error.

### Technical Notes

- `lib/extract/structure/structureEmit.ts`; conditional rendering follows the `if (report.<field>)` convention.
- Body must stay derived from the same report object as the machine block (no-drift invariant).

### As Built

- `structureEmit.ts` renders `## Page sections` before `## Skeleton (detail)`, capped at `BODY_SKELETON_MAX_DEPTH`, while `skeletonAscii` keeps the full tree.
- `BODY_COMPONENT_TYPES` limits the body's `## Components` to `region`/`content-block`/`composite`; `sectionsText` is the same formatted string as the body block.

### Dependencies

- Blocked by: DIST-028
- Blocks: DIST-030, DIST-013 (#19)

---

## [DIST-030] AI one-line intent descriptions per section (same single call)

**Type**: Feature
**GitHub Label**: enhancement
**Priority**: Medium
**Complexity**: Medium
**Phase**: 5 (plan step 1f)
**Labels**: `structure-lane`, `ai-lane`
**Status**: done — issue closed, PR #62 merged. 1 criterion is not met.

### Description

As a reader of the structure report, I want a one-line intent description per section ("Sticky pill nav: logo left, 5 items center, CTA right"), so that each section digest opens with human intent while staying honestly labeled as AI-provenance.

### Acceptance Criteria

- [x] Given `aiStructureResponseSchema`, when extended, then it gains an optional `sectionDescriptions: Record<string, string>`.
- [x] Given the existing Stage 7 AI naming prompt, when the digest list is included alongside the compact tree, then descriptions come back in the **same single API call** — no new request is added.
- [x] Given AI descriptions are present, when digests render, then each uses the AI line and the report carries `naming: ai` provenance; given no API key or a model failure, then digests fall back to the deterministic line from DIST-028, and the measured lane is unaffected.
- [ ] Given `extractFromCapture` / `extractStructureFromCapture`, when this change lands, then neither reaches for the network or an API key (measured lane stays offline-replayable).
  - *Not met:* `extractFromCapture` stays network-free, but `extractStructureFromCapture` (`lib/analyze.ts:98`) runs the Stage 7 AI labeller whenever `OPENROUTER_API_KEY` is set, unless the caller passes `forceHeuristicNaming: true`, as `eval/run.ts` does.

### Technical Notes

- `lib/extract/structure/structureAI.ts`; keep the fallback path byte-identical to the heuristic digest output.
- Verify AI-lane stability impact with `npm run eval:ai` if the prompt change lands.

### As Built

- `sectionDescriptions` is an optional field of `aiStructureResponseSchema` in `lib/extract/structure/structureAI.ts`, returned by the one `callModel` call of Stage 7 and joined to digests by band node id.
- Without a key, or when the model fails, `naming` is `heuristic` and digests carry no `description`.
- The eval harness stays offline only because `eval/run.ts` passes `forceHeuristicNaming: true` to `extractStructureFromCapture`.

### Dependencies

- Blocked by: DIST-028, DIST-029
- Blocks: —

---

## [DIST-031] Investigate desktop h1 modal selection (26px desktop vs 34px mobile inversion)

**Type**: Bug
**GitHub Label**: bug
**Priority**: Low
**Complexity**: Medium
**Phase**: Follow-up (plan Part 3 — explicitly out of scope for this change)
**Labels**: `tokens-lane`, `typography`
**Status**: done — issue closed, PR #63 merged

### Description

As a builder trusting the typography scale, I want the desktop h1 size to reflect the page's actual primary heading, so that the report doesn't invert desktop/mobile sizes (Stripe's hero h1 is far larger than the reported 26px).

### Acceptance Criteria

- [x] Given stripe.com (or an equivalent fixture with one large hero h1 and several small h1-styled elements), when typography is extracted, then the reported desktop `h1` size reflects the dominant/hero heading, not a smaller outlier.
- [x] Given the mobile `sizePxMobile` value, when both are reported, then desktop ≥ mobile for the same heading level on a site where that is true in reality.
- [x] Given `npm run eval`, when run after the fix, then it passes — a typography score change here must be the intended result and the baseline refreshed deliberately.

### Technical Notes

- Modal selection in `lib/extract/typography.ts`; note this lane **is** scored by the eval gate, unlike the structure changes — tread per the CLAUDE.md eval workflow.

### As Built

- `lib/extract/typography.ts` anchors the `h1` token to sizes measured on real `<h1>` elements when there are any, with one slot above it and up to two below; a page with no `<h1>` keeps the frequency order.
- The fix was checked on a synthetic fixture (60px hero h1, 34px mobile), not on stripe.com.

### Dependencies

- Blocked by: —
- Blocks: —

---

## [DIST-032] Stop zero-width default borders from claiming the border palette role

**Type**: Bug
**GitHub Label**: bug
**Priority**: Low
**Complexity**: Small
**Phase**: Follow-up (plan Part 3 — explicitly out of scope for this change)
**Labels**: `tokens-lane`, `palette`
**Status**: done — issue closed, PR #64 merged

### Description

As a builder using the palette, I want the `border` role to come from borders that are actually visible, so that `#000000` from zero-width default borders doesn't get reported as the sitewide border color.

### Acceptance Criteria

- [x] Given a node with `border-width: 0` and a default border color, when colors are channel-attributed/scored, then that color contributes nothing to `borderScore`.
- [x] Given a site with real visible borders, when the palette resolves, then the `border` role reflects those borders' measured color.
- [x] Given `npm run eval`, when run after the fix, then it passes; any palette score change must be intended and the baseline refreshed deliberately.

### Technical Notes

- Likely in `borderScore` in `lib/extract/palette.ts`, or upstream in `lib/extract/styleDump.ts` border channel capture (skip zero-width borders at the dump level so all consumers benefit).

### As Built

- The fix sits upstream in `lib/extract/styleDump.ts`: the border channel takes the widest visible side's color, so a zero-width or `none` border contributes nothing to any consumer, `borderScore` included.

### Dependencies

- Blocked by: —
- Blocks: —

---

## [DIST-033] Spike: hover/focus state capture despite cross-origin CSSOM

**Type**: Spike
**GitHub Label**: spike
**Priority**: Low
**Complexity**: Medium
**Phase**: Follow-up (plan Part 3 — explicitly out of scope for this change)
**Labels**: `tokens-lane`, `states`, `ingestion`
**Status**: done — issue closed, PR #65 merged

### Description

As a builder wanting interaction-state tokens, I want a capture strategy that survives CDN-hosted stylesheets, so that `states.ts` doesn't come back empty for most production sites (cross-origin CSSOM access is silently skipped at `styleDump.ts:389-391`).

### Acceptance Criteria

- [x] Given the spike, when complete, then it documents ≥2 candidate strategies (e.g. fetching stylesheets through the Playwright context and re-parsing; forcing pseudo-state via CDP and re-reading computed styles) with their trade-offs against the "measured, never faked" invariant.
- [x] Given each candidate, when assessed, then the write-up covers: capture-shape impact on `capture.json` (fixture refresh is a big, deliberate step per CLAUDE.md), offline-replayability for eval, and failure behavior (must degrade to omitted fields).
- [x] Given the write-up, when delivered, then it ends with a recommendation and a rough implementation estimate — no production code required.

### Technical Notes

- Time-boxed investigation; output is a markdown doc in `.agents/`, not code. The plan flags this as "needs a different capture strategy; separate decision".

### As Built

- The write-up is `.agents/reports/cross-origin-states-spike.md`: three strategies (A `context.request` re-fetch, B CDP forced pseudo-state, C CDP CSS-domain text), a GO for Strategy A variant a2, and an estimate of about 1–2 days.
- Strategy A shipped later as DIST-043 (#77).

### Dependencies

- Blocked by: —
- Blocks: —

---

## Traceability

| Plan section | Story |
|---|---|
| 1a chain squash | DIST-024 |
| 1b naming fixes | DIST-023 |
| 1c section digest | DIST-028 |
| 1d schema additions | DIST-028 |
| 1e emit changes | DIST-029 |
| 1f AI pass extension | DIST-030 |
| 2a reclassify nav buttons | DIST-025 |
| 2b variant clustering | DIST-026 |
| 2c schema + emit | DIST-027 |
| Part 3 follow-up: h1 inversion | DIST-031 |
| Part 3 follow-up: border #000000 | DIST-032 |
| Part 3 follow-up: cross-origin CSSOM | DIST-033 |

Plan steps 1c and 1d are combined into DIST-028: the schema additions are a few optional fields that only make sense alongside the digest builder, and splitting them would leave neither half independently verifiable.
