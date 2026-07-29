# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. `AGENTS.md` and `GEMINI.md` are one-line `@CLAUDE.md` pointers — this file is the only place to edit agent guidance.

## What this is

**Start here by task:**
- Touching extraction logic? Read "Design-tokens lane" or "Structure lane" below, then the eval harness section.
- Adding a report field? Read "Schema" — the optional-field + provenance + conditional-`render*` contract is mandatory.
- Wiring ingestion or the API route? Read "Ingestion", "Security", and "API route".
- Anything else? "Orchestration entry points" first, then drill down.

Distill turns a URL or one-or-more uploaded images into a Markdown design-system / layout-structure report: YAML frontmatter (the machine-parseable contract) followed by a human-readable body _derived from the same object_, so the two can never drift. It runs two largely independent extraction tracks — the **design-tokens lane** (palette, typography, spacing, recipes, states, motion) and the **structure lane** (page skeleton, component map, section digest) — which can run alone or together (`mode: "tokens" | "structure" | "both"`).

The prevailing design principle across the codebase: **measured, never faked**. Every lane stamps a `provenance` (`measured` / `inferred` / `ai`), every schema field for an unmeasured lane is optional and simply omitted rather than synthesized, and any heuristic fallback (e.g. an inferred `on-primary` swatch, an AI-refined color role) is honestly labeled as such rather than presented as a real measurement. Preserve this invariant when touching extraction code — a missing signal should produce an omitted field, not a guessed one.

## Commands

```bash
npm run dev             # Next.js dev server (http://localhost:3000)
npm run build           # production build
npm run typecheck       # tsc --noEmit — run this after any lib/ change
npm run lint            # eslint . — run after any change, alongside typecheck

npm run eval            # regression gate over the measured extraction lane (see below)
npm run eval:capture    # (re)capture eval/corpus/*/capture.json from live fixtures/URLs
npm run eval:ai         # stability check on AI-lane outputs across repeated runs
```

There is no unit test framework (no jest/vitest) — `npm run eval` is the correctness gate for extraction logic. `postinstall` runs `playwright install chromium` automatically. CI (`.github/workflows/ci.yml`, on push/PR to `main`) runs exactly `typecheck` → `lint` → `eval` on Node 20, with no API key in the environment — so anything that only passes with a key set will fail there.

### The eval harness (`eval/`) — read before touching any `lib/extract/*`

`npm run eval` replays committed captures in `eval/corpus/<slug>/capture.json` (produced once via `npm run eval:capture`, then git-committed) against hand-authored `eval/corpus/<slug>/expected.yaml`, entirely offline — no browser, no network. **Coverage scope:** The eval runner scores committed required fixtures (`clean-light`, `dark-mode`) and fails if any required corpus entry is missing its capture or expected spec. Live reference entries without committed captures (`stripe`, `linear`, `vercel`) are explicitly marked `optional: true` in `eval/corpus.ts` and logged as skipped. The harness covers offline measured token extraction and heuristic structure extraction; it does not cover live third-party site renders or AI-lane enrichment passes. It's wired as a two-part gate:

- an absolute floor per site (`SITE_FLOOR` in `eval/run.ts`), and
- no site's combined score may drop below `eval/baseline.json`.

**Both lanes are scored.** When a capture carries `rawHarvestNode`, the runner also runs the structure lane and scores it via `eval/scoreStructure.ts` (section-digest order/names/instance counts, region names against `skeletonAscii`, component-map counts). `combinedScore` in `eval/score.ts` then weights palette 0.5 / typography 0.3 / structure 0.2 — the older palette 0.6 / typography 0.4 split only applies to captures with no harvest. A structure-lane *exception* is deliberately scored as `0` rather than skipped, so a crash can't leave the gate green. The runner passes `forceHeuristicNaming: true`, which short-circuits the Stage 7 AI labeller before any availability check — eval stays offline and deterministic even when an API key is set locally (and consequently never exercises AI naming or `sectionDescriptions`).

Workflow when changing any extractor (`lib/extract/**`, `lib/emit.ts`, `lib/analyze.ts`):

