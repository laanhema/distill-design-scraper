# PRD — Distill: Design System & Structure Scraper

> **Note:** This PRD was authored retroactively (2026-07-23) against an already-built codebase and refreshed **2026-07-29** to (a) match the shipped state of `main`, (b) adopt the AI-lane provider migration described in `from-claude-to-gemini-plan.md`, and (c) incorporate technical and security findings from the 2026-07-29 codebase health audit. "In Scope" items marked `[x]` are implemented and verified; unchecked items are genuinely open. Implementation phases mirror the actual delivery history recorded in `PLAN.md`, `.agents/plans/completed/`, and git.

---

## 1. Executive Summary

Distill converts any live website URL — or one or more uploaded screenshots — into a structured Markdown **design-system report** and **page-architecture report**. Each report pairs machine-parseable YAML frontmatter with a human-readable body derived from the *same* underlying object, so the two representations can never drift. The goal: **an LLM or developer should be able to build a new website from these two files alone.**

The product's differentiating principle is **"measured, never faked."** Every extracted value is stamped with provenance (`measured` / `inferred` / `ai`); a signal that cannot be observed produces an *omitted* field, never a synthesized one. Deterministic extraction (headless Chromium render → single DOM style-dump walk → perceptual color science → staged structure pipeline) runs fully offline-capable; an optional AI vision lane enriches — but never replaces — measured output.

The MVP goal: given a URL, produce token and structure reports faithful enough to rebuild the page's visual system (palette with roles and contrast pairs, typography scale with fallback stacks, spacing/radius/elevation tokens, component recipes with variants, interactive states, responsive deltas across mobile + tablet, light+dark schemes, and a semantic component skeleton led by an ordered page-section digest) — with a lighter palette-and-mood path for image input.

**Current standing (2026-07-29):** the measured lanes (Tracks A and B) are complete, regression-gated, and shipping. The **AI lane has never actually executed in this project** — no `ANTHROPIC_API_KEY` has ever been configured, and two of the three AI call sites additionally carry a latent `temperature: 0.1` parameter that current Claude models reject. Phase 5 (§12) exists to close both gaps by moving the AI lane to Google Gemini's free tier. Additionally, recent audit findings identified an unpinned model string in `aiLane.ts`, an SSRF redirect gap in `ingest.ts`, UI action button label ambiguity in `page.tsx`, and a missing GitHub Actions CI workflow.

## 2. Mission

**Mission statement:** Make any website's design language and page architecture legible, portable, and honestly sourced — one URL or screenshot in, two rebuild-sufficient Markdown files out.

**Core principles:**

1. **Measured, never faked** — omitted beats guessed; every field carries provenance.
2. **One contract, two views** — YAML frontmatter is the machine contract; the body is derived from the same object, so they cannot disagree.
3. **Deterministic core, optional AI shell** — the measured lane runs offline with no API key; AI enrichment is additive and fails open to measured output.
4. **Perceptual, not naive** — all color math is Lab/OKLCH ΔE and WCAG/APCA contrast, never raw RGB distance.
5. **Regression-gated evolution** — extraction changes must pass the offline eval harness against committed captures; baselines are refreshed deliberately, never as a side effect.
6. **One seam per concern** — a single style-dump walk, a single ingestion seam, a single AI provider seam (`lib/aiLane.ts`), a single ΔE role matcher, a single bounds matcher. New call sites reuse them rather than re-inlining a copy.

## 3. Target Users

| Persona | Technical comfort | Needs |
|---|---|---|
| **LLM coding agents** (primary consumer of the output) | N/A — consumes the report programmatically | An unambiguous, self-contained spec (explicit units, role names, recipes) to rebuild a site without seeing it |
| **Frontend developers / design engineers** | High | Extract a real site's tokens into CSS variables / a starting design system; audit contrast; reverse-engineer layout structure |
| **Designers & design-adjacent PMs** | Medium | Understand a reference site's palette, type scale, and mood; get honest "what's actually there" documentation |
| **Agency / freelance builders** | Medium–high | Turn a client's "make it like this site" reference into an actionable spec |

**Pain points addressed:** manual token inspection is slow and error-prone; screenshots lose structure; naive scrapers hallucinate values ("faked" design systems); existing tools ignore hover states, dark schemes, responsive behavior, and below-the-fold colors.

## 4. MVP Scope

### In Scope — Core Functionality

