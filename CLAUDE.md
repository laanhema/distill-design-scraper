# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Start here by task:**
- Touching extraction logic? Read "Design-tokens lane" or "Structure lane" below, then the eval harness section.
- Adding a report field? Read "Schema" — the optional-field + provenance + conditional-`render*` contract is mandatory.
- Wiring ingestion or the API route? Read "Ingestion", "Security", and "API route".
- Anything else? "Orchestration entry points" first, then drill down.

Distill turns a URL or one-or-more uploaded images into a Markdown design-system / layout-structure report: YAML frontmatter (the machine-parseable contract) followed by a human-readable body _derived from the same object_, so the two can never drift. It runs two largely independent extraction tracks — the **design-tokens lane** (palette, typography, spacing, recipes) and the **structure lane** (page skeleton, component map) — which can run alone or together (`mode: "tokens" | "structure" | "both"`).

The prevailing design principle across the codebase: **measured, never faked**. Every lane stamps a `provenance` (`measured` / `inferred` / `ai`), every schema field for an unmeasured lane is optional and simply omitted rather than synthesized, and any heuristic fallback (e.g. an inferred `on-primary` swatch, an AI-refined color role) is honestly labeled as such rather than presented as a real measurement. Preserve this invariant when touching extraction code — a missing signal should produce an omitted field, not a guessed one.

## Commands

