# Plan: Big-Picture Structure Report + Recipe Variant Clustering

**Date:** 2026-07-23
**Status:** Draft — not yet implemented

## Background & goal

Distill's purpose is to produce **practical reference documents** for building a *new* website inspired by a source site — not a 1:1 replica blueprint. An external evaluation of the stripe.com outputs (`.agents/temp/distill-evaluation.md`) plus a review against the codebase surfaced two core problems measured against that goal:

1. **The structure report is written at the wrong altitude.** The skeleton walks 24 pseudo-components across 5+ levels of nesting (`Hero → Hero [grid · 1col] → Hero [grid · 12col]`, `FlexContainerCard ×25`, `SpanCard ×11`). Everything a builder needs is in there, but nothing reads as "here's the navbar pattern, here's the hero pattern." The target format is a per-section big-picture spec in the style of the build-a-website skill's *Component Architecture* section: ~5–10 page sections, each described **once** in terms of intent — layout, contents, tokens, behavior.
2. **Component recipes are modal-averaged across heterogeneous instances.** Pooling every `<button>` sitewide and taking per-property modes *independently* produced `Button: padding 0px, bg #e8e9ff` — a recipe describing no button that exists. Recipes are precisely the reusable part of the output for the project goal, so this matters most.

**Eval-safety note:** the eval gate only scores palette and typography (`eval/run.ts:53-54`; `scoreStructure` is called without an `expected` spec so it always returns 1.0, and neither corpus fixture carries structure expectations). The structure reshape and recipe changes are free to change output shape — palette/typography scores just must hold.

---

## Part 1 — "Page sections" narrative in the structure report

**Goal:** the human-readable body leads with per-section specs; the exhaustive tree survives only in the machine block.

Target shape for stripe.com (illustrative):

```markdown
### Navbar
Sticky top bar, full-width. Logo left · 5 nav items center (4 with dropdown
panels) · Sign in + CTA right. bg=background, text=text.

### Hero
~100vh, 12-col grid: left column = eyebrow stat + h1 (display, weight 300)
+ subhead + CTA pair (primary button + text link); right column = large
product graphic. Collapses to single column on mobile.

### LogoCloud
Horizontal band of ~28 partner logos, center-aligned, muted.

### FeatureSection ×7
Repeating rhythm: heading + short paragraph, then an illustrated product
demo card. gap=64px between sections.

### Footer
bg=surface. 12-col grid → 4col on mobile: 4 link columns + locale selector
+ copyright row.
```

### 1a. New Stage 4b — chain squash

**File:** `lib/extract/structure/pruner.ts` (or a small new `squash.ts`)

The current collapse rule (`pruner.ts:52-65`) exempts any flex/grid wrapper from collapsing, which is what preserves single-child `Hero → Hero → Hero` chains. Add a post-pass: a single-child node whose child is also a generic layout container (no landmark, not interactive, not a semantic tag) merges with it, keeping:

- the more specific layout annotation (`grid · Ncol` beats `grid · 1col` beats `flex · row` beats none), and
- the outer node's landmark, if any.

Run it after `pruneAndCollapse`, before `detectRepetition` (`structure/index.ts:69-75`).

### 1b. Naming fixes

**File:** `lib/extract/structure/ontology.ts`

- **Root must never be "Hero".** `isHeroSection` (line 145) names *any* div/section containing an h1 above y=900 "Hero" — including `document.body`, which is why the whole stripe.com skeleton is rooted at a component called `Hero` with 4 bogus instances. Pass depth into `formatDefaultName` and name the depth-0 node `Page`.
- **Restrict the `*Card` suffix** (line 75) to repeated units that plausibly are cards: tag in `div/section/article/li` **and** the unit has children or mixed text+image content. Repeated bare spans/`li`s keep their base name — no more `SpanCard ×11` (the animated GDP-counter digits) or `LiCard`.

### 1c. New Stage 9 — section digest

**File:** `lib/extract/structure/sections.ts` (new)

Deterministic, measured-only (provenance stays honest). Input: the metrics-annotated root + `tokenHints` + `responsive` deltas. Output: ordered `SectionDigest[]`, one per top-level band — `SiteHeader`, each direct child of `MainContent` (hero, logo cloud, the `SectionCard ×7` group as **one** entry with `instances: 7`), `SiteFooter`. Each digest carries:

| Field | Source |
|---|---|
| `name`, `ordinal`, `instances` | node + repetition counts |
| `band` | region-metrics annotation (`h 100vh` / `padY 64px` / `sticky`) — Stage 8a already computes this |
| `layout` | first multi-child flex/grid annotation found descending into the section (the real content grid, past squashed wrappers) |
| `contents` | counted subtree summary: headings, paragraphs, buttons/links (CtaRow presence), images, repeated groups ("28 logo items") |
| `tokens` | joined from Stage 8b `tokenHints` by component names in the subtree |
| `responsive` | joined from Stage 7b deltas by component names in the subtree |