1. Make the change.
2. Run `npm run eval`. It must pass unchanged unless the score change is the _intended_ result of your fix.
3. Only then, refresh the baseline deliberately: `UPDATE_BASELINE=1 npm run eval`.

New optional schema lanes (e.g. `recipes`, `states`, `paletteDark`, `motion`, structure `sections`) are additive by construction — old committed `capture.json` fixtures simply won't populate the new fields, and the code must treat that as "nothing observed" (omit the section) rather than erroring. Don't refresh eval fixtures just to exercise a new lane; verify new extraction logic against a synthetic fixture/local server instead (see "Manually verifying extraction changes" below), and only touch `eval/corpus/*/capture.json` when the capture _shape itself_ changes — this has happened twice already (the responsive-harvest + dark-scheme passes, then the full-page panorama pass), which is why the committed captures carry `responsiveHarvests`/`darkCapture`/`scrollShots`/`panoramaShot` fields. The motion lane is the live illustration of the rule working: the two committed captures (`clean-light`, `dark-mode`) contain no `motion`/`keyframes` at all, so `extractMotion` returns `undefined` and the section is simply absent from every eval-scored report.

Note that `eval/capture.ts` drives Playwright directly (`chromium.launch` + `page.goto`) rather than going through `renderUrl` — deliberately, so the SSRF guard doesn't block capturing from `localhost` fixture servers. Scratch scripts that test against a local synthetic server need the same trick or an `SSRF_ALLOWLIST_HOSTS=localhost` env.

### Manually verifying extraction changes

