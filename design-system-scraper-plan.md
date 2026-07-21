# Design‑System Scraper — Build Plan

**Working title:** *Distill*
**One‑liner:** Point it at a website URL or drop in an image, and it produces a Markdown design system — palette, typography, identity (overall feel), and imageMood (Unsplash keywords) — that is both nice to read and machine‑parseable.

---

## 1. Core idea & the central tension

The tool has to reconcile two very different kinds of output:

- **Measurable tokens** — palette, typography, spacing, radius, elevation. These can be *extracted deterministically* from a rendered page's computed styles.
- **Interpretive tokens** — `identity` (the feel) and `imageMood` (Unsplash keywords). These require *semantic judgement* and come from an AI vision model.

The architecture keeps these two lanes separate on purpose: deterministic extraction produces tokens that are **stable for a given render** (see §9 on why that's not the same as reproducible-across-time for a live URL); the AI layer only interprets. The AI never invents a hex value it could have measured, and the extractor never guesses at "vibe." Every section in the output is stamped with its **provenance** (`measured` vs `inferred`) so consumers know how much to trust it.

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

---

## 3. Output specification

The deliverable is a single `.md` file: **YAML frontmatter** (machine‑parseable) followed by a **human‑readable body** rendering the same data attractively. Frontmatter is the contract; the body is derived from it, so they never drift.

**Two report kinds, one schema.** A top-level `reportKind` field states which product the file is, so consumers never mistake a guess for a measurement:
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

## 6. Interpretation engine (the AI lane)

Only `identity`, `imageMood`, and *refinements* (color role labels, image‑only type classification) go through the model. The model receives:

1. The **screenshot(s)**, and
2. A **compact JSON summary** of the already‑measured tokens (so its read of "the feel" is grounded in the real palette/type, not just pixels).

It must return **strict JSON** (no prose), validated by **Zod**; on validation failure, one repair retry, then a graceful fallback. Prompt design goals:

- `identity`: 3–6 adjectives, a one‑line archetype, and a 1–2 sentence description.
- `imageMood`: two keyword sets — `hero` (main imagery) and `texture` (backgrounds/overlays) — phrased as **real Unsplash search queries**, concrete and photographable (e.g. "soft morning light interior"), not abstract ("innovation").
- Determinism: low temperature; the measured tokens anchor the output so runs on the **same captured render** are stable (not a promise about a live URL re-rendered later — see §9).

Model: Claude (vision‑capable) via `@anthropic-ai/sdk`.

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

## 9. Edge cases & honest caveats

- **Fonts from images can't be measured** — always inferred, always flagged.
- **Dynamic / lazy sites** — need network‑idle waits, scroll‑to‑load, generous timeouts.
- **Consent & anti‑bot walls** — best‑effort banner dismissal; some sites will block headless. Surface a clear error, don't fake results.
- **Gradients / background images** — CSS reads miss these; the screenshot pixel cross‑check backstops palette.
- **Sprawling palettes** — de‑noise: cap to N roles, merge near‑duplicate hexes by perceptual distance (the §5 Stage B merge).
- **AI JSON drift** — Zod + one repair retry + fallback.
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

### How it runs
`npm run eval` renders each corpus site **once** (screenshots cached to disk, so subsequent runs are offline and cheap), runs extraction, diffs against `expected.yaml`, and prints per-site + aggregate scores. Wired into CI over the extraction modules.

---

## 11. Build phases

**Phase 0 — Skeleton**
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

---

## 12. Risks

- **Headless blocking** on some sites — mitigate with realistic UA/viewport; accept that a minority will fail.
- **Playwright in production** — heavier than typical serverless; the container path handles it.
- **AI cost/latency** at scale — cache aggressively; keep the AI payload compact (summary + one downsized screenshot).
- **Palette role mislabeling** on busy pages — mitigated by the staged, channel-aware, score-based pipeline (§5) and measured directly by the §10 role-label accuracy metric; expose roles as editable in the UI later as a final backstop.

---

## 13. Deferred decisions (safe to settle during build)

- Exact number of palette roles surfaced (suggest 6–8).
- Whether the UI lets users **edit** tokens before export.
- Multi‑page crawl vs single URL (start single).
- History / saved runs (nice‑to‑have once deployed).