- [x] **URL analysis** via headless Chromium (Playwright): viewport screenshot + stitched full-page panorama (≤12 viewport tiles), computed-style dump, raw DOM harvest — all from one rendered session
- [x] **Design-tokens lane (Track A):** palette with staged role assignment (surface/primary/text/border/muted + semantic success/warning/danger), typography scale with full fallback stacks + mobile sizes, spacing base-unit/scale (px-explicit), radius + named elevation tokens — each lane **omitted entirely when nothing was observed**
- [x] **Component recipes with variants:** instances clustered by background role, then modal-value aggregation per element class (Button, TextLink, Input, Card, NavItem, Badge); colors resolved to palette roles; a measured `variant` label emitted only when a class kept more than one cluster
- [x] **Interactive states:** CSSOM `:hover` / `:focus-visible` deltas attributed to palette roles (cross-origin sheets skipped silently — see §12 Phase 6)
- [x] **Dark scheme capture:** `prefers-color-scheme: dark` second pass → `paletteDark` only when backgrounds measurably shift
- [x] **Structure lane (Track B):** harvest → prune/collapse → squash single-child wrapper chains → repetition detection → ontology naming → optional AI semantic naming → responsive diff (390 + 768) → region metrics → token cross-link (`both` mode) → **ordered section digest** → ASCII skeleton + component map emit
- [x] **Page-sections digest:** the structure report body leads with an ordered, measured per-band summary (band, layout, contents, tokens, responsive, instances); AI supplies an optional one-line intent `description` per section when a key is present
- [x] **Image input:** multi-image (≤6) palette merge via bucket-quantize + ΔE dedup, degenerate/zero-cluster input handled without crashing, no fabricated semantic swatches; AI-inferred structure clearly stamped `fidelity: inferred`
- [x] **Report format:** YAML frontmatter + derived body, ending in a derived `## CSS variables` `:root` block
- [x] **Honesty framing:** provenance per lane, `naming: ai | heuristic` flag, `fidelity: measured | inferred`, intent-oriented region annotations (`padY` over raw heights)

### In Scope — Technical

