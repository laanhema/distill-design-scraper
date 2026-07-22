# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Distill turns a URL or an uploaded image into a Markdown design-system / layout-structure report: YAML frontmatter (the machine-parseable contract) followed by a human-readable body *derived from the same object*, so the two can never drift. It runs two largely independent extraction tracks — the **design-tokens lane** (palette, typography, spacing, recipes) and the **structure lane** (page skeleton, component map) — which can run alone or together (`mode: "tokens" | "structure" | "both"`).

The prevailing design principle across the codebase: **measured, never faked**. Every lane stamps a `provenance` (`measured` / `inferred` / `ai`), every schema field for an unmeasured lane is optional and simply omitted rather than synthesized, and any heuristic fallback (e.g. an inferred `on-primary` swatch, an AI-refined color role) is honestly labeled as such rather than presented as a real measurement. Preserve this invariant when touching extraction code — a missing signal should produce an omitted field, not a guessed one.

## Commands

```bash
npm run dev            # Next.js dev server (http://localhost:3000)
npm run build           # production build
npm run typecheck       # tsc --noEmit — run this after any lib/ change
npm run lint            # next lint

npm run eval            # regression gate over the measured extraction lane (see below)
npm run eval:capture    # (re)capture eval/corpus/*/capture.json from live fixtures/URLs
npm run eval:ai         # stability check on AI-lane outputs across repeated runs
```

There is no unit test framework (no jest/vitest) — `npm run eval` is the correctness gate for extraction logic. `postinstall` runs `playwright install chromium` automatically.

### The eval harness (`eval/`) — read before touching any `lib/extract/*`

`npm run eval` replays committed captures in `eval/corpus/<slug>/capture.json` (produced once via `npm run eval:capture`, then git-committed) against hand-authored `eval/corpus/<slug>/expected.yaml`, entirely offline — no browser, no network. It's wired as a two-part gate:

- an absolute floor per site (`SITE_FLOOR` in `eval/run.ts`), and
- no site's combined score may drop below `eval/baseline.json`.

Workflow when changing any extractor (`lib/extract/**`, `lib/emit.ts`, `lib/analyze.ts`):
1. Make the change.
2. Run `npm run eval`. It must pass unchanged unless the score change is the *intended* result of your fix.
3. Only then, refresh the baseline deliberately: `UPDATE_BASELINE=1 npm run eval`.

New optional schema lanes (e.g. `recipes`, `states`) are additive by construction — old committed `capture.json` fixtures simply won't populate the new fields, and the code must treat that as "nothing observed" (omit the section) rather than erroring. Don't refresh eval fixtures just to exercise a new lane; verify new extraction logic against a synthetic fixture/local server instead (see "Manually verifying extraction changes" below), and only touch `eval/corpus/*/capture.json` when the capture *shape itself* changes (e.g. adding a new viewport or color scheme pass).

### Manually verifying extraction changes