```bash
npm run dev             # Next.js dev server (http://localhost:3000)
npm run build           # production build
npm run typecheck       # tsc --noEmit — run this after any lib/ change
npm run lint            # next lint — run after any change, alongside typecheck

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
2. Run `npm run eval`. It must pass unchanged unless the score change is the _intended_ result of your fix.
3. Only then, refresh the baseline deliberately: `UPDATE_BASELINE=1 npm run eval`.

New optional schema lanes (e.g. `recipes`, `states`, `paletteDark`) are additive by construction — old committed `capture.json` fixtures simply won't populate the new fields, and the code must treat that as "nothing observed" (omit the section) rather than erroring. Don't refresh eval fixtures just to exercise a new lane; verify new extraction logic against a synthetic fixture/local server instead (see "Manually verifying extraction changes" below), and only touch `eval/corpus/*/capture.json` when the capture _shape itself_ changes — this has happened twice already (the responsive-harvest + dark-scheme passes, then the full-page panorama pass), which is why the committed captures carry `responsiveHarvests`/`darkCapture`/`scrollShots`/`panoramaShot` fields.

Note that `eval/capture.ts` drives Playwright directly (`chromium.launch` + `page.goto`) rather than going through `renderUrl` — deliberately, so the SSRF guard doesn't block capturing from `localhost` fixture servers. Scratch scripts that test against a local synthetic server need the same trick or an `SSRF_ALLOWLIST_HOSTS=localhost` env.

### Manually verifying extraction changes

Because eval fixtures are frozen JSON, testing anything that depends on live page behavior (CSSOM `:hover` rules, ARIA attributes, new capture fields) requires an actual render. The established pattern: spin up a local `http.createServer` serving a small synthetic HTML string, call `renderUrl` + `captureFromRender` + `extractFromCapture` (from `lib/analyze.ts`) against it, and inspect the resulting `report`/`markdown`. `renderUrl` runs the SSRF guard first, which blocks loopback addresses — either run the scratch script with `SSRF_ALLOWLIST_HOSTS=localhost`, or drive Playwright directly like `eval/capture.ts` does. Run such scratch scripts with `npx tsx` **from the project root** — running from outside the project (e.g. `/tmp`) fails to resolve `node_modules` (`tsx`/esbuild resolves relative to the script's own location). Delete scratch scripts after use; don't leave them in the repo.

## Architecture

### Orchestration entry points (`lib/analyze.ts`)

`extractFromCapture(capture)` runs the **measured** design-tokens lane only — browser-free, so the eval harness can replay a cached capture offline. It also consumes the optional second-pass capture fields when present: `responsiveHarvests` (mobile heading sizes → `sizePxMobile` via `applyMobileTypeSizes`), `darkCapture` (→ `extractDarkPalette`, which emits `paletteDark` only when backgrounds actually shift vs. the light palette — single-scheme sites get nothing), and `panoramaShot` (merged into the palette's area-weight pixel pass so below-the-fold colors count). `extractStructureFromCapture(capture, report?)` runs the structure lane (pass the already-built `report` in `both` mode to enable the component→token cross-link). `enrichWithAI(measured, screenshots[])` is the separate, optional AI enrichment pass — merges `identity`/`imageMood` and Stage-E color-role refinements onto an already-measured report, and falls back to the measured report untouched if no API key is set or the model fails. `analyzeUrl` / `analyzeImages` are the full pipelines (render → measured → AI) that the API route calls; `analyzeImages(images, mode)` additionally runs the vision structure lane (`structureFromImages`) when `mode` is `structure`/`both`, returning `structureReport` plus a `structureUnavailableReason` when structure was requested but couldn't be produced.

This split (measured lane vs. AI lane) is intentional and load-bearing: **never** make `extractFromCapture` reach for the network or an API key. The measured lane must stay replayable offline for eval.

Every Claude-backed lane (`lib/interpret.ts`, structure Stage 7 in `structureAI.ts`, and `structureFromImage.ts`) shares `lib/aiLane.ts` — one pinned `AI_MODEL`, one `aiLaneAvailable()` API-key check, one `retryOnce` retry-then-graceful-`null` policy. Don't inline a model id or availability check in a new AI call site.

### Design-tokens lane (Track A)

1. **`lib/extract/styleDump.ts`** — the single DOM-observation primitive. Runs a self-contained `page.evaluate` callback (no imports allowed inside it — plain DOM APIs only) that walks every visible node once and returns a flat `StyleDump`: one `NodeStyle` record per node with per-channel colors (`background`/`text`/`border`/`fill`/`stroke`), layout (margins/paddings/gaps/radius/shadow), typography (only when the node has a _direct_ non-whitespace text child), an `interactive` flag, ARIA-derived `semanticContext` (`alert`/`invalid`), and CSSOM-derived `:hover`/`:focus-visible` deltas (`states`). Every other extractor in the design-tokens lane consumes this dump — it is never re-walked.
2. **`lib/extract/palette.ts`** — the staged, score-based role-assignment pipeline: collect & channel-attribute colors → merge near-duplicates by perceptual ΔE (`MERGE_DELTA_E`) → area-weight against screenshot pixels via `sharp` (the viewport shot plus the stitched panorama when present) → score every (color, role) pair (`backgroundScore`/`textScore`/`brandScore`/`borderScore`/`mutedScore`/`semanticScore`) → resolve with guardrails in `assignRoles` (e.g. `MIN_TEXT_CONTRAST` WCAG floor). **Order of the `pick()` calls in `assignRoles` matters**: semantic roles (`success`/`warning`/`danger`) are claimed _before_ the generic `surface`/`primary` scorers run, because `pick()` skips already-taken canonicals — a color with real usage-context evidence (an `alert`/`invalid`-flagged node + matching hue band) must lock in its semantic role first, or a broader role will grab it by default when nothing else was competing. All color math is perceptual (Lab/OKLCH via `lib/color.ts`), never raw RGB.
3. **`lib/extract/typography.ts`**, **`lib/extract/tokens.ts`** (spacing/radius/elevation) — deterministic aggregation off the same dump.
4. **`lib/extract/recipes.ts`** — groups dump nodes into element classes (Button/TextLink/NavItem/Input/Card/Badge) and takes the _modal_ observed value per property, so one outlier instance can't skew a recipe; colors resolve to palette-role names via nearest-ΔE match, falling back to raw hex rather than fabricating a role.
5. **`lib/extract/states.ts`** — attributes each node's CSSOM hover/focus deltas to the palette role of that node's _own_ base color, aggregated (again, modal) across every node sharing a role.
6. **`lib/extract/roleMatch.ts`** — the one shared "nearest palette role for a measured color" helper (ΔE-based, not exact-hex). Both `recipes.ts` and the structure lane's `tokenLink.ts` use this; don't reintroduce a third inline copy of this match.
7. **`lib/extract/imagePalette.ts`** — the image-input counterpart to `palette.ts`: pixel-quantizes each uploaded image into ΔE-merged clusters, then merges clusters _across_ images before role assignment (so multi-image uploads yield one coherent palette, not N colliding ones).
8. **`lib/extract/palette.ts` also exports `extractDarkPalette`** — runs the palette pipeline on the dark-scheme dump and compares backgrounds against the light palette by ΔE; if they didn't shift, it returns nothing (no fake dark palette for single-scheme sites).

### Structure lane (Track B) — `lib/extract/structure/`

A staged pipeline orchestrated by `lib/extract/structure/index.ts`: harvest DOM tree → prune/collapse wrapper divs → detect repeated patterns → assign ontology types (heuristic region/component naming) → optional AI semantic-naming pass (Stage 7, falls back to heuristic names without an API key) → **responsive diff** (Stage 7b, `responsive.ts` — runs each secondary-viewport harvest through the same deterministic prune/repetition/ontology stages, then aligns trees by structural position (tagName + landmark, _never_ node ids — id sequences don't correspond across `page.evaluate` harvests) to record per-component layout deltas like `3col → 1col`) → region-metrics annotation (Stage 8a) → **token-link** (Stage 8b, `tokenLink.ts` — only runs in `both` mode, joins structure components to the design report by bounds overlap then by ΔE-nearest color / exact spacing-scale match; best-effort, never guesses a token that isn't in the report) → emit. Every stage takes/returns a `PrunedNode` tree; the pipeline accepts either a live Playwright `Page` or a pre-harvested `rawHarvestNode` (the latter is how the eval harness replays structure extraction offline too).

`styleMatch.ts` is the shared bounds-overlap matcher ("which style-dump node _is_ this `PrunedNode`", within `BOUNDS_MATCH_TOLERANCE`) used by both `tokenLink.ts` and `regionMetrics.ts` — like `roleMatch.ts` in Track A, don't reintroduce an inline copy.

**`lib/extract/structureFromImage.ts`** is the image-input counterpart: an upload has no DOM, so the skeleton is one-shot *inferred* by the vision model — gated entirely on `ANTHROPIC_API_KEY`, always stamped `fidelity: "inferred"`, with no heuristic fallback possible. It reuses the ontology vocabulary and `structureEmit.ts` so an image-derived skeleton reads the same as a URL-derived one. `lib/extract/imageMediaType.ts` sniffs each upload's real encoded format via `sharp` (uploads aren't necessarily PNG) before anything is sent to the vision API.

### Schema (`lib/schema.ts` + `lib/extract/structureSchema.ts`)

Zod schemas are the single source of truth for both reports' shapes, re-exported together from `lib/schema.ts`. Every measured-lane addition follows the same shape: an optional top-level field on `reportSchema`/`StructureReport`, its own `provenance`, and a corresponding `render*` function in `lib/emit.ts` that's only called `if (report.<field>)` — so an unmeasured lane is omitted from the body, never emitted empty or faked.

The design report body ends with a derived `## CSS variables` block (`renderCssVariables` in `lib/emit.ts`) — a `:root { … }` fence rendered from the same report object as everything else. It adds no schema surface; every variable must trace to an existing frontmatter field, so extend it only by rendering fields that already exist.

### Ingestion (`lib/ingest.ts`)

The single seam where a live URL becomes captured artifacts: `renderUrl` first runs the SSRF guard (`assertSafeUrl` — see "Security" below), then Playwright launches Chromium, navigates, dismisses cookie/consent banners, and captures screenshots + `styleDump` + `rawHarvestNode` off the _same_ rendered page/session. Cheap follow-up passes then reuse that session:

- **Full-page panorama** (`captureFullPageTiles`): scrolls the page in contiguous viewport-tall tiles (capped at `MAX_PANORAMA_VIEWPORTS = 12`) and stitches them into one seamless PNG via `sharp`. Returns the discrete tiles (`scrollShots`, full resolution, for the AI lane) and the stitched composite (`panoramaShot`, for the palette's area-weight pass + the frontend gallery). Pages that fit in one viewport yield neither — omit, don't fabricate.
- **Responsive harvests** (`RESPONSIVE_VIEWPORTS`, currently 390×844 mobile and 768×1024 tablet, narrowest-first): resize → DOM harvest + computed h1/h2 sizes only — no screenshot, no style dump. The primary viewport is restored afterwards.
- **Dark-scheme capture**: `page.emulateMedia({ colorScheme: "dark" })` → screenshot + style dump only. Whether it's actually a different scheme is decided downstream in `extractDarkPalette`, never here.

All passes are best-effort — a failure logs a warning and the field is simply absent, which every consumer already treats as "nothing observed". `lib/analyze.ts`'s `captureFromRender` turns the render into the `Capture` shape the rest of the pipeline consumes.

### Security (`lib/security/`)

- **`ssrfGuard.ts`** — `assertSafeUrl(url)`, called by `renderUrl` before any navigation. DNS-resolves the hostname and rejects loopback / RFC1918 / link-local / other reserved ranges by *resolved IP*, not hostname string; fails closed on unresolvable hosts; throws the single `UnsafeUrlError` type. `SSRF_ALLOWLIST_HOSTS` (comma-separated exact hostnames) opts specific hosts out — needed for local-fixture testing (see "Manually verifying extraction changes"). Note the guard only validates the initially submitted URL, not requests the rendered page itself makes; the README's "Deploying Publicly — Hardening Guide" covers network-level egress filtering for that.
- **`rateLimiter.ts`** — in-memory per-client token bucket guarding `POST /api/analyze` (`RATE_LIMIT_MAX_REQUESTS`/`RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX_BUCKETS`/`RATE_LIMIT_DISABLED` env vars). The bucket store is bounded (idle-sweep, then LRU eviction) so the limiter can't itself be grown unboundedly via spoofed client ids. Per-process only — a multi-instance deployment is a known MVP gap, not something to silently "fix" with a shared store.

### API route (`app/api/analyze/route.ts`)

Accepts `url` or `images: { data, name? }[]` (capped at `MAX_IMAGES = 6`; the AI lane further caps what it sends to the model at `MAX_INTERPRET_IMAGES = 4` in `lib/interpret.ts` — the measured palette merge still uses all 6), plus `mode` (defaults to `"both"`); `image`/`imageName` survive as a deprecated single-image alias that's _merged_ into `images`, not replaced by it. The cache key hashes all image payloads, and the response carries `viewportShots` (per-source previews — for a URL, the viewport shot plus the panorama when present) alongside the legacy singular `viewportShot`.

Rate limiting sits _after_ the cache check on purpose: cache hits consume zero budget, only requests about to trigger a Chromium render or AI call count, and a limited request gets a 429 with a `Retry-After` header. Image responses in `structure`/`both` mode carry `structureReport` (vision-inferred) and, when structure was requested but failed, `structureUnavailableReason` — and a response with a transient structure failure is deliberately _not_ cached, so a retry can succeed.

### Path alias

`@/*` maps to the project root (see `tsconfig.json`) — e.g. `@/lib/schema`, `@/lib/extract/palette`.

## Git policy

Do not commit, push, or open PRs unless explicitly asked. Stage only intended files and never commit secrets. After completing a task, run `npm run lint` and `npm run typecheck` to verify.