- [x] Offline-replayable measured lane (`extractFromCapture` never touches network/API keys)
- [x] Eval regression harness: committed captures + hand-authored expectations, per-site floor (0.7) + no-regression baseline gate (`npm run eval`), AI-stability check (`npm run eval:ai`)
- [x] **Structure lane included in the eval score** (weighted alongside palette/typography; a structure-lane error scores 0 rather than being skipped), replayed offline from `rawHarvestNode` with AI naming force-disabled
- [x] Result caching keyed on URL/mode/**all** image payloads, with force-refresh, bounded entry cap + LRU eviction + idle sweep; transient structure failures are deliberately **not** cached
- [x] Zod schemas as single source of truth (`lib/schema.ts`, `lib/extract/structureSchema.ts`)
- [x] Single AI provider seam (`lib/aiLane.ts`): one pinned model id, one availability check, one retry-then-graceful-`null` policy shared by all three AI call sites

### In Scope — Integration & Deployment

- [x] `POST /api/analyze` REST endpoint (`{ url | images[], mode, forceRefresh }`) with a streamed request-body size limit
- [x] Interactive Next.js workbench: mode toggles, drag-and-drop multi-image upload (structurally paired previews), swatch/contrast previews, tabbed Markdown output with copy/download
- [x] Multi-stage Dockerfile with Playwright deps, base image pinned to the `package.json` Playwright version, hardened non-root runner stage
- [x] Sanitized render-path error responses (no internal detail leakage to the client)
- [x] Flat ESLint config so `npm run lint` (`eslint .`) runs non-interactively in CI

### Planned — AI lane migration & Audit Fixes (Phase 5, in progress)

- [ ] Replace `@anthropic-ai/sdk` with `@google/genai`; use `AI_MODEL = "gemini-2.5-flash"` (with optional `GEMINI_MODEL` env override), gated on `GEMINI_API_KEY`
- [ ] Add a `callModel` primitive + shared `parseJsonLoose` to `lib/aiLane.ts` so no call site touches the SDK or re-inlines brace-match JSON extraction
- [ ] Adopt native JSON mode (`responseMimeType` + `responseJsonSchema`) across all three AI lanes
- [ ] Delete the latent `temperature: 0.1` in `structureAI.ts` and `structureFromImage.ts` (rejected with a 400 by current Claude models; swallowed twice by `retryOnce` → silent heuristic fallback)
- [ ] Retire the hand-written Anthropic media-type union in `structureFromImage.ts` so `imageMediaType.ts` is the only owner of MIME types
- [ ] First-ever live verification of all three AI lanes end-to-end (§11)
- [ ] **SSRF redirect hardening:** Add route-level response interceptor in `lib/ingest.ts` to re-validate IPs on HTTP 301/302 redirects
- [ ] **UI polish:** Dynamicize "Copy .md" and "Download .md" button labels in `app/page.tsx` based on active tab, resolve line 162 TODO, and add an API key setup hint in the meta panel
- [ ] **Automated CI/CD:** Create `.github/workflows/ci.yml` running `npm run typecheck`, `npm run lint`, and `npm run eval` on PRs MIME types
- [ ] First-ever live verification of all three AI lanes end-to-end (§11)

### Out of Scope (deferred)

- [ ] Authentication, multi-tenancy, or persistent server-side storage of reports
- [ ] Crawling beyond a single page (multi-page/site-wide aggregation)
- [ ] Authenticated/paywalled page capture (login flows)
- [ ] Direct code generation (React/Tailwind components) from reports — *the derivation is spiked and GO'd (§12 Phase 6), but shipping it is not in the MVP*
- [ ] Browser-extension or CLI-first distribution
- [ ] Icon/asset extraction and export
- [ ] Multi-provider AI abstraction — Phase 5 is a **replacement**, not an adapter layer; one provider, one code path

## 5. User Stories

1. **As an LLM coding agent**, I want a self-contained spec with explicit units and role names, so that I can rebuild a website without ambiguity. *(e.g. `Scale (px): [4, 8, 16, 24, 32, 48, 64]`, `unit: "px"` in frontmatter)*
2. **As a frontend developer**, I want a site's palette extracted with perceptual role assignment and contrast grades, so that I can adopt its color system accessibly. *(e.g. `on-primary #ffffff on primary — 5.9:1 AA`)*
3. **As a frontend developer**, I want component recipes (Button: bg role, padding, radius, type token) — including distinct variants when a site really has them — so that tokens come with "amounts," not just ingredients.
4. **As a design engineer**, I want hover/focus state deltas and dark-scheme palettes captured from real CSS, so that rebuilt components behave like the original — and I want them *omitted* when the site has none, not invented.
5. **As a designer**, I want to drop in up to six screenshots of a design and get one merged palette plus brand mood/identity, so that I can document references that have no URL.
6. **As an agency builder**, I want a page-structure skeleton that opens with an ordered section digest and carries responsive deltas (`3col → 1col`), so that I can quote and plan a rebuild from one artifact.
7. **As an API consumer**, I want a single `POST /api/analyze` endpoint with caching and predictable limits, so that I can integrate Distill into my own pipeline.

**Technical user stories:**

8. **As a maintainer**, I want extraction logic gated by an offline eval corpus covering *both* tracks, so that heuristic changes can't silently regress real-site quality.
9. **As a maintainer**, I want the measured lane to run with zero API keys, so that evals are deterministic and the product degrades gracefully.
10. **As a maintainer**, I want an AI lane I can actually turn on without a prepaid credit purchase, so that the interpretive features ship instead of permanently falling back. *(Phase 5)*
11. **As a maintainer**, I want AI-lane failures to be visible rather than indistinguishable from "no key configured," so a broken request parameter can't silently disable a feature for months. *(Phase 5 — the `temperature` bug is exactly this failure mode.)*

## 6. Core Architecture & Patterns

**High-level flow:**

```
URL ──▶ ingest (Playwright) ──▶ Capture { screenshot, scrollShots?, panoramaShot?,
                                          styleDump, rawHarvestNode,
                                          responsiveHarvests?, darkCapture? }
                                    │
              ┌─────────────────────┴──────────────────────┐
              ▼                                            ▼
   Track A: extractFromCapture              Track B: extractStructureFromCapture
   (palette → typography → tokens           (prune → squash → repetition → ontology
    → recipes → states → dark)               → AI naming → responsive → metrics
              │                               → tokenLink → section digest)
              │                                            │
              └────────────▶ enrichWithAI (optional) ◀─────┘
                                    │
                             emit: frontmatter + derived body (+ CSS vars)
Images ──▶ imagePalette merge + AI interpret ──▶ palette-mood report (+ inferred structure)
```

**Directory structure:**

```
app/               Next.js App Router — page.tsx workbench, api/analyze/route.ts
lib/
  analyze.ts       orchestration entry points (the measured/AI seam)
  ingest.ts        the single URL→Capture seam (render, panorama, second passes)
  aiLane.ts        the single AI provider seam (model id, availability, retry)
  schema.ts        Zod contract (re-exports structureSchema)
  emit.ts          report → markdown (conditional render* per optional lane)
  color.ts         perceptual color math (Lab/OKLCH, ΔE, contrast)
  cache.ts         bounded in-process response cache (TTL + LRU + sweep)
  security/        ssrfGuard.ts, rateLimiter.ts
  extract/         Track A extractors + structure/ (Track B staged pipeline)
eval/              offline regression harness (corpus captures + expected.yaml + baseline)
.agents/           PRDs, plans, spike reports, reviews, stories (process artifacts)
```

**Key patterns:**

- **Single-walk style dump:** one `page.evaluate` DOM walk produces the `StyleDump` every Track-A extractor consumes; the DOM is never re-walked.
- **Optional-lane contract:** every schema addition = optional field + own `provenance` + `render*` called only `if (report.<field>)`.
- **Shared matchers/seams:** `roleMatch.ts` (ΔE color→role), `styleMatch.ts` (bounds-overlap node matching), and `aiLane.ts` (provider) are the only copies — never re-inlined.
- **Staged, ordered role assignment:** semantic roles claim colors before generic scorers; `pick()` skips taken canonicals.
- **Best-effort second passes:** panorama/responsive/dark captures fail to *absence*, which all consumers already treat as "nothing observed."
- **Modal aggregation, cluster-first:** recipes cluster by background role, then take the mode within each cluster, so outliers can't skew a definition and a real second variant isn't averaged away.
- **Bounded everything:** cache entries, rate-limiter buckets, request body bytes, panorama tiles, and images-per-request all carry explicit caps — an MVP without auth must not have unbounded server-side growth.

## 7. Tools / Features

| Feature | What it does | Key detail |
|---|---|---|
| Palette extraction | Colors → ΔE merge → area-weight vs screenshot pixels → score → role guardrails | WCAG floor on text roles; semantic roles need usage-context evidence |
| Panorama capture | Full-page tiled screenshot, stitched via sharp | Below-the-fold colors count toward area weights; ≤12 viewports; single-viewport pages get none |
| Typography | Family clusters w/ full fallback stacks, size/weight/line-height scale | Desktop h1 anchored to the real `h1`; `sizePxMobile` from the 390px harvest |
| Spacing/radius/elevation | Frequency-ranked, base-unit-snapped scales; named shadow levels | Explicit `unit: "px"`; sections omitted when nothing was observed |
| Recipes + variants | Cluster by bg role → per-cluster modal styles, role-referenced colors | `variant` label only when >1 cluster; falls back to raw hex, never fabricates a role |
| States | CSSOM `:hover`/`:focus-visible` deltas per palette role | Cross-origin sheets skipped silently (spike GO'd, §12 Phase 6) |
| Dark palette | Dark-emulated second dump, emitted only on measured background shift | Single-scheme sites get nothing |
| Structure skeleton | Pruned + wrapper-squashed semantic tree, repetition-collapsed, ASCII emit | Heuristic names always; AI names when keyed (`naming` flag) |
| Page-sections digest | Ordered per-band summary leading the structure body | Measured fields joined from responsive/metrics/token-link; AI adds only the one-line `description` |
| Responsive diff | 390×844 + 768×1024 re-harvests aligned by structural position | Per-component deltas name their viewport; no delta invented when layout is stable |
| Token-link | `both`-mode join of structure components to design tokens | Bounds overlap + ΔE/exact-scale match; never guesses |
| Image path | ≤6 images → merged palette + AI mood; AI-inferred skeleton | Stamped `fidelity: inferred`; no fake bounds, no fake semantic swatches |
| CSS variables block | Derived `:root {}` fence closing the design report | Zero new schema surface; traces 1:1 to frontmatter |

## 8. Technology Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) + React 19 | Workbench UI + API route in one deployable |
| Styling | Tailwind CSS 4 | |
| Browser automation | Playwright 1.61.1 (pinned; Chromium auto-installed postinstall) | Rendered-page capture, viewport/media emulation; Docker base image pinned to the same version |
| Image analysis | sharp ^0.35 | Pixel sampling for area weights, panorama stitching, image quantization |
| Color science | culori ^4 | Lab/OKLCH conversion, ΔE |
| Validation | Zod 4 | Single-source report contracts |
| AI lane (optional) | **Today:** `@anthropic-ai/sdk` (`claude-opus-4-8`), gated on `ANTHROPIC_API_KEY`. **Phase 5:** `@google/genai` ^2.13 (`gemini-2.5-flash`), gated on `GEMINI_API_KEY` | Vision interpretation + semantic naming; fails open either way. Gemini's free tier removes the prepaid-credit barrier that has kept this lane dark, and its native JSON mode removes the brace-match JSON extraction |
| Serialization | js-yaml | Frontmatter emit |
| Tooling | TypeScript 5.7, tsx (eval scripts), ESLint 9 flat config (`eslint .`) | No jest/vitest — the eval harness is the correctness gate |
| Runtime | Node 18+ (developed on 20/22) | |

## 9. Security & Configuration

- **Authentication:** none — MVP is a local/self-hosted tool; the API route is unauthenticated by design. Anyone deploying publicly must add their own auth in front (see README "Deploying Publicly — Hardening Guide").
- **Configuration** (all optional; sane defaults, absence never blocks measured extraction):

  | Env var | Purpose |
  |---|---|
  | `ANTHROPIC_API_KEY` → **`GEMINI_API_KEY`** (Phase 5) | Enables the AI lane. Read server-side only |
  | `SSRF_ALLOWLIST_HOSTS` | Comma-separated exact hostnames exempt from the SSRF guard (staging/fixture hosts) |
  | `RATE_LIMIT_MAX_REQUESTS` / `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_BUCKETS` / `RATE_LIMIT_DISABLED` | Per-client token bucket on `/api/analyze` |
  | `CACHE_MAX_ENTRIES` | Response-cache entry cap (LRU beyond it) |

- **In-scope security posture:**
  - AI-lane key read server-side only; never sent to the client. Provider swap (Phase 5) changes the variable name, not this boundary.
  - Image uploads capped (`MAX_IMAGES = 6`, ≤8 MB each); AI lane further caps at 4 images sent to the model; the whole request body is size-limited while streaming, before parsing.
  - SSRF guard on URL ingestion: hostname DNS-resolved and validated against loopback/private/link-local/CGNAT/multicast/reserved ranges (IPv4, IPv6, and IPv4-mapped IPv6 in both spellings) before navigation, fail-closed, non-`http(s)` schemes rejected, with an explicit `SSRF_ALLOWLIST_HOSTS` opt-out for trusted internal targets.
  - Per-client rate limiting on `POST /api/analyze`: bounded token-bucket store capped at `RATE_LIMIT_MAX_BUCKETS` distinct client IDs to prevent unbounded memory growth via spoofed client identifiers.
  - Render-path errors sanitized before they reach the client; injection surfaces (page-controlled text reaching an AI prompt) annotated in-code.
  - No report/user data persisted beyond the bounded in-process analysis cache.
- **Out of scope:** user accounts, secrets management beyond env vars, a shared/global rate-limit or cache store for multi-instance deployments (each process enforces its own independent limit), and post-navigation egress control (the initial SSRF guard validates the submitted URL; intermediate HTTP 301/302 redirects require route-level IP interceptors or network-level egress filtering).
- **Data-handling note (Phase 5):** Google's **free tier uses submitted prompts for product improvement**; the paid tier does not. Distill's AI-lane inputs are screenshots of third-party sites. Operators pointing Distill at sensitive or internal properties should use a paid tier — this is a deployment decision, not a code change.
- **Deployment:** local dev (`npm run dev`), production Node server, or the provided multi-stage Docker image with Playwright system deps baked in and a non-root runner stage.

## 10. API Specification

### `POST /api/analyze`

**Request** (JSON):

```jsonc
{
  "url": "https://stripe.com",          // OR images — mutually exclusive inputs
  "images": [{ "data": "<base64>", "name": "home.png" }],  // ≤ 6, ≤ 8 MB each
  "image": "<base64>", "imageName": "x.png",  // deprecated single-image alias, merged into images
  "mode": "tokens" | "structure" | "both",    // image input always yields palette-mood (+ inferred structure)
  "forceRefresh": false                        // bypass cache
}
```

**Response** (JSON):

```jsonc
{
  "designMarkdown": "---\n…frontmatter…\n---\n…body…",   // when tokens lane ran
  "structureMarkdown": "…",                               // when structure lane ran
  "structureUnavailableReason": "…",                      // structure requested but not producible
  "viewportShots": ["<base64>", "…"],                     // one preview per source image / URL viewport + panorama
  "viewportShot": "<base64>",                             // legacy singular alias
  "cached": true
}
```

- **Auth:** none (see §9).
- **Caching:** key hashes url + mode + **every** image payload. Responses carrying a transient `structureUnavailableReason` are not cached, so a retry can succeed.
- **Limits:** request body size-capped while streaming (413-style rejection before parse); rate limit applied *after* the cache lookup, so cache hits cost nothing.
- **Errors:** 4xx on invalid/oversized payload (Zod-rejected), 429 with `Retry-After` when rate-limited, 5xx (sanitized) on render/extraction failure; AI-lane failure is *not* an error — the measured report returns untouched.

## 11. Success Criteria

**MVP success definition:** a `both`-mode run on a real production site yields two reports from which a competent LLM/developer can rebuild the page's visual system without viewing the site.

**Functional requirements:**

- [x] Every emitted field traces to a measurement or is provenance-stamped `inferred`/`ai`; unmeasured lanes are omitted
- [x] Measured lane runs offline with no API key; AI failure degrades to measured output
- [x] `npm run eval` passes: per-site floor (0.7) + no regression below `eval/baseline.json`, with the structure lane scored, not skipped
- [x] Frontmatter parses (Zod-validated) and body values match frontmatter (derived from one object)
- [x] Single-scheme sites emit no dark palette; state-less sites emit no `## States`; unobserved spacing/radius emit nothing
- [x] Image input never fabricates typography/spacing/bounds/semantic swatches
- [ ] **AI lane verified live** (Phase 5): a keyed `both`-mode URL run produces `identity` + `imageMood` at `provenance: ai` **and** a structure report with `naming: "ai"` and section `description`s; a keyed image run in `structure` mode produces a `fidelity: "inferred"` skeleton rather than a `structureUnavailableReason`
- [ ] **`npm run eval` remains fully offline with an AI key set** (Phase 5) — the `forceHeuristicNaming` short-circuit stays ahead of the availability check

**Quality indicators:**

- Eval corpus scores at/above committed baseline (currently 1.0 on both sites); AI-lane stability across repeated runs (`npm run eval:ai` — Jaccard floors 0.5 adjectives / 0.3 archetype, which will run for the first time in Phase 5)
- Spacing scales are base-unit multiples, not noise; recipes match fixture CSS ground truth
- Structure skeleton, section digest, and component map never contradict each other

**UX goals:** URL → report in one interaction; copy/download in one click; honest UI copy (image mode advertises exactly what it delivers).

## 12. Implementation Phases (retrospective + forward)

### Phase 1 — Core pipeline & report quality *(delivered)*
- **Goal:** correct, deterministic extraction and well-formed reports.
- [x] Style-dump primitive, palette/typography/token lanes, structure pipeline, emit path
- [x] Round-1 fixes: spacing-scale ranking, skeleton connectors, snippet hygiene, instance counts, font stacks, layout mechanics, radius/elevation naming, token cross-links, compact machine block
- **Validation:** `npm run eval` green; stripe.com reports sane by audit.

### Phase 2 — Rebuild sufficiency *(delivered)*
- **Goal:** reports sufficient to rebuild a site.
- [x] Round-2/3 fixes: ontology naming reachability, component-map union, heuristic fallback names, `naming` flag, `padY` intent annotations, recipes, on-primary/contrast pairs, states lane, responsive capture, dark-scheme capture, CSS-variables block
- **Validation:** key-less fixture runs read semantically; dual-palette fixture; refreshed corpus landed deliberately.

### Phase 3 — Input parity & coverage *(delivered)*
- **Goal:** honest, capable image path + fuller page coverage.
- [x] Multi-image merge, AI-inferred image structure (`fidelity: inferred`), NavItem/Badge recipes, full-page panorama capture
- **Validation:** two-image upload → one merged palette; panorama colors reach area weights.

### Phase 4 — Hardening & reach *(delivered)*
- **Goal:** make Distill safe to deploy publicly, broader in coverage, and honest about its own gaps.
- [x] SSRF guard (resolve-then-check, fail-closed) + `SSRF_ALLOWLIST_HOSTS`, plus a follow-up pass closing residual gaps (CGNAT/multicast/reserved, IPv4-mapped IPv6 spellings)
- [x] Per-client rate limiting with bounded bucket store; bounded response cache; request-body size limit; sanitized render-path errors
- [x] README deployment-hardening guide with egress-restriction example
- [x] Tablet viewport (768px) in `RESPONSIVE_VIEWPORTS` (capture-shape change → corpus refresh in the same PR)
- [x] Structure lane restored to the eval harness (scored, error ⇒ 0)
- [x] Big-picture structure & recipe quality: wrapper-chain squash, naming fixes, nav-`<button>` routing, recipe variant clustering + labels, measured section digest, sections-led structure body, AI section descriptions, desktop-h1 anchoring, zero-width border color
- [x] Docker build/run reliability (pinned base image, hardened runner); flat ESLint config
- [x] Three spikes concluded with GO recommendations: motion/transition tokens (`.agents/reports/motion-spike.md`), report-to-code Tailwind theme (`tailwind-theme-spike-report.md`), cross-origin state capture (`cross-origin-states-spike.md`)
- **Validation:** eval corpus refreshed deliberately, once, alongside the capture-shape change; new lanes additive.

### Phase 5 — AI lane migration & Codebase Audit Fixes *(planned, in progress)*

- **Goal:** make the AI lane *actually run* — one provider, one code path, zero cost to start — and resolve critical audit findings. Source of truth: `from-claude-to-gemini-plan.md` + `CODEBASE_ANALYSIS.md`.
- **Why now:** `ANTHROPIC_API_KEY` has never been set (an Anthropic key requires a prepaid credit purchase), so every AI lane has silently fallen back since day one. Google AI Studio issues a free-tier, vision-capable key with no credit card. A latent `temperature: 0.1` in two call sites would have 400'd even *with* a valid Anthropic key — `retryOnce` swallows it twice and returns `null` — so two of the three lanes could never have worked regardless of provider.
- **Scope:**
  - [ ] `lib/aiLane.ts` — swap the SDK, set `AI_MODEL = "gemini-2.5-flash"` (with `process.env.GEMINI_MODEL` fallback), `aiLaneAvailable()` on `GEMINI_API_KEY`; keep `retryOnce` as-is; add `callModel(opts)` (images / system / user / `jsonSchema` / `maxOutputTokens` / `thinkingLevel`) and a shared `parseJsonLoose` so no lane re-inlines the brace-match regex
  - [ ] `lib/interpret.ts` — drop the SDK import; `OUTPUT_SCHEMA` passes through to `responseJsonSchema` unchanged; raise `MAX_TOKENS` 1024 → 2048 (thinking tokens share the budget) with `thinkingLevel: MINIMAL`; keep the prompt-injection comment block and the `aiLaneAvailable` re-export
  - [ ] `lib/extract/structure/structureAI.ts` (Stage 7) — drop the SDK import and `temperature`, add a `STRUCTURE_SCHEMA` mirroring `aiStructureResponseSchema` (open key sets as `additionalProperties`), raise the token budget above 3000, replace `content[0]` + regex with `parseJsonLoose`; **the `forceHeuristicNaming` short-circuit must stay ahead of the availability check** so `npm run eval` stays offline
  - [ ] `lib/extract/structureFromImage.ts` — drop the SDK import, `temperature`, and the hand-written media-type union; recursive `$defs`/`$ref` schema attempted, falling back to JSON-mode-without-schema if the API rejects it (Zod is the real gate); `thinkingLevel: MEDIUM`
  - [ ] `lib/extract/imageMediaType.ts` — comment-only provider rename; the four MIME values are already valid Gemini types
  - [ ] `lib/ingest.ts` — add Playwright route-level response interceptor (`page.route("**/*", ...)` or `page.on("response", ...)`) to validate IPs on HTTP 301/302 redirects against `assertSafeUrl`
  - [ ] `app/page.tsx` — update Copy/Download button labels based on active tab (`Copy Design System .md` vs `Copy Structure .md`), resolve line 162 TODO, and add an API key setup hint in the meta header
  - [ ] Dependencies & docs — remove `@anthropic-ai/sdk`, add `@google/genai` ^2.13; update `README.md`, `CLAUDE.md`, `eval/stability.ts`, `eval/run.ts` comments; create `.github/workflows/ci.yml`
  - [ ] Retire `.agents/temp/AI-LANE-NOTES.md` (gitignored scratch) once this lands