Because eval fixtures are frozen JSON, testing anything that depends on live page behavior (CSSOM `:hover` rules, ARIA attributes, new capture fields) requires an actual render. The established pattern: spin up a local `http.createServer` serving a small synthetic HTML string, call `renderUrl` + `captureFromRender` + `extractFromCapture` (from `lib/analyze.ts`) against it, and inspect the resulting `report`/`markdown`. `renderUrl` runs the SSRF guard first, which blocks loopback addresses — either run the scratch script with `SSRF_ALLOWLIST_HOSTS=localhost`, or drive Playwright directly like `eval/capture.ts` does. Run such scratch scripts with `npx tsx` **from the project root** — running from outside the project (e.g. `/tmp`) fails to resolve `node_modules` (`tsx`/esbuild resolves relative to the script's own location). Delete scratch scripts after use; don't leave them in the repo.

## Architecture

### Orchestration entry points (`lib/analyze.ts`)

`extractFromCapture(capture)` runs the **measured** design-tokens lane only (palette → typography → spacing/radius/elevation → recipes → states → motion) — browser-free, so the eval harness can replay a cached capture offline. It also consumes the optional second-pass capture fields when present: `responsiveHarvests` (mobile heading sizes → `sizePxMobile` via `applyMobileTypeSizes`), `darkCapture` (→ `extractDarkPalette`, which emits `paletteDark` only when backgrounds actually shift vs. the light palette — single-scheme sites get nothing), and `panoramaShot` (merged into the palette's area-weight pixel pass so below-the-fold colors count). `extractStructureFromCapture(capture, report?)` runs the structure lane (pass the already-built `report` in `both` mode to enable the component→token cross-link). `enrichWithAI(measured, screenshots[])` is the separate, optional AI enrichment pass — merges `identity`/`imageMood` and Stage-E color-role refinements onto an already-measured report, and falls back to the measured report untouched if no API key is set or the model fails. `analyzeUrl` / `analyzeImages` are the full pipelines (render → measured → AI) that the API route calls; `analyzeImages(images, mode)` additionally runs the vision structure lane (`structureFromImages`) when `mode` is `structure`/`both`, returning `structureReport` plus a `structureUnavailableReason` when structure was requested but couldn't be produced.

This split (measured lane vs. AI lane) is intentional and load-bearing: **never** make `extractFromCapture` reach for the network or an API key. The measured lane must stay replayable offline for eval.

Every AI-backed lane (`lib/interpret.ts`, structure Stage 7 in `structureAI.ts`, and `structureFromImage.ts`) shares `lib/aiLane.ts` — the only file allowed to import a model-provider SDK. It owns the pinned `AI_MODEL`, the `aiLaneAvailable()` key check, the `callModel` round-trip, the `parseJsonLoose` extractor (JSON-mode output, falling back to an outermost-brace match; never a shape validator — Zod stays the gate at each call site), the `retryOnce` retry-then-graceful-`null` policy, and `warnAiFailure` (classifies 429/quota vs. 400 vs. other in the log line). Don't inline a model id, API call, availability check, or JSON scrape in a new AI call site.

**Two providers, one seam.** `callModel` dispatches on env: if `OPENROUTER_API_KEY` is set it goes to OpenRouter's `/chat/completions` (model from `OPENROUTER_MODEL`, default `google/gemini-3.5-flash`; images as `data:` URLs; `jsonSchema` sends a real, non-strict `response_format: json_schema` — not `strict: true`, because `STRUCTURE_SCHEMA`'s dictionary-shaped `additionalProperties` fields aren't representable under strict mode), otherwise to the Gemini SDK with `AI_MODEL` (default `gemini-3.5-flash`, overridable via `GEMINI_MODEL`; raw-base64 `inlineData` parts, native `responseJsonSchema`, and `thinkingLevel` support). OpenRouter therefore *wins* when both keys are present, and `aiLaneAvailable()` is true if either is set. Both providers default to the same model generation now, each independently overridable (`GEMINI_MODEL` / `OPENROUTER_MODEL`). `thinkingLevel` is the one remaining Gemini-only knob — it doesn't apply on the OpenRouter path, and `aiLane.ts` logs a one-time warning the first time a lane sends one over OpenRouter, so a lane whose budget depends on capping thinking tokens can tell from the logs that assumption didn't hold. Zod remains the actual shape gate on every path regardless of provider, since `parseJsonLoose` never validates shape — only `json_schema`/`responseJsonSchema` request-side hinting differs.

### Design-tokens lane (Track A)

1. **`lib/extract/styleDump.ts`** — the single DOM-observation primitive. Its main pass is a self-contained `page.evaluate` callback (no imports allowed inside it — plain DOM APIs only) that walks every visible node once and returns a flat `StyleDump`: one `NodeStyle` record per node with per-channel colors (`background`/`text`/`border`/`fill`/`stroke`), layout (margins/paddings/gaps/radius/shadow), typography (only when the node has a _direct_ non-whitespace text child), an `interactive` flag, ARIA-derived `semanticContext` (`alert`/`invalid`), CSSOM-derived `:hover`/`:focus-visible` deltas (`states`), and declared `motion` (parsed `transition`/`animation` shorthand) plus dump-level `keyframes`. Every other extractor in the design-tokens lane consumes this dump — it is never re-walked.

   A **second pass** then repairs what CSSOM can't see: rules from cross-origin stylesheets throw on `.cssRules`, so the first pass reports their `href`s, and `styleDump` refetches each through `page.context().request.get`, re-parses it in a detached document, re-matches selectors against the live DOM via the temporary `data-distill-id` attribute, and merges any new hover/focus changes and `@keyframes` into the dump. It's best-effort per stylesheet (network failure = skip) and merge-only — it never overwrites a value the in-page pass already measured. So `styleDump` is `async` and does touch the network on the *render* path; the extraction lane it feeds still doesn't.
2. **`lib/extract/palette.ts`** — the staged, score-based role-assignment pipeline: collect & channel-attribute colors → merge near-duplicates by perceptual ΔE (`MERGE_DELTA_E`) → area-weight against screenshot pixels via `sharp` (the viewport shot plus the stitched panorama when present) → score every (color, role) pair (`backgroundScore`/`textScore`/`brandScore`/`borderScore`/`mutedScore`/`semanticScore`) → resolve with guardrails in `assignRoles` (e.g. `MIN_TEXT_CONTRAST` WCAG floor). **Order of the `pick()` calls in `assignRoles` matters**: semantic roles (`success`/`warning`/`danger`) are claimed _before_ the generic `surface`/`primary` scorers run, because `pick()` skips already-taken canonicals — a color with real usage-context evidence (an `alert`/`invalid`-flagged node + matching hue band) must lock in its semantic role first, or a broader role will grab it by default when nothing else was competing. All color math is perceptual (Lab/OKLCH via `lib/color.ts`), never raw RGB.
3. **`lib/extract/typography.ts`**, **`lib/extract/tokens.ts`** (spacing/radius/elevation) — deterministic aggregation off the same dump.
4. **`lib/extract/recipes.ts`** — groups dump nodes into element classes (Button/TextLink/NavItem/Input/Card/Badge) and takes the _modal_ observed value per property, so one outlier instance can't skew a recipe; colors resolve to palette-role names via nearest-ΔE match, falling back to raw hex rather than fabricating a role.
5. **`lib/extract/states.ts`** — attributes each node's CSSOM hover/focus deltas to the palette role of that node's _own_ base color, aggregated (again, modal) across every node sharing a role.
6. **`lib/extract/motion.ts`** — attributes each node's declared transitions/animations to the same recipe element classes (it reuses `recipes.ts`'s exported `classify`, so a node that isn't a recognized element class contributes no motion), dedupes identical entries, and keeps only the `@keyframes` definitions actually referenced by an emitted animation. No entries → the whole `motion` section is omitted.
7. **`lib/extract/roleMatch.ts`** — the one shared "nearest palette role for a measured color" helper (ΔE-based, not exact-hex). Both `recipes.ts` and the structure lane's `tokenLink.ts` use this; don't reintroduce a third inline copy of this match.
8. **`lib/extract/imagePalette.ts`** — the image-input counterpart to `palette.ts`: pixel-quantizes each uploaded image into ΔE-merged clusters, then merges clusters _across_ images before role assignment (so multi-image uploads yield one coherent palette, not N colliding ones).
9. **`lib/extract/palette.ts` also exports `extractDarkPalette`** — runs the palette pipeline on the dark-scheme dump and compares backgrounds against the light palette by ΔE; if they didn't shift, it returns nothing (no fake dark palette for single-scheme sites).

### Structure lane (Track B) — `lib/extract/structure/`

A staged pipeline orchestrated by `lib/extract/structure/index.ts`: harvest DOM tree → prune/collapse wrapper divs (Stages 3–4) → **squash wrapper chains** (Stage 4b, `squash.ts`) → detect repeated patterns (Stage 5) → assign ontology types (Stage 6, heuristic region/component naming) → optional AI semantic-naming pass (Stage 7, falls back to heuristic names without an API key, and also returns per-band `sectionDescriptions` intent lines on the AI path) → **responsive diff** (Stage 7b, `responsive.ts` — runs each secondary-viewport harvest through the same deterministic prune/squash/repetition/ontology stages, then aligns trees by structural position (tagName + landmark, _never_ node ids — id sequences don't correspond across `page.evaluate` harvests) to record per-component layout deltas like `3col → 1col`) → region-metrics annotation (Stage 8a) → **token-link** (Stage 8b, `tokenLink.ts` — only runs in `both` mode, joins structure components to the design report by bounds overlap then by ΔE-nearest color / exact spacing-scale match; best-effort, never guesses a token that isn't in the report) → **section digest** (Stage 9, `sections.ts`) → emit (Stage 10). Every stage takes/returns a `PrunedNode` tree; the pipeline accepts either a live Playwright `Page` or a pre-harvested `rawHarvestNode` (the latter is how the eval harness replays structure extraction offline too).

Two of these stages carry non-obvious contracts:

- **Stage 4b (`squash.ts`)** exists because Stage 4's collapse rule deliberately exempts flex/grid wrappers, which leaves chains like `Hero → Hero [grid · 1col] → Hero [grid · 12col]`. Squash merges a lone *generic layout container* child (no landmark, not interactive, not a semantic tag, has children of its own) into its parent: outer identity survives, the more specific annotation wins (`grid · Ncol` > `grid` > `flex` > none, ties to the child), and a `sticky`/`fixed` suffix is stripped before ranking and re-appended. It's a pure `PrunedNode → PrunedNode`, and it **must** run on the secondary-viewport derivations too or the responsive diff's positional alignment compares differently-shaped trees.
- **Stage 9 (`sections.ts`)** emits the ordered per-band digest (`SiteHeader`, each direct child of `MainContent`, `SiteFooter`) — every field joined from an already-measured upstream artifact: `band` from the Stage 8a annotation (only the `sticky`/`fixed`/`h …`/`padY …` segments), `layout` from the tree's flex/grid annotations, `contents` from a counted subtree walk, `tokens` from Stage 8b, `responsive` from Stage 7b, `description` from Stage 7's AI lines (joined by band node id, which survives every stage's spread copies). `findDigestBands` is exported and used by *both* Stage 9 and the Stage 7 AI prompt, so the prompt's section list and the emitted digest can never disagree about which nodes are sections. No identifiable `main` region → no digest at all.

`styleMatch.ts` is the shared bounds-overlap matcher ("which style-dump node _is_ this `PrunedNode`", within `BOUNDS_MATCH_TOLERANCE`) used by both `tokenLink.ts` and `regionMetrics.ts` — like `roleMatch.ts` in Track A, don't reintroduce an inline copy.

**`lib/extract/structureFromImage.ts`** is the image-input counterpart: an upload has no DOM, so the skeleton is one-shot *inferred* by the vision model — gated entirely on `aiLaneAvailable()`, always stamped `fidelity: "inferred"`, with no heuristic fallback possible. It reuses the ontology vocabulary and `structureEmit.ts` so an image-derived skeleton reads the same as a URL-derived one. `lib/extract/imageMediaType.ts` sniffs each upload's real encoded format via `sharp` (uploads aren't necessarily PNG) before anything is sent to the vision API.

### Schema (`lib/schema.ts` + `lib/extract/structureSchema.ts`)

Zod schemas are the single source of truth for both reports' shapes, re-exported together from `lib/schema.ts`. Every measured-lane addition follows the same shape: an optional top-level field on `reportSchema`/`StructureReport`, its own `provenance`, and a corresponding `render*` function in `lib/emit.ts` that's only called `if (report.<field>)` — so an unmeasured lane is omitted from the body, never emitted empty or faked. `motion` (entries + referenced `keyframes`) and the structure report's `sections`/`sectionsText` are the most recent lanes added under this contract.

The structure report's `sectionsText` is the *same* formatted artifact as the body's `## Page sections` block — `structureEmit.ts` formats the digest once and uses it for both, the same one-source rule as design-report frontmatter vs. body.

Two **derived views** hang off the design report, both in `lib/emit.ts`, both adding zero schema surface — every value must trace to a field that already exists, so extend them only by rendering existing fields:

- `renderCssVariables` — the `:root { … }` fence that ends the markdown body.
- `emitTailwindTheme` — a standalone Tailwind v4 `@theme { … }` stylesheet (colors, `--font-*`, `--text-*` with line-height/weight/letter-spacing, `--spacing`, `--radius-*`, `--shadow-*`, plus a `prefers-color-scheme: dark` override block when `paletteDark` exists). It is *not* part of the markdown; the frontend calls it directly for the "Download Tailwind theme" action.

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

### Frontend (`app/page.tsx`)

One client component, no state library: URL-or-images input, then a three-tab result view (`preview` / `tokens` / `structure`, the structure tab present only when a `structureReport` came back). Copy and download act on the *active* tab's markdown, and the Tailwind download calls `emitTailwindTheme(report)` client-side. When a response arrives without structure, the tab selection falls back to `preview` rather than pointing at a pane that no longer exists.

### Path alias

`@/*` maps to the project root (see `tsconfig.json`) — e.g. `@/lib/schema`, `@/lib/extract/palette`.

## Git policy

Do not commit, push, or open PRs unless explicitly asked. Stage only intended files and never commit secrets. After completing a task, run `npm run lint` and `npm run typecheck` to verify.