### 1d. Schema additions

**File:** `lib/extract/structureSchema.ts`

- `sectionDigestSchema`, optional `sections` field on `structureMachineBlockSchema`.
- `sectionsText` field on `StructureReport`.

Both additive and optional, per the project's optional-field convention — old captures simply omit them.

### 1e. Emit changes

**File:** `lib/extract/structure/structureEmit.ts`

- New `## Page sections` body section rendered **first**, one block per digest.
- Demote the skeleton: render depth-capped (~3 levels) under `## Skeleton (detail)`, or keep it machine-block-only. The `skeletonAscii` *field* on `StructureReport` stays fully populated (nothing downstream breaks; `scoreStructure` greps it for region names).
- `## Components` body section keeps only `region` / `content-block` / `composite` entries; atoms and generic containers (`FlexContainerCard` etc.) stay machine-block-only.

### 1f. AI pass extension

**File:** `lib/extract/structure/structureAI.ts`

- Add optional `sectionDescriptions: Record<string, string>` to `aiStructureResponseSchema`.
- Include the digest list in the existing prompt alongside the compact tree; ask for a one-line intent description per section ("Sticky pill nav: logo left, 5 items center, CTA right"). **Same single API call, no new request.**
- When present, digests render with the AI line (the report already carries `naming: ai` to label provenance); heuristic fallback = the deterministic digest line from 1c.

---

## Part 2 — Recipe variant clustering

**File:** `lib/extract/recipes.ts` (+ one-line schema/emit touches)

### 2a. Reclassify nav buttons

`classify()` routes only `<a inNav>` to NavItem (`recipes.ts:26`). Extend to `<button>` with `inNav` — verify `styleDump.ts` sets `inNav` for buttons; if not, add it in the dump walk. This alone removes the dropdown-trigger pollution behind `Button: padding 0px`.

### 2b. Cluster within element class before taking modals

- Variant key = resolved background palette role via the existing `nearestPaletteRole` (transparent/no-bg is its own cluster).
- Compute modal properties **per cluster**, reusing `modalPadding` / `modalRadius` / `modalColorValue` / `modalType` unchanged.
- Keep clusters with ≥3 instances or ≥15% share of the class, cap 3 per element, ordered by count.

This fixes the independent-modes problem: each entry describes a coherent set of real elements instead of a chimera.

### 2c. Schema + emit

- `recipeEntrySchema` (`lib/schema.ts:150`) gains optional `variant: z.string()` — the bg-role-derived label (`primary`, `surface`, `transparent`). Measured naming only; no invented "secondary" semantics.
- `renderRecipes` in `lib/emit.ts` prints `**Button (primary)** — …`. Entries without `variant` render exactly as today.

---

## Part 3 — Follow-ups (tracked, not in this change)

- **Desktop `h1: 26px` vs mobile `34px` inversion** — the desktop h1 measurement grabs the wrong element (Stripe's hero h1 is far larger); investigate modal selection in `lib/extract/typography.ts`.
- **`border: #000000` as sitewide border color** — likely counting default border colors on zero-width borders in `borderScore` (`lib/extract/palette.ts`).
- **Cross-origin CSSOM defeats `states.ts` on real sites** — `styleDump.ts:389-391` silently skips CDN stylesheets, so hover/focus states come back empty for most production sites. Needs a different capture strategy; separate decision.

---

## Verification

1. `npm run typecheck` + `npm run lint` after each part.
2. `npm run eval` — must pass untouched (palette/typography unaffected; no baseline refresh expected).
3. Synthetic fixture per the CLAUDE.md pattern: local `http.createServer` page with a nav (dropdown `<button>`s + links), a hero with wrapper-chain nesting, a repeated card section, and two visually distinct button variants. Assert the emitted markdown has a `## Page sections` block, no root `Hero`, no `SpanCard`, and ≥2 Button recipe variants with sane padding. Run with `npx tsx` from project root; delete the script after.
4. One live re-run against stripe.com to eyeball the new report side-by-side with the current output.

## Implementation order

Each step independently verifiable:

1. **1b** naming fixes (smallest, kills the worst artifacts)
2. **1a** chain squash
3. **2a → 2b → 2c** recipe variants
4. **1c → 1d → 1e** section digest + schema + emit
5. **1f** AI section descriptions

Work on a feature branch per the repo's git policy (no commits/pushes unless asked).