- **Validation:** `lint` + `typecheck` clean; **`npm run eval` passes with the baseline untouched** (the measured lane is provider-independent — *any* score movement means something leaked across the measured/AI split, and `UPDATE_BASELINE=1` must not be run); eval stays offline with a key set; `npm run eval:ai` executes for the first time and meets its stability floors; live `both`-mode URL run and image `structure` run exercise all three lanes with a clean server console.

### Phase 6 — Spiked, GO'd, not yet built *(open, proposed)*

Each item below already has a completed spike with evidence and a delivery recommendation; the remaining work is implementation under the existing optional-lane contract.

- [ ] **Motion/transition token lane** — declared `transition-*`/`animation-*` + `@keyframes` read off the existing style-dump walk (one new record-skip condition), attributed per recipe element class. JS-driven motion is an honest, documented gap.
- [ ] **`emitTailwindTheme(report)`** — a second derived view (Tailwind v4 `@theme` + `prefers-color-scheme` dark override) plus a download button; zero new schema surface, `--spacing: <baseUnitPx>px` rather than positional spacing vars.
- [ ] **Cross-origin state capture** — Strategy A (`context.request` re-fetch + re-parse) recovers `:hover`/`:focus-visible` deltas from cross-origin stylesheets while leaving semantics, schema, and capture shape byte-identical.