Because eval fixtures are frozen JSON, testing anything that depends on live page behavior (CSSOM `:hover` rules, ARIA attributes, new capture fields) requires an actual render. The established pattern: spin up a local `http.createServer` serving a small synthetic HTML string, call `renderUrl` + `captureFromRender` + `extractFromCapture` (from `lib/analyze.ts`) against it, and inspect the resulting `report`/`markdown`. Run such scratch scripts with `npx tsx` **from the project root** — running from outside the project (e.g. `/tmp`) fails to resolve `node_modules` (`tsx`/esbuild resolves relative to the script's own location). Delete scratch scripts after use; don't leave them in the repo.

## Architecture

### Orchestration entry points (`lib/analyze.ts`)

`extractFromCapture(capture)` runs the **measured** design-tokens lane only — browser-free, so the eval harness can replay a cached capture offline. `extractStructureFromCapture(capture, report?)` runs the structure lane (pass the already-built `report` in `both` mode to enable the component→token cross-link). `enrichWithAI(measured, screenshot)` is the separate, optional AI enrichment pass — merges `identity`/`imageMood` and Stage-E color-role refinements onto an already-measured report, and falls back to the measured report untouched if no API key is set or the model fails. `analyzeUrl` / `analyzeImage` are the full pipelines (render → measured → AI) that the API route calls.

This split (measured lane vs. AI lane) is intentional and load-bearing: **never** make `extractFromCapture` reach for the network or an API key. The measured lane must stay replayable offline for eval.

### Design-tokens lane (Track A)

1. **`lib/extract/styleDump.ts`** — the single DOM-observation primitive. Runs a self-contained `page.evaluate` callback (no imports allowed inside it — plain DOM APIs only) that walks every visible node once and returns a flat `StyleDump`: one `NodeStyle` record per node with per-channel colors (`background`/`text`/`border`/`fill`/`stroke`), layout (margins/paddings/gaps/radius/shadow), typography (only when the node has a *direct* non-whitespace text child), an `interactive` flag, ARIA-derived `semanticContext` (`alert`/`invalid`), and CSSOM-derived `:hover`/`:focus-visible` deltas (`states`). Every other extractor in the design-tokens lane consumes this dump — it is never re-walked.
2. **`lib/extract/palette.ts`** — the staged, score-based role-assignment pipeline: collect & channel-attribute colors → merge near-duplicates by perceptual ΔE (`MERGE_DELTA_E`) → area-weight against screenshot pixels (via `sharp`) → score every (color, role) pair (`backgroundScore`/`textScore`/`brandScore`/`borderScore`/`mutedScore`/`semanticScore`) → resolve with guardrails in `assignRoles` (e.g. `MIN_TEXT_CONTRAST` WCAG floor). **Order of the `pick()` calls in `assignRoles` matters**: semantic roles (`success`/`warning`/`danger`) are claimed *before* the generic `surface`/`primary` scorers run, because `pick()` skips already-taken canonicals — a color with real usage-context evidence (an `alert`/`invalid`-flagged node + matching hue band) must lock in its semantic role first, or a broader role will grab it by default when nothing else was competing. All color math is perceptual (Lab/OKLCH via `lib/color.ts`), never raw RGB.
3. **`lib/extract/typography.ts`**, **`lib/extract/tokens.ts`** (spacing/radius/elevation) — deterministic aggregation off the same dump.
4. **`lib/extract/recipes.ts`** — groups dump nodes into element classes (Button/TextLink/Input/Card) and takes the *modal* observed value per property, so one outlier instance can't skew a recipe; colors resolve to palette-role names via nearest-ΔE match, falling back to raw hex rather than fabricating a role.
5. **`lib/extract/states.ts`** — attributes each node's CSSOM hover/focus deltas to the palette role of that node's *own* base color, aggregated (again, modal) across every node sharing a role.
6. **`lib/extract/roleMatch.ts`** — the one shared "nearest palette role for a measured color" helper (ΔE-based, not exact-hex). Both `recipes.ts` and the structure lane's `tokenLink.ts` use this; don't reintroduce a third inline copy of this match.

### Structure lane (Track B) — `lib/extract/structure/`

An 8-stage pipeline orchestrated by `lib/extract/structure/index.ts`: harvest DOM tree → prune/collapse wrapper divs → detect repeated patterns → assign ontology types (heuristic region/component naming) → optional AI semantic-naming pass (Stage 7, falls back to heuristic names without an API key) → region-metrics annotation → **token-link** (Stage 8b, `tokenLink.ts` — only runs in `both` mode, joins structure components to the design report by bounds overlap then by ΔE-nearest color / exact spacing-scale match; best-effort, never guesses a token that isn't in the report) → emit. Every stage takes/returns a `PrunedNode` tree; the pipeline accepts either a live Playwright `Page` or a pre-harvested `rawHarvestNode` (the latter is how the eval harness replays structure extraction offline too).

### Schema (`lib/schema.ts` + `lib/extract/structureSchema.ts`)

Zod schemas are the single source of truth for both reports' shapes, re-exported together from `lib/schema.ts`. Every measured-lane addition follows the same shape: an optional top-level field on `reportSchema`/`StructureReport`, its own `provenance`, and a corresponding `render*` function in `lib/emit.ts` that's only called `if (report.<field>)` — so an unmeasured lane is omitted from the body, never emitted empty or faked.

### Ingestion (`lib/ingest.ts`)

The single seam where a live URL becomes captured artifacts: Playwright launches Chromium, navigates, dismisses cookie/consent banners, then captures screenshots + `styleDump` + `rawHarvestNode` off the *same* rendered page/session. `lib/analyze.ts`'s `captureFromRender` turns that into the `Capture` shape the rest of the pipeline consumes.

### Path alias

`@/*` maps to the project root (see `tsconfig.json`) — e.g. `@/lib/schema`, `@/lib/extract/palette`.
