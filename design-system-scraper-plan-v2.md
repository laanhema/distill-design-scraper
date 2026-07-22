# Design‑System Scraper — Build Plan

**Working title:** *Distill*
**One‑liner:** Point it at a website URL or drop in an image, and it produces a Markdown design system — palette, typography, identity (overall feel), and imageMood (Unsplash keywords) — that is both nice to read and machine‑parseable.

---

> **Two lanes, one backbone.** This tool now produces two independent kinds of output that share the same Playwright render but answer different questions:
> - a **design-system** report — palette, typography, identity, imageMood (the original lane, colour/type/feel), and
> - a **layout-structure** report — the page's regions, components, and how they nest and repeat (modularity, structure, layout — deliberately *not* colour).
>
> They are **parallel tracks**: separate `.md` deliverables, buildable independently, sharing ingestion and the same `measured` vs `inferred` philosophy. Sections tagged *(structure lane)* below belong to the new track; everything else is the token lane, unchanged.

## 1. Core idea & the central tension

The tool has to reconcile two very different kinds of output:

- **Measurable tokens** — palette, typography, spacing, radius, elevation. These can be *extracted deterministically* from a rendered page's computed styles.
- **Interpretive tokens** — `identity` (the feel) and `imageMood` (Unsplash keywords). These require *semantic judgement* and come from an AI vision model.