## 13. Future Considerations

- **Multi-page aggregation:** crawl N pages of one site, merge palettes/recipes across pages with per-page provenance.
- **Authenticated capture:** cookie/storage-state injection for logged-in pages.
- **Diffing:** compare two runs of the same site over time ("design drift" reports).
- **CLI / library packaging:** expose `analyzeUrl`/`analyzeImages` as an installable package decoupled from Next.js.
- **More viewports & container-query awareness** in the responsive diff.
- **APCA-first contrast reporting** as WCAG 3 matures.
- **Paid AI tier / provider re-evaluation:** if free-tier rate limits or the free-tier data-use policy become binding constraints, upgrade the key — deliberately *not* an argument for a multi-provider abstraction layer.

## 14. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Heuristic changes silently regress extraction quality on real sites | Wrong reports, eroded trust | Offline eval harness with per-site floors + baseline gate, both tracks scored; deliberate-only baseline refresh (`UPDATE_BASELINE=1`) |
| AI lane drift/hallucination contaminates measured data | Violates core principle | Hard lane separation (`extractFromCapture` is network-free); AI output merged onto — never into — measured fields; provenance stamps; `eval:ai` stability check |
| **Graceful AI fallback hides real breakage** (proven: `temperature: 0.1` disabled two lanes indefinitely, indistinguishable from "no key set") | Features silently never ship | Phase 5 deletes the offending parameter; live end-to-end verification is an explicit Phase-5 exit criterion; console warnings (`AI Structure Labeller failed`, `Vision structure inference failed`) must be checked, not assumed absent |
| **Gemini free-tier rate limits (≈10 RPM)** — a `both`-mode run fires two AI calls with up to four images | Bursty testing 429s; `retryOnce` treats a 429 as failure and falls back, so a rate-limited run *looks identical to a quality regression* | Response cache absorbs repeats; check the server console before concluding the model is bad; upgrade tier if it binds |
| **Free-tier prompts used for Google product improvement** | Third-party screenshots leave the operator's control | Documented in §9; the fix is a paid tier, not a code change; operators decide before pointing Distill at sensitive properties |
| Vision quality regression moving off a frontier model | Image-derived skeletons degrade | `thinkingLevel: MEDIUM` on the vision lane; explicit spot-check in Phase-5 validation; Zod remains the hard gate on shape |
| Open URL fetching enables SSRF on public deployments | Server compromise | Initial resolve-then-check guard + `SSRF_ALLOWLIST_HOSTS` (§9); Phase 5 adds Playwright route-level HTTP redirect IP checking; README hardening guide documents egress-blocking for post-navigation subresources |
| Site anti-bot / consent walls break capture | Empty or skewed reports | Consent-banner dismissal in ingest; best-effort second passes fail to absence; cache + forceRefresh for retries |
| Capture-shape evolution invalidates frozen eval fixtures | Green-but-meaningless evals | Policy: fixtures refreshed only when capture shape itself changes, in the same PR, with baseline; new lanes must treat absent fields as "nothing observed" |
| Playwright/Chromium footprint complicates deployment | Failed installs | postinstall auto-install; multi-stage Dockerfile with browser deps baked in, base image pinned to the `package.json` version |
| Unauthenticated endpoint invites resource exhaustion | Cost/DoS on public deploys | Bounded cache, bounded rate-limiter store, request-body cap, image count/size caps; auth explicitly the deployer's responsibility |