The architecture keeps these two lanes separate on purpose: deterministic extraction produces tokens that are **stable for a given render** (see §9 on why that's not the same as reproducible-across-time for a live URL); the AI layer only interprets. The AI never invents a hex value it could have measured, and the extractor never guesses at "vibe." Every section in the output is stamped with its **provenance** (`measured` vs `inferred`) so consumers know how much to trust it.

The **structure lane** obeys the same discipline. Geometry, containment, and repetition are *measured* from the live DOM; only the *naming and typing* of a component ("this box is a `FeatureCard`") is *inferred* by the AI, which picks from a fixed ontology and never invents structure the DOM didn't show. Same provenance split, same "AI labels, never fabricates" rule — applied to shape instead of colour.

---

## 2. Decisions locked in

| Decision | Choice |
|---|---|
| Input types | **Both** URLs and images — URL → full `design-system` report; image → lighter `palette-mood` report (§3) |
| Interpretive parts | **Hybrid**: deterministic heuristics + AI vision |
| Form factor | **Web app** with a UI |
| URL extraction depth | **Headless browser** — real computed styles **+** screenshot |
| Output consumption | **Both** human‑readable **and** machine‑parseable |
| Design‑system scope | 4 core + spacing / radius / elevation ("sensible middle") |
| Unsplash | **Keywords only** — no live image fetching |
| Deployment | **Local first**, deployable later |
| Stack | Chosen below (delegated) |
| **Report families** | **Two siblings, not merged:** token reports (`design-system` / `palette-mood`) **+** a `layout-structure` report — separate `.md` files |
| **Structure input (v1)** | **URL-only** — image/vision structure is a later phase (§11 Track B) |
| **Structure build approach** | **Parallel track** to the token lane — shared render, independent phases |
| **Structure output format** | ASCII skeleton (instances with counts) + define-once component map + machine JSON block — deliberately *not* the YAML-frontmatter shape (§3, family 2) |
| **Structure params** | Documented with **sane defaults**, all tunable later — none are baked constants (§5b) |

---

## 3. Output specification

The deliverable is a single `.md` file: **YAML frontmatter** (machine‑parseable) followed by a **human‑readable body** rendering the same data attractively. Frontmatter is the contract; the body is derived from it, so they never drift.

**Three report kinds across two families.** A top-level `reportKind` field states which product the file is, so consumers never mistake a guess for a measurement. The **token family** (`design-system`, `palette-mood`) shares the YAML schema below. The **structure family** (`layout-structure`) is a separate physical shape — an ASCII skeleton plus a JSON block — defined in *Report family 2* at the end of this section. The two token kinds:
- **`design-system`** (URL input) — the full report: measured palette, typography, spacing, radius, elevation + AI identity/imageMood.
- **`palette-mood`** (image input) — a deliberately lighter report. Type scale, spacing, radius, and elevation **can't** be measured from a photo, so they're omitted rather than faked; what remains is a measured palette plus AI identity/imageMood (and, optionally, a clearly-flagged *inferred* typography **classification** — serif/sans/mood — never a measured type scale). The UI brands this as a **"Palette & Mood"** report, not a design system, so the thinner output reads as honest scope rather than a broken full report.

### Frontmatter schema (draft)

```yaml
---
reportKind: design-system   # design-system (URL) | palette-mood (image)
source:
  type: url            # url | image
  ref: "https://example.com"
  capturedAt: "2026-07-21T10:00:00Z"

palette:
  provenance: measured
  colors:
    - name: primary
      hex: "#1A73E8"
      role: primary          # background | surface | text | primary | accent | muted | border
      usage: "buttons, links"
      areaWeight: 0.04        # share of painted screenshot pixels (extraction signal)
  contrast:                   # accessibility value-add
    - pair: ["text", "background"]
      ratio: 8.2
      wcag: "AAA"

typography:
  provenance: measured        # image reports: 'inferred' classification only, scale omitted
  families:
    - name: "Inter"
      role: body              # display | heading | body | mono
      classification: "sans-serif / geometric"
      weightsObserved: [400, 600, 700]
  scale:
    - token: h1
      sizePx: 48
      weight: 700
      lineHeight: 1.1
      letterSpacing: "-0.02em"

spacing:
  provenance: measured
  baseUnitPx: 8
  scale: [4, 8, 16, 24, 32, 48, 64]

radius:
  provenance: measured
  scale: ["4px", "8px", "16px", "9999px"]

elevation:
  provenance: measured
  shadows:
    - "0 1px 2px rgba(0,0,0,0.06)"
    - "0 8px 24px rgba(0,0,0,0.12)"

identity:
  provenance: ai
  adjectives: [minimal, editorial, calm, trustworthy]
  archetype: "The Sage — quiet authority, content-forward"
  description: "Restrained, generous whitespace, muted palette with a single confident accent."

imageMood:
  provenance: ai
  hero: ["soft morning light interior", "minimal workspace neutral tones"]
  texture: ["subtle paper grain", "matte concrete surface"]
---
```

The **body** below the frontmatter renders swatches (as hex + name), a type‑scale table, spacing/radius/elevation lists, the identity paragraph, and the Unsplash keyword lists — formatted for a human skimming it.

---

### Report family 2 — `layout-structure` *(structure lane)*

A different physical shape from the token reports, on purpose: structure is a *tree*, and a flat YAML block reads far worse than an ASCII skeleton for a human and worse than a JSON block for a machine. So this report is **three views of one componentized tree**: a skeleton (human), a define-once component map (modularity), and a JSON block (machine). The `reportKind` field keeps it a first-class sibling; the internals just fit the data.

Key locked rules: the **skeleton holds instances** (with `×count`), the **component map holds definitions** — each component defined once, so reuse is legible at a glance. Layout mechanics (`flex`/`grid`, columns, alignment) are folded into container annotations rather than a separate section. A `fidelity` field marks the whole report `measured` (DOM) or `inferred` (image, later). Granularity floors at atoms — buttons/inputs/headings, never individual spans.

````markdown
# Layout Structure — nimbus.example.com

```
source:    https://nimbus.example.com
viewport:  1440×900
captured:  2026-07-22
fidelity:  measured        # measured (DOM) | inferred (image, later)
```

## Skeleton

```
Page
├─ SiteHeader                  [flex · space-between]
│  ├─ Logo
│  ├─ NavLinks                 [flex · row]
│  │  └─ NavLink ×4
│  └─ HeaderActions            [flex · row]
│     ├─ TextLink "Sign in"
│     └─ Button (primary)
├─ main
│  ├─ Hero                     [grid · 2col: text | media]
│  │  ├─ Heading + Subhead
│  │  ├─ ButtonGroup           [flex · row]  → Button (primary) + Button (secondary)
│  │  └─ ProductImage
│  ├─ LogoBar                  [flex · row · wrap]  → Logo ×5
│  ├─ FeatureGrid              [grid · 3col × 2row]  → FeatureCard ×6
│  ├─ TestimonialSection       [grid · 3col]         → TestimonialCard ×3
│  ├─ PricingSection           [grid · 3col]         → PricingTier ×3
│  └─ CtaBand                  [stack · centered · full-bleed]  → Heading + Button (primary)
└─ SiteFooter                  [grid · 4col]  → FooterColumn ×4 + FooterBottom
```

## Components

Each component is defined once; the skeleton holds the instances.

### Button `atom`
- role: primary/secondary action trigger
- composition: `[icon?] + Label`
- variants: primary, secondary
- instances: 5

### FeatureCard `content-block`
- role: names and describes one product capability
- composition: `Icon + Heading + Body`
- instances: 6 (FeatureGrid) — all identical → single definition

### PricingTier `content-block · composite`
- role: one pricing plan
- composition: `TierName + Price + FeatureList(TextItem ×n) + Button`
- instances: 3 — middle carries a `variance: featured` emphasis flag

## Machine block

```json
{
  "reportKind": "layout-structure",
  "source": "https://nimbus.example.com",
  "viewport": [1440, 900],
  "fidelity": "measured",
  "tree": [
    { "component": "SiteHeader", "children": [
      { "component": "Logo" },
      { "component": "NavLinks", "children": [{ "component": "NavLink", "count": 4 }] },
      { "component": "HeaderActions", "children": [
        { "component": "TextLink" },
        { "component": "Button", "variant": "primary" }
      ]}
    ]},
    { "component": "FeatureGrid", "children": [{ "component": "FeatureCard", "count": 6 }] },
    { "component": "PricingSection", "children": [{ "component": "PricingTier", "count": 3, "variance": "featured@1" }] }
  ],
  "components": {
    "Button":      { "type": "atom", "composition": ["icon?", "Label"], "variants": ["primary", "secondary"] },
    "FeatureCard": { "type": "content-block", "composition": ["Icon", "Heading", "Body"] },
    "PricingTier": { "type": "content-block", "composition": ["TierName", "Price", "FeatureList", "Button"] }
  }
}
```
````

---

## 4. Architecture

A single full‑stack app, four logical modules:

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (React / Tailwind)                             │
│   • URL input + image dropzone                           │
│   • Live status, then preview + Copy / Download .md      │
└───────────────┬─────────────────────────────────────────┘
                │  POST /api/analyze  (url | image)
┌───────────────▼─────────────────────────────────────────┐
│  Backend route (Node runtime)                            │
│                                                          │
│  1. Ingestion       → Playwright (URL) | Sharp (image)   │
│  2. Extraction      → deterministic tokens               │
│  3. Interpretation  → Claude vision (identity/imageMood) │
│  4. Emit            → merge → YAML+Markdown              │
└──────────────────────────────────────────────────────────┘
```

### Module responsibilities

**1. Ingestion**
- *URL:* Playwright (headless Chromium) navigates, waits for network‑idle, best‑effort dismiss of cookie/consent banners, captures a viewport **and** full‑page screenshot, and exposes the live DOM for style reads.
- *Image:* loaded via Sharp; normalized (resize/orient) for pixel analysis and passed to the vision model.

**2. Extraction (deterministic)** — see §5.

**3. Interpretation (AI)** — see §6.

**4. Emit** — merges measured tokens + AI interpretation into the schema, validates with Zod, serializes frontmatter with `js-yaml`, then templates the human body.

---

### Structure lane — parallel modules *(structure lane)*

The structure lane **reuses Ingestion** (one Playwright navigation can serve both lanes) and adds its own chain, mirroring the token lane but operating on the DOM tree and geometry rather than colour:

- **Structure extraction** → harvest annotated nodes, prune, collapse wrappers, detect repetition, type against the ontology (deterministic — §5b).
- **Componentization + AI labelling** → dedupe instances into definitions; the AI names/labels components from the fixed ontology, never altering shape (§6).
- **Structure emit** → render the skeleton + component map + JSON block (§3, family 2).

The analyze route branches on which report(s) the request asked for; the two lanes never block each other, and a request for both reuses the single render.

---

## 5. Extraction engine (the measurable lane)

### Palette
- **URL:** walk visible DOM nodes; read `color`, `background-color`, `border-color`, `fill`, `stroke` via `getComputedStyle`. The DOM tells us **which** colors exist and **which channel** each came from; the **screenshot tells us how much area each occupies** (see below). This split is deliberate — DOM geometry can't cheaply answer "how much of the page is actually this color" once elements overlap and occlude each other.
- **Image:** `node-vibrant` + a k‑means pass on pixels.
- **Accessibility:** compute WCAG contrast ratios for key pairs (text‑on‑background, primary‑on‑background) and label AA/AAA. Genuine value‑add and cheap to add.

#### `areaWeight` — measured from painted pixels, not DOM boxes

Summing `getBoundingClientRect` areas double-counts every stacked/occluded element and systematically over-weights container backgrounds. So area weight is derived from the **screenshot**, which is ground truth for what's actually painted — occlusion resolves itself because a covered element simply isn't in the pixels.

1. Take the captured screenshot (already needed for the pixel cross-check).
2. For each pixel, find the nearest **DOM-derived canonical color** (the de-duplicated set produced by Stage B of role assignment, below) in Lab space. If it's within a **ΔE tolerance**, credit that color's pixel count; if it's far from *every* DOM color, it's a **gradient/image color CSS missed** — bucket it separately and surface it as an image-sourced swatch.
3. `areaWeight` = a color's credited pixel count ÷ total pixels.

This makes the screenshot pixel pass do double duty: it's both the gradient/image backstop *and* the area-weight source, so there's one coherent notion of "how present" a color is. **Caveat, stated honestly:** text and icons are area-tiny but semantically important — so `text`/`border`/`accent` roles must *not* be gated on raw `areaWeight` (their scoring in Stage C leans on channel + contrast + frequency instead); area weight is decisive mainly for `background`/`surface`.

> **Ordering note.** Colors are clustered by appearance *first* (Stage B, below), then pixels are credited to the surviving canonical colors — so "merge" and "area weight" aren't circular: the merge needs no areas, and the areas are assigned to the merged set afterward.

#### Role assignment (the hard part) — a staged pipeline

This is the single hardest sub-problem in the build, so it gets an explicit algorithm rather than a heuristic hand-wave. It runs on the **rendered state only** — roles are assigned from what is actually painted in the captured viewport, and unused theme variants sitting in the stylesheets are ignored. Color math via `culori`; all comparisons in **OKLCH/Lab**, never raw RGB.

**Stage A — Collect & attribute.** For each visible node, record every color it contributes *and the channel it came from*: `background-color` (fill), `color` (text), `border-color` (border), `fill`/`stroke` (icon/vector). The channel is a strong prior — a color used as `color` on text is a `text` candidate, not a `background` candidate — so we never pool all colors into one undifferentiated bucket.

**Stage B — Merge near-duplicates.** Collapse hexes within a perceptual-distance threshold (**ΔE ≈ 2–3**) into a single canonical color, unioning their channel usages; the survivor then takes its `areaWeight` from the pixel pass above (clustering needs no area data, so there's no circularity). This kills the "247 shades of grey" problem before roles are ever considered. CSS variables need no special handling — after resolution they're just repeated identical values, which merge for free.

**Stage C — Score each merged color per role.** Instead of first-match wins, compute a score for every (color, role) pair, so ambiguous colors are resolved by comparison rather than order:
- `background` / `surface`: high total **background-channel area**; near-neutral chroma; the two largest such areas → `background` (largest) and `surface` (second, if perceptually distinct).
- `text`: high **text-channel** frequency; high WCAG contrast against the chosen `background`; usually near-neutral.
- `primary` / `accent`: highest **chroma** among recurring non-neutrals that appear on interactive/CTA-ish elements (buttons, links); `primary` = most-used such color, `accent` = second distinct one.
- `muted` / `border`: low chroma, low individual area, appearing predominantly on the border channel or as secondary text.

**Stage D — Resolve conflicts by best score, with guardrails.** Assign each role to its top-scoring color under hard constraints: `text` must clear a **minimum contrast** vs `background` (else fall back to the darkest/lightest sufficiently-contrasting color); `background` and `surface` must be perceptually distinct or `surface` is dropped; a color already taken as `background` can't also win `text`.

**Stage E — AI refinement (labels only, never values).** Hand the AI the *already-decided* palette (hexes + provisional roles + the screenshot) and let it correct **role labels only** — e.g. "the color you called `accent` is actually the brand `primary`." It can relabel, never introduce or alter a hex. Disagreements are logged so the eval harness (§10) can measure how often the AI overrides the heuristic and whether that helps.

This whole pipeline is exactly what the §10 role-label accuracy metric scores, so each stage can be tuned against the corpus rather than by eye.

### Typography
- **URL (measured):** collect `font-family`, `font-size`, `font-weight`, `line-height`, `letter-spacing` per element; resolve font stacks to the *first available* family; dedupe into families with observed weight sets; cluster sizes into a **type scale** (display/heading/body/small) and map to `h1…small` tokens.
- **Image (inferred):** exact fonts are **not** recoverable from a photo. The AI classifies (serif/sans/mono, geometric/humanist, mood) and *suggests* pairings. Marked `provenance: inferred` — never presented as measured.

### Spacing / Radius / Elevation
- Collect distinct `margin`/`padding`/`gap` values → infer a **base unit** (commonly 4 or 8px) and a clean scale by snapping to the nearest multiples.
- Collect distinct `border-radius` values → radius scale (including pill/`9999px`).
- Collect distinct `box-shadow` values → elevation set.
- For **image** inputs these are usually not reliably measurable and are **omitted** (or AI‑suggested and clearly flagged), rather than faked.

---

## 5b. Structure extraction engine *(structure lane)*

Parallel to §5, but it reads **shape** instead of colour. One linear pipeline turns a live URL into the `layout-structure` format; each stage hands a cleaner tree to the next. **Every tunable below ships with a sane default and is meant to be adjusted against the corpus later — none are load-bearing constants.**

**Stage 1 — Render.** Reuse the token lane's Playwright render (default viewport **1440×900**), network-idle + short settle, optional auto-scroll to mount lazy content. The screenshot is kept for reference; the work is on the live DOM.

**Stage 2 — Harvest.** One `page.evaluate` walks the DOM and emits a flat record per element: **identity** (tag, ARIA role, semantic landmark), **geometry** (`getBoundingClientRect` → x/y/w/h), **layout** (computed `display`; for flex/grid: direction, `justify-content`, column count), **content flags** (has-text? image/svg? link/button/input?), and a **repetition signature** — a hash of `tag + immediate-child-tag-sequence + bucketed w×h`. The signature is computed in-page while the DOM is live.

**Stage 3 — Prune.** Drop what can't be a component: zero-size boxes, `display:none`, script/style/meta, off-screen nodes below a generous fold cutoff. Typically removes 60–70% of nodes.

**Stage 4 — Collapse wrappers.** Recursively remove single-child containers that add nesting but no layout meaning (no flex/grid, no background, no border) — the classic `<div><div><div>…` towers. A wrapper earns its place only if it establishes layout or groups multiple children. This is what turns DOM soup into a tree that reads like the skeleton.

**Stage 5 — Detect repetition.** Within each container, group children by signature; 2+ matches → instances of one repeated component, and the container becomes a collection (FeatureGrid, TestimonialSection). This produces the `×6` counts and, downstream, the define-once modularity. A near-match (same structure, one extra child — the "featured" pricing tier) is tagged as a `variance`.

**Stage 6 — Type against the ontology.** Heuristics assign each node a provisional type from the fixed vocabulary: landmarks → `region`, flex/grid multi-child → `container`, repeated leaf-ish units → `content-block`, link/button/input/heading/image → `atom`. Deliberately rough — it just narrows the space for the AI.

**Stage 7 — AI labelling (§6).** The pruned, typed, deduped tree (compact JSON, not HTML) goes to the SDK: name each component, confirm/correct its type from the ontology, write the one-line composition string. It picks from the fixed list and names — it does **not** invent structure, since structure is already measured. Keeps `fidelity: measured` honest.

**Stage 8 — Emit.** One walk renders the skeleton, one the deduped component map, one the JSON block — the three views of §3, family 2.

### Component ontology (the fixed vocabulary)

The AI labels *into* this set so runs stay consistent instead of inventing labels:
- **layout primitives** — Container, Section, Grid, Stack
- **navigation** — Navbar, Sidebar, Tabs, Breadcrumb, Pagination
- **content blocks** — Hero, Card, MediaObject, Feature, Testimonial, FAQ, CTA
- **form atoms** — Input, Button, Field

The **type axis** (`atom` / `container` / `content-block` / `region` / `composite`) is provisional; swapping to atomic-design tiers (atom/molecule/organism) is a §13 open question.

### Tunable parameters — defaults

Documented so they're visible and adjustable; **start here, tune against the corpus.**

| Param | Sane default | Trades off |
|---|---|---|
| Render viewport | 1440×900 | Desktop width only (breakpoint diffing deferred, §13) |
| Fold cutoff (prune) | full-page after auto-scroll | Too tight drops real content; too loose keeps footer junk |
| Wrapper-collapse aggressiveness | conservative — pure pass-through wrappers only | Too aggressive merges distinct blocks; too timid leaves div-soup |
| Repetition signature bucketing | ±10% on box dimensions | Too tight misses ragged grids; too loose merges unrelated blocks |
| Repetition threshold | ≥2 matching siblings | Higher misses pairs; lower over-groups |
| Granularity floor | atoms (Button/Icon/Heading); no spans/text-runs | Deeper = noise; shallower = loses real components |

The **wrapper-collapse rule** and **signature bucketing** are where fidelity is won or lost — both are the kind of knob you only calibrate on real pages, which is why the structure eval (§10) is built alongside the extractor, not after.

---

## 6. Interpretation engine (the AI lane)

Only `identity`, `imageMood`, and *refinements* (color role labels, image‑only type classification) go through the model. The model receives:

1. The **screenshot(s)**, and
2. A **compact JSON summary** of the already‑measured tokens (so its read of "the feel" is grounded in the real palette/type, not just pixels).

It must return **strict JSON** (no prose), validated by **Zod**; on validation failure, one repair retry, then a graceful fallback. Prompt design goals:

- `identity`: 3–6 adjectives, a one‑line archetype, and a 1–2 sentence description.
- `imageMood`: two keyword sets — `hero` (main imagery) and `texture` (backgrounds/overlays) — phrased as **real Unsplash search queries**, concrete and photographable (e.g. "soft morning light interior"), not abstract ("innovation").
- Determinism: low temperature; the measured tokens anchor the output so runs on the **same captured render** are stable (not a promise about a live URL re-rendered later — see §9).

Model: Claude (vision‑capable) via `@anthropic-ai/sdk`.

**Structure lane's AI pass** *(structure lane)* is narrower and **text-only** — no vision needed, because the tree is already measured. Given the compact JSON tree, it returns, per node, a component `name`, a `type` chosen from the §5b ontology, and a one-line `composition` string. Same strict-JSON + Zod + one-repair-retry contract as above. It may relabel and name; it may **never** add, drop, or move a node.

---

## 7. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router)** | One codebase for UI + API; trivial local dev; containerizes for deploy |
| UI | **React + Tailwind** | Fast to build the swatch/type preview |
| Rendering | **Playwright** (Chromium) | Real computed styles + screenshots; robust waits |
| Image processing | **Sharp** + **node-vibrant** | Normalize + pixel palette |
| Color math | **culori** (or chroma‑js) | Role logic + WCAG contrast |
| AI | **@anthropic-ai/sdk** | Vision interpretation |
| Validation | **Zod** | Guards the AI's JSON and the final schema |
| YAML | **js-yaml** | Frontmatter serialize/parse |

> Note: Playwright needs the **Node runtime** (not Edge) and system Chromium, so the analyze route runs server‑side and, when deployed, ships in a container — not pure serverless.

> **Structure lane adds no new heavy deps** *(structure lane)* — it reuses **Playwright** (render + `page.evaluate` harvest), the **Anthropic SDK** (labelling), and **Zod** (tree validation). No Sharp / node-vibrant / culori on this lane; it never touches colour.

---

## 8. Request pipeline (end to end)

**URL**
1. UI posts the URL → analyze route.
2. Playwright renders, dismisses banners, screenshots (viewport + full page).
3. Extract palette / typography / spacing / radius / elevation from computed styles (+ pixel cross‑check).
4. Send screenshot + token summary to Claude → `identity`, `imageMood`, role refinements.
5. Validate, merge, build YAML + Markdown.
6. Return to UI → live preview, **Copy** and **Download .md**.

**Image** → `reportKind: palette-mood`
1. UI uploads image → analyze route.
2. Sharp normalizes; node‑vibrant/k‑means palette (measured).
3. Claude → `identity` + `imageMood`, grounded on the measured palette. *Optional:* a clearly-`inferred` typography **classification** (serif/sans/mono, mood) as a suggestion — never a measured scale.
4. Typography scale, spacing, radius, elevation **omitted** (unmeasurable from a photo — not faked).
5. Same emit + return path; UI presents it as a "Palette & Mood" report.

---

**Structure (URL)** → `reportKind: layout-structure` *(structure lane)*
1. UI posts the URL (structure report requested) → analyze route.
2. Playwright renders — shared with the token lane if both reports were asked for.
3. Harvest → prune → collapse wrappers → detect repetition → type (§5b, all measured).
4. Send the compact typed tree to Claude → component names / types / composition (labels only).
5. Validate, dedupe into definitions + instances, emit skeleton + component map + JSON block.
6. Return to UI → live preview, **Copy** and **Download .md**.

---

## 9. Edge cases & honest caveats

- **Fonts from images can't be measured** — always inferred, always flagged.
- **Dynamic / lazy sites** — need network‑idle waits, scroll‑to‑load, generous timeouts.
- **Consent & anti‑bot walls** — best‑effort banner dismissal; some sites will block headless. Surface a clear error, don't fake results.
- **Gradients / background images** — CSS reads miss these; the screenshot pixel cross‑check backstops palette.
- **Sprawling palettes** — de‑noise: cap to N roles, merge near‑duplicate hexes by perceptual distance (the §5 Stage B merge).
- **AI JSON drift** — Zod + one repair retry + fallback.
- **Wrapper-collapse fidelity (structure)** — the collapse rule is where the tree is won or lost; default conservative, tuned against the corpus, never a fixed constant.
- **Repetition false-groups / misses (structure)** — signature bucketing controls sensitivity; ragged real grids vs. coincidentally-similar blocks are the two failure directions.
- **SPA hydration timing (structure)** — client-rendered trees need the same network-idle + settle (and occasionally an interaction) as the token lane, or the harvest sees an empty skeleton.
- **Image structure is inferred, and deferred** — v1 is URL-only; a photo has no DOM, so image structure will be vision-only `fidelity: inferred` when it lands (§11 Track B, Phase S5).
- **Determinism vs. reproducibility (don't conflate them):**
  - *Determinism within a render* **is** guaranteed and is a real selling point: given one captured DOM + screenshot, the measured lane emits byte-identical tokens every time, and the AI lane is anchored on those tokens at low temperature.
  - *Reproducibility across time for a URL* is **not** guaranteed — the site itself is the moving part; it can redeploy, A/B-test, or geo-vary between runs. We don't promise "same URL → same tokens forever."
  - **Caching is a cost/latency optimization, not a reproducibility guarantee.** Cache key = hash of the *captured artifacts* (screenshot + extracted DOM style dump), not the bare URL — an image input hashes stably; a URL is re-fetched when its cache entry expires under a **TTL** (or on force-refresh). This gives cheap re-runs without ever silently serving a stale reading of a page that has since changed.

---

## 10. Evaluation strategy

Output quality here is heuristic-heavy and partly subjective, so the project needs an instrument to tell whether a change to the role heuristic (or a prompt tweak) made results *better or worse*. This is not polish — it lands in Phase 1 and gates the extraction modules in CI.

### The corpus
A fixed set of **~15–20 reference sites**, checked into the repo, each paired with a hand-authored `expected.yaml`. Chosen to span the real failure modes, not just easy wins:

| Bucket | Examples | What it stresses |
|---|---|---|
| Clean design systems | Stripe, Linear, Vercel | Regression floor — should be near-perfect |
| Content-heavy / editorial | a news site, a blog | Palette de-noising, sprawling type |
| Dark-mode default | — | "largest-area dark → background" not mislabeling everything |
| CSS-variable / theme-switched | — | Role assignment under indirection |
| Gradient / hero-image | — | Pixel cross-check backstop for colors CSS misses |
| Hostile (consent wall, anti-bot) | — | Expected outcome is a **clean error**, not fabricated tokens |

### Scoring — split by lane
- **Measured lane (objective).** Diff extracted tokens against `expected.yaml`:
  - *Palette:* perceptual distance (**ΔE in Lab**) with a tolerance — never exact-hex match.
  - *Roles:* label accuracy — did `primary` land on the real primary, `background` on the real background?
  - *Type scale:* size-bucket overlap against expected `h1…small`.
  - These roll up to a **numeric regression score that must not drop between commits.**
- **AI lane (subjective).** No "correct" answer exists, so use **stability as the proxy**: run each input 3× and assert the `identity.adjectives` set and `archetype` are consistent (Jaccard overlap above a threshold). Catches temperature/prompt regressions without a golden label.

### Scoring — structure lane *(structure lane)*
Structure gets its own objective diffs against a hand-authored `expected.structure.md` (its JSON block) per corpus site:
- **Tree-shape accuracy** — does the emitted skeleton match expected regions/containment (normalized tree-edit distance)?
- **Component-count accuracy** — the right number of instances per repeated component (did the 6-card grid come back as 6)?
- **Repetition precision/recall** — were repeated units correctly grouped (precision: no false groups; recall: no missed instances)?
- **Type/label agreement** — did components get the expected ontology type/name, with AI relabels logged (as in the token lane's Stage E)?

These roll into a **structure regression score that must not drop between commits**, exactly like the token score. The AI-labelling pass gets the same stability check (run 3×, assert consistent names/types). The corpus is shared with the token lane — the same ~15–20 sites, with structure `expected` files added.

### How it runs
`npm run eval` renders each corpus site **once** (screenshots cached to disk, so subsequent runs are offline and cheap), runs extraction, diffs against `expected.yaml`, and prints per-site + aggregate scores. Wired into CI over the extraction modules.

---

## 11. Build phases

Two **parallel tracks** that **share Phase 0** (the render skeleton) and then progress independently — either can move without waiting on the other. Track A is the existing token lane; Track B is the structure lane.

### Track A — Tokens

**Phase 0 — Skeleton** *(shared with Track B)*
Next.js app, URL input, Playwright screenshot round‑trips to the browser. Prove the render path.

**Phase 1 — Measured tokens (MVP) + eval harness**
Palette (URL, area‑weighted + roles + WCAG) and typography scale. Emit YAML+Markdown with a readable preview and Download. **Stand up the eval corpus (§10) and `npm run eval` alongside the extractor** — the two are built together, so every heuristic tweak from here on is measured, not guessed.

**Phase 2 — AI lane**
Wire Claude for `identity` + `imageMood`; feed measured tokens as grounding; Zod‑validate.

**Phase 3 — Image input ("Palette & Mood" report)**
Sharp + node‑vibrant palette; AI identity/imageMood; emit `reportKind: palette-mood` with type/spacing/radius/elevation omitted (not faked). UI brands it as a lighter "Palette & Mood" report so the reduced scope reads as honesty, not breakage.

**Phase 4 — Widen scope**
Spacing, radius, elevation extraction and de‑noising.

**Phase 5 — Polish & deploy**
Caching, error UX, cookie‑banner handling, container image, deploy to a container host (Fly.io / Render / Railway). Add a job queue only if concurrency demands it.

### Track B — Structure *(parallel; URL-only in v1)*

**Phase S0 — Skeleton** *(shared Phase 0)* — same render skeleton as Track A.

**Phase S1 — Harvest + clean**
`page.evaluate` node harvest, prune, wrapper-collapse. Output: a clean annotated tree for one URL. Prove the div-soup → readable-tree path on 3–4 real sites before polishing any single stage.

**Phase S2 — Repetition + ontology + emit + eval**
Signature grouping, provisional typing, dedupe into definitions/instances, emit the locked format (skeleton + component map + JSON). **Stand up the structure eval (§10) alongside** — every param tweak measured, not guessed.

**Phase S3 — AI labelling**
Wire the constrained, text-only SDK pass for names/types/composition; Zod-validate; log relabels.

**Phase S4 — Param tuning**
Calibrate the §5b defaults (collapse aggressiveness, bucketing, granularity floor) against the corpus.

**Phase S5 — Image structure (later)**
Vision-only structure from a screenshot, `fidelity: inferred`, branded as the lighter product — mirroring how the token lane treats image input.

---

## 12. Risks

- **Headless blocking** on some sites — mitigate with realistic UA/viewport; accept that a minority will fail.
- **Playwright in production** — heavier than typical serverless; the container path handles it.
- **AI cost/latency** at scale — cache aggressively; keep the AI payload compact (summary + one downsized screenshot).
- **Palette role mislabeling** on busy pages — mitigated by the staged, channel-aware, score-based pipeline (§5) and measured directly by the §10 role-label accuracy metric; expose roles as editable in the UI later as a final backstop.
- **Over/under-collapsing the tree (structure)** — mitigated by conservative defaults + the §10 tree-shape metric; params are tunable, not baked.
- **Repetition false-groups (structure)** — measured directly by the §10 precision/recall metric; tune bucketing against the corpus.
- **SPA render timing (structure)** — shared with the token lane's dynamic-site handling (network-idle, scroll, generous timeouts).

---

## 13. Deferred decisions (safe to settle during build)

*Structure lane:*
- **Component vocabulary** — the current `atom` / `container` / `content-block` / `region` / `composite` axis vs. atomic-design tiers (atom/molecule/organism).
- **Responsive / multi-breakpoint diffing** — render at 2–3 widths and diff how the layout reflows (grid → stacked); URL-only, genuinely useful, but v2.
- **Variance handling threshold** — when a near-match becomes its own component vs. a `variance` note on the existing one.
- **Granularity depth cap** — how deep the tree goes before it's noise.

*Token lane:*

- Exact number of palette roles surfaced (suggest 6–8).
- Whether the UI lets users **edit** tokens before export.
- Multi‑page crawl vs single URL (start single).
- History / saved runs (nice‑to‑have once deployed).