## 15. Appendix

- **Related documents:**
  - `README.md` — user-facing capabilities & setup
  - `CLAUDE.md` — authoritative agent/contributor architecture guide (`AGENTS.md` points to it)
  - `PLAN.md` — rounds 1–3 fix-plan history (the de-facto changelog of Phases 1–3)
  - `from-claude-to-gemini-plan.md` — the Phase-5 migration plan (source of truth for §12 Phase 5)
  - `.agents/plans/completed/`, `.agents/reports/`, `.agents/reviews/`, `.agents/stories/` — per-story plans, spike reports, code reviews, and backlog
- **Key spike reports:** `motion-spike.md` (GO), `tailwind-theme-spike-report.md` (GO), `cross-origin-states-spike.md` (GO, Strategy A)
- **Key dependencies:** [Playwright](https://playwright.dev), [sharp](https://sharp.pixelplumbing.com), [culori](https://culorijs.org), [Zod](https://zod.dev), and the AI SDK — [Anthropic](https://docs.anthropic.com) today, [Google Gen AI](https://ai.google.dev) after Phase 5 (free key: https://aistudio.google.com/apikey).
- **Repository structure:** see §6; eval harness under `eval/` (`run.ts`, `score.ts`, `scoreStructure.ts`, `stability.ts`, `corpus/{clean-light,dark-mode}/`, `baseline.json`).
