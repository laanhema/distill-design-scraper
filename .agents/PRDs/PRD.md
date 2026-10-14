# PRD — Distill: Design System & Structure Scraper

> **Note:** This PRD was authored retroactively (2026-07-23) against an already-built codebase, refreshed **2026-07-29**, and updated **2026-10-13** to (a) record delivery of Phase 7 (codebase health audit remediation) and Phase 8 (heuristic-invariant audit), (b) tick closed criteria, and (c) capture workbench UI polish, distill-theme styling, and the view-obscuring overlay mitigation spike. "In Scope" items marked `[x]` are implemented and verified; unchecked items are genuinely open. Implementation phases mirror the actual delivery history recorded in `PLAN.md`, `.agents/plans/completed/`, and git.
Last Updated: 2026-10-14

---

## 1. Executive Summary

Distill converts any live website URL — or one or more uploaded screenshots — into a structured Markdown **design-system report** and **page-architecture report**. Each report pairs machine-parseable YAML frontmatter with a human-readable body derived from the *same* underlying object, so the two representations can never drift. The goal: **an LLM or developer should be able to build a new website from these two files alone.**

The product's differentiating principle is **"measured, never faked."** Every extracted value is stamped with provenance (`measured` / `inferred` / `ai`); a signal that cannot be observed produces an *omitted* field, never a synthesized one. Deterministic extraction (headless Chromium render → single DOM style-dump walk → perceptual color science → staged structure pipeline) runs fully offline-capable; an optional AI vision lane enriches — but never replaces — measured output.

The MVP goal: given a URL, produce token and structure reports faithful enough to rebuild the page's visual system (palette with roles and contrast pairs, typography scale with fallback stacks, spacing/radius/elevation tokens, component recipes with variants, interactive states, responsive deltas across mobile + tablet, light+dark schemes, and a semantic component skeleton led by an ordered page-section digest) — with a lighter palette-and-mood path for image input.

**Current standing (2026-10-13):** the measured lanes (Tracks A and B) and AI enrichment lanes are complete and regression-gated. **Phases 1 through 8 have all landed.** The codebase health remediation (Phase 7, DIST-048 → DIST-061) closed all correctness defects (motion lane preserved under AI enrichment, CSSOM scanner deduplication, unraceable SSRF redirect checking, `structureUnavailableReason` on keyless paths, and strict eval corpus gates). The heuristic-invariant audit (Phase 8, DIST-062 → DIST-077) added the `adversarial-shell` eval fixture, landmark-based region typing, non-displaceable semantic roles, and bundle-optimized Tailwind export. Workbench UI polish, semantic token styling (`app/distill-theme.css`), and the overlay mitigation spike (`.agents/reports/overlay-mitigation-spike.md`) have followed.

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
- [x] Single AI provider seam (`lib/aiLane.ts`): one `callModel` primitive, one availability check, one `parseJsonLoose`, one retry-then-graceful-`null` policy shared by all three AI call sites — *no call site imports a provider SDK*
- [x] ~~**Regression:** that seam is no longer single-provider. The OpenRouter addition (#94/#95) introduced a second model-selection path (`OPENROUTER_MODEL`) and a second request builder that silently ignores `thinkingLevel` and weakens JSON-schema enforcement — see §12 Phase 7 / P2-1~~ — **closed 2026-07-29 (DIST-056).** `jsonSchema` now sends a real (non-strict) `response_format: json_schema` on OpenRouter; `thinkingLevel` remains a documented, one-time-logged Gemini-only gap; both providers default to the same model generation (`gemini-3.5-flash`), each independently overridable (`GEMINI_MODEL`/`OPENROUTER_MODEL`). **Superseded 2026-10-14 (#199):** the native Gemini path, `GEMINI_MODEL` and `thinkingLevel` were removed; the seam is single-provider again.

### In Scope — Integration & Deployment

- [x] `POST /api/analyze` REST endpoint (`{ url | images[], mode, forceRefresh }`) with a streamed request-body size limit
- [x] Interactive Next.js workbench: mode toggles, drag-and-drop multi-image upload (structurally paired previews), swatch/contrast previews, tabbed Markdown output with copy/download
- [x] Multi-stage Dockerfile with Playwright deps, base image pinned to the `package.json` Playwright version, hardened non-root runner stage
- [x] Sanitized render-path error responses (no internal detail leakage to the client)
- [x] Flat ESLint config so `npm run lint` (`eslint .`) runs non-interactively in CI

### Delivered — AI lane migration & audit fixes (Phase 5)

- [x] Replaced `@anthropic-ai/sdk` with `@google/genai`, gated on `GEMINI_API_KEY`. *Shipped as `AI_MODEL = "gemini-3.5-flash"`, not the specced `gemini-2.5-flash`; the planned `GEMINI_MODEL` env override was **not** implemented*
- [x] `callModel` primitive + shared `parseJsonLoose` in `lib/aiLane.ts` — no call site touches an SDK or re-inlines brace-match JSON extraction
- [x] Native JSON mode (`responseMimeType` + `responseJsonSchema`) across all three AI lanes *(Gemini path only — see the OpenRouter caveat in §4 Technical)*
- [x] Deleted the latent `temperature: 0.1` in `structureAI.ts` and `structureFromImage.ts`
- [x] Retired the hand-written Anthropic media-type union; `imageMediaType.ts` is the only owner of MIME types
- [x] First-ever live verification of all three AI lanes end-to-end (DIST-039) — `npm run eval` confirmed still offline with a key set, `npm run eval:ai` executed for the first time
- [x] AI-lane failures made distinguishable from an unconfigured key (`warnAiFailure`, DIST-040) — closes the §14 "graceful fallback hides breakage" risk for *call* failures
- [x] **SSRF redirect hardening:** response interceptor in `lib/ingest.ts` re-validating 30x `Location` targets via `assertSafeUrl` *(best-effort — see §9 for the limits of this control)*
- [x] **UI polish:** tab-aware Copy/Download labels and an API-key setup hint in `app/page.tsx`
- [x] **Automated CI:** `.github/workflows/ci.yml` running `npm run typecheck`, `npm run lint`, `npm run eval` on PRs *(no `npm run build` step — §12 Phase 7 / P2-4)*

### Delivered — spiked lanes (Phase 6)

- [x] **Motion/transition token lane** — `transition-*`/`animation-*` + `@keyframes` off the existing style-dump walk, attributed per recipe element class (`lib/extract/motion.ts`)
- [x] **`emitTailwindTheme(report)`** — Tailwind v4 `@theme` derived view + `prefers-color-scheme` dark override, with a UI download button; zero new schema surface
- [x] **Cross-origin state capture** — Strategy A (`context.request` re-fetch + re-parse) in `styleDump.ts` *(shipped, but currently recovers only `color`; see §12 Phase 7 / P0-2)*

### Out of Scope (deferred)

- [ ] Authentication, multi-tenancy, or persistent server-side storage of reports
- [ ] Crawling beyond a single page (multi-page/site-wide aggregation)
- [ ] Authenticated/paywalled page capture (login flows)
- [ ] Direct code generation (React/Tailwind components) from reports — *`emitTailwindTheme` ships a **token-level** derived view (§12 Phase 6); component-level codegen remains out of scope*
- [ ] Browser-extension or CLI-first distribution
- [ ] Icon/asset extraction and export
- [x] ~~Multi-provider AI abstraction — Phase 5 is a **replacement**, not an adapter layer; one provider, one code path~~ — **superseded 2026-07-29.** #94/#95 added an OpenRouter path, so the codebase now has two providers behind one seam. This was a scope change, not an implementation of the above intent. **Settled 2026-07-29 (DIST-056):** two providers behind one seam is accepted scope, not a regression — `lib/aiLane.ts` is still the only file importing a provider SDK, and the `ModelCall` contract's one intentionally-accepted gap (`thinkingLevel` on OpenRouter) is documented at the call sites and logged once at runtime. **Reverted 2026-10-14 (#199):** the native Gemini path was removed, so the AI lane has one provider, OpenRouter, and one code path again.

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
  emitTailwind.ts  standalone Tailwind v4 @theme export (kept out of client bundle)
  color.ts         perceptual color math (Lab/OKLCH, ΔE, contrast)
  cache.ts         bounded in-process response cache (TTL + LRU + sweep)
  security/        ssrfGuard.ts, rateLimiter.ts
  extract/         Track A extractors + structure/ (Track B staged pipeline)
eval/              offline regression harness (corpus captures + expected.yaml + baseline)
.agents/           PRDs, plans, spike reports, reviews, stories, design-system (process artifacts)
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
| States | CSSOM `:hover`/`:focus-visible` deltas per palette role | Cross-origin sheets re-fetched and re-parsed via `context.request` — but that path currently recovers only `color` (§12 Phase 7 / P0-2) |
| Motion tokens | Declared `transition-*`/`animation-*` + referenced `@keyframes`, attributed per recipe element class | Read off the existing style-dump walk; JS-driven motion is a documented gap. **Currently dropped from the report whenever the AI lane runs** (§12 Phase 7 / P0-1) |
| Tailwind `@theme` | Second derived view of the same report object, downloadable from the workbench | Zero new schema surface; `--spacing: <baseUnitPx>px`; emits a `prefers-color-scheme` dark block when `paletteDark` exists |
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
| AI lane (optional) | OpenRouter over plain `fetch` (no model SDK), gated on `OPENROUTER_API_KEY`; model from `OPENROUTER_MODEL` (default `google/gemini-3.5-flash`) | Vision interpretation + semantic naming; fails open. Sends a real non-strict `response_format: json_schema`; no thinking cap is sent. The native Gemini SDK path of Phase 5 was removed (#199) |
| Serialization | js-yaml ^5.2 (ships its own types) | Frontmatter emit |
| Tooling | TypeScript 5.7, tsx (eval scripts), ESLint 9 flat config (`eslint .`) | No jest/vitest — the eval harness is the correctness gate |
| Runtime | Node 18+ (developed on 20/22) | |

## 9. Security & Configuration

- **Authentication:** none — MVP is a local/self-hosted tool; the API route is unauthenticated by design. Anyone deploying publicly must add their own auth in front (see README "Deploying publicly: hardening guide").
- **Configuration** (all optional; sane defaults, absence never blocks measured extraction):

  | Env var | Purpose |
  |---|---|
  | `OPENROUTER_API_KEY` | Enables the AI lane. Read server-side only |
  | `OPENROUTER_MODEL` | Model id (default `google/gemini-3.5-flash`) |
  | `SSRF_ALLOWLIST_HOSTS` | Comma-separated exact hostnames exempt from the SSRF guard (staging/fixture hosts) |
  | `RATE_LIMIT_MAX_REQUESTS` / `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_BUCKETS` / `RATE_LIMIT_DISABLED` | Per-client token bucket on `/api/analyze` |
  | `CACHE_MAX_ENTRIES` | Response-cache entry cap (LRU beyond it) |
  | `UPDATE_BASELINE` | Eval-harness only: rewrites `eval/baseline.json` instead of gating against it |

- **In-scope security posture:**
  - AI-lane key read server-side only; never sent to the client. Provider swap (Phase 5) changes the variable name, not this boundary.
  - Image uploads capped (`MAX_IMAGES = 6`, ≤8 MB each); AI lane further caps at 4 images sent to the model; the whole request body is size-limited while streaming, before parsing.
  - SSRF guard on URL ingestion: hostname DNS-resolved and validated against loopback/private/link-local/CGNAT/multicast/reserved ranges (IPv4, IPv6, and IPv4-mapped IPv6 in both spellings) before navigation, fail-closed, non-`http(s)` schemes rejected, with an explicit `SSRF_ALLOWLIST_HOSTS` opt-out for trusted internal targets.
  - **Redirect interception (`lib/ingest.ts:364`) is a best-effort mitigation, not a pre-navigation block.** Two limits are inherent to the mechanism and should not be read as stronger than they are: (a) Playwright does not await async `page.on("response")` listeners, so the handler's DNS lookup races `page.goto()` resolving — the DIST-044 synthetic test passes because a literal IP resolves instantly, but a hostname requiring a real lookup may not trip the guard in time; and (b) by the time the 30x response event fires, **Chromium has already issued the request to the redirect target**. The control therefore prevents the *result* from reaching the client, not the internal request itself. Network-level egress filtering (README "Layer 2") remains the actual boundary. Tracked as §12 Phase 7 / P0-4.
  - Per-client rate limiting on `POST /api/analyze`: bounded token-bucket store capped at `RATE_LIMIT_MAX_BUCKETS` distinct client IDs to prevent unbounded memory growth via spoofed client identifiers.
  - Render-path errors sanitized before they reach the client; injection surfaces (page-controlled text reaching an AI prompt) annotated in-code.
  - No report/user data persisted beyond the bounded in-process analysis cache.
- **Out of scope:** user accounts, secrets management beyond env vars, a shared/global rate-limit or cache store for multi-instance deployments (each process enforces its own independent limit), and post-navigation egress control for *subresources* the rendered page fetches (the SSRF guard validates the submitted URL; the redirect interceptor is best-effort per above — neither constrains what the page itself requests once loaded).
- **Data-handling note:** Distill's AI-lane inputs are screenshots of third-party sites. They go to OpenRouter, a data processor with its own retention terms, which routes them to the model's provider (Google for the default model), and the request sends an identifying `HTTP-Referer`/`X-Title` pair. Operators who point Distill at sensitive or internal properties should check both sets of terms first — this is a deployment decision, not a code change.
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

**Response** (JSON) — *corrected 2026-07-29; the previously documented `designMarkdown` / `structureMarkdown` / `cached` shape was never what the route returned:*

```jsonc
{
  "ok": true,
  "report": { /* Report object — Zod-validated, frontmatter source */ },
  "markdown": "---\n…frontmatter…\n---\n…body…",   // design-system report
  "structureReport": { /* StructureReport | null — carries its own .markdown */ },
  "structureUnavailableReason": "…",               // structure requested but not producible
  "refinements": [{ "hex": "#…", "from": "accent", "to": "primary" }],  // AI role relabels applied
  "meta": {
    "finalUrl": "…", "title": "…", "elapsedMs": 1234,
    "bannerDismissed": false, "aiApplied": true, "capturedAt": "…",
    "viewportShot": "data:image/png;base64,…",     // legacy singular alias
    "viewportShots": ["data:image/png;base64,…"]   // URL: viewport + panorama; images: one per source
  }
}
```

- **Auth:** none (see §9).
- **Caching:** key hashes url + mode + **every** image payload. Responses carrying a transient `structureUnavailableReason` are not cached, so a retry can succeed. There is **no `cached` flag** — a cache hit replays the stored payload verbatim and is indistinguishable to the client.
- **Limits:** request body size-capped while streaming (413 before `JSON.parse`); rate limit applied *after* the cache lookup, so cache hits cost nothing.
- **Errors:** `413` oversized body; `400` non-JSON body, missing `url`/`images`, or `UnsafeUrlError`; `422` `DegenerateImageError` (unreadable/transparent upload — the input is at fault, not the pipeline); `429` with `Retry-After` when rate-limited; `502` sanitized catch-all on render/extraction failure. AI-lane failure is *not* an error — the measured report returns untouched. *Note: the request body is validated by hand, not by Zod — the earlier "Zod-rejected" claim was inaccurate.*

## 11. Success Criteria

**MVP success definition:** a `both`-mode run on a real production site yields two reports from which a competent LLM/developer can rebuild the page's visual system without viewing the site.

**Functional requirements:**

- [x] Every emitted field traces to a measurement or is provenance-stamped `inferred`/`ai`; unmeasured lanes are omitted
- [x] Measured lane runs offline with no API key; AI failure degrades to measured output
- [x] `npm run eval` passes: per-site floor (0.7) + no regression below `eval/baseline.json`, with the structure lane scored, not skipped
- [x] Frontmatter parses (Zod-validated) and body values match frontmatter (derived from one object)
- [x] Single-scheme sites emit no dark palette; state-less sites emit no `## States`; unobserved spacing/radius emit nothing
- [x] Image input never fabricates typography/spacing/bounds/semantic swatches
- [x] **AI lane verified live** (DIST-039): all three lanes exercised end-to-end against Gemini
- [x] **`npm run eval` remains fully offline with an AI key set** — the `forceHeuristicNaming` short-circuit sits ahead of the availability check in `runStructureAILabeller`
- [x] **A measured lane cannot be lost by enabling the AI lane** — *closed:* `enrichWithAI` spreads `...measured.report` into `buildReport` (`lib/analyze.ts:160-165`) so measured lanes survive enrichment
- [x] **A shipped lane measures what it claims** — *closed:* cross-origin state capture and scanner deduplication delivered in DIST-048 (#110), recovering all properties without naming mismatch

**Quality indicators:**

- Eval corpus scores at/above committed baseline (three fixtures: `clean-light`, `dark-mode`, and `adversarial-shell` scored offline against `expected.yaml`); AI-lane stability across repeated runs (`npm run eval:ai` — Jaccard floors 0.5 adjectives / 0.3 archetype, first executed in DIST-039)
- Spacing scales are base-unit multiples, not noise; recipes match fixture CSS ground truth
- Structure skeleton, section digest, and component map never contradict each other
- **Gate honesty:** `typecheck`, `lint`, and `eval` all pass on `main`. `npm run eval` enforces strict failure on missing non-optional corpus captures (DIST-060); uncommitted live entries carry explicit `optional: true`. Passing gates is necessary, not sufficient — new lanes need coverage that actually exercises them (P0-1 and P0-2 are both invisible to the current harness by construction)

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

### Phase 5 — AI lane migration & audit fixes *(delivered, DIST-034 → DIST-046)*

- **Goal:** make the AI lane *actually run* — one provider, one code path, zero cost to start — and resolve critical audit findings.
- **Why it mattered:** `ANTHROPIC_API_KEY` was never set (an Anthropic key requires a prepaid credit purchase), so every AI lane silently fell back from day one. A latent `temperature: 0.1` in two call sites would have 400'd even *with* a valid key — `retryOnce` swallowed it twice and returned `null` — so two of three lanes could never have worked regardless of provider.
- **Delivered:**
  - [x] `lib/aiLane.ts` rebuilt on `@google/genai` with `callModel(opts)` + shared `parseJsonLoose`; `retryOnce` kept as-is *(shipped as `gemini-3.5-flash`; the specced `GEMINI_MODEL` override was dropped — the Gemini path has no model override, while the later OpenRouter path does)*
  - [x] `lib/interpret.ts` on `callModel` + native JSON mode; `MAX_TOKENS` 1024 → 2048 with `thinkingLevel: MINIMAL`
  - [x] `structureAI.ts` (Stage 7) — `temperature` deleted, `STRUCTURE_SCHEMA` added, `parseJsonLoose` replaces `content[0]` + regex; `forceHeuristicNaming` short-circuit verified ahead of the availability check
  - [x] `structureFromImage.ts` — SDK import, `temperature`, and hand-written media-type union all retired; `thinkingLevel: MEDIUM`
  - [x] `lib/ingest.ts` redirect interceptor *(with the caveats now recorded in §9)*
  - [x] `app/page.tsx` tab-aware action labels + API-key hint
  - [x] `@anthropic-ai/sdk` removed, `@google/genai` ^2.13 added; `.github/workflows/ci.yml` created
- **Outcome:** `npm run eval` passed with `eval/baseline.json` untouched, confirming nothing leaked across the measured/AI split; `npm run eval:ai` executed for the first time.
- **Not delivered as specced:** the `GEMINI_MODEL` env override, and the model id landed a generation ahead of the plan (`3.5` vs `2.5`) — worth a deliberate confirmation rather than leaving it as undocumented drift.

### Phase 6 — Spiked lanes *(delivered, DIST-041 → DIST-043)*

All three spikes shipped under the existing optional-lane contract.

- [x] **Motion/transition token lane** (DIST-041) — `lib/extract/motion.ts`; JS-driven motion remains an honest, documented gap. *(Motion lane preservation in AI enrichment delivered in `lib/analyze.ts:160-165`)*
- [x] **`emitTailwindTheme(report)`** (DIST-042) — Tailwind v4 `@theme` + `prefers-color-scheme` dark override, download button wired; `--spacing: <baseUnitPx>px` as specced.
- [x] **Cross-origin state capture** (DIST-043) — Strategy A shipped with schema and capture shape byte-identical as designed. *(Property-name mismatch and scanner deduplication delivered in DIST-048)*

### Phase 7 — Codebase health audit remediation *(delivered, DIST-048 → DIST-061)*

- **Goal:** close three verified correctness defects, remove duplicated/dead code, and re-align documentation with shipped behavior.
- **Delivered:** PRs #110 through #123.

#### P0 — Correctness defects

- [x] **The AI lane silently deletes the entire motion lane.** (Fixed in `lib/analyze.ts:160-165` by spreading `...measured.report` into `buildReport`)
- [x] **Cross-origin hover/focus capture drops 3 of its 4 properties.** (Delivered in DIST-048 / #96, #110; property map unified and deduplicated)
- [x] **The SSRF redirect interceptor can be outrun, and doesn't prevent the request.** (Delivered in DIST-049 / #97, #111; redirect check unraceable in `lib/ingest.ts`)
- [x] **`structureUnavailableReason` is never set for the no-API-key case.** (Delivered in DIST-050 / #98, #112; set when key is missing)

#### P1 — Redundancy, waste, and dead code

- [x] **Two drifted copies of the CSSOM scanner.** (Delivered in DIST-048 / #96, #110; deduplicated in `styleDump.ts`)
- [x] **A full-page screenshot is captured on every render and thrown away.** (Delivered in DIST-051 / #99, #113; unused `fullPageShot` removed from `lib/ingest.ts`)
- [x] **Dead export:** `analyzeUrlStructure` (Delivered in DIST-052 / #100, #114; removed from `lib/analyze.ts`)
- [x] **Duplicated download plumbing** in `app/page.tsx` (Delivered in DIST-053 / #101, #115; extracted helper)
- [x] **`populateMissingComponentDefs` is a pure alias** (Delivered in DIST-054 / #102, #116; removed dead wrapper)
- [x] **Redundant, version-mismatched type dependency:** `@types/js-yaml` (Delivered in DIST-055 / #103, #117; dropped)

#### P2 — Documentation and configuration drift

- [x] **The OpenRouter path broke the "one pinned model" invariant.** (Closed in DIST-056 / #104, #118; non-strict `response_format: json_schema`, runtime warnings for thinkingLevel)
- [x] **`OPENROUTER_API_KEY` and `OPENROUTER_MODEL` are undocumented** (Closed in #94/#95 and README)
- [x] **Setup hint names only `GEMINI_API_KEY`** (Delivered in DIST-057 / #105, #119; `OPENROUTER_API_KEY` mentioned in setup hint)
- [x] **CI never builds.** (Delivered in DIST-058 / #106, #120; `npm run build` step added to `.github/workflows/ci.yml`)
- [x] **Stale `Anthropic` reference** (Delivered in DIST-059 / #107, #121; removed from `lib/extract/structure/index.ts`)
- [x] **Refresh the stale PRD sections** (Delivered 2026-07-29 sweep)

#### P3 — Gate coverage

- [x] **The eval gate is weaker than the documentation implies.** (Delivered in DIST-060 / #108, #122 fail on missing captures, and DIST-062 / #124, #140 adversarial fixture)
- [x] **Latent viewport coupling:** (Delivered in DIST-061 / #109, #123 and DIST-065 / #127, #143; viewport carried in `Capture`)

### Phase 8 — Heuristic-invariant audit *(delivered, DIST-062 → DIST-077)*

- **Goal:** audit and harden heuristic extraction invariants, remove code duplication, and isolate client bundle dependencies.
- **Delivered:** PRs #140 through #155.
- [x] **DIST-062 (#124):** Add adversarial eval fixture (`adversarial-shell` committed to corpus)
- [x] **DIST-063 (#125):** Type structure regions by landmark identity, not by tree depth
- [x] **DIST-064 (#126):** Never assign an evidence-gated semantic role by displacement
- [x] **DIST-065 (#127):** Populate `Capture.viewport` in `eval/capture.ts` and refresh fixtures
- [x] **DIST-066 (#128):** Unify the band-segment regex and `structuralPart` behind one seam
- [x] **DIST-067 (#129):** Unify the two `nearestScaleValue` copies
- [x] **DIST-068 (#130):** Unify the two `mode<T>` copies without moving measured output
- [x] **DIST-069 (#131):** Unify `parsePositiveNumber` / `parsePositiveInteger`
- [x] **DIST-070 (#132):** Remove unreachable landmark-preservation branch in the pruner
- [x] **DIST-071 (#133):** Move `emitTailwindTheme` out of `lib/emit.ts` so `js-yaml` leaves client bundle
- [x] **DIST-072 (#134):** Join `computeContentMaxWidth` on landmark identity, not post-AI name
- [x] **DIST-073 (#135):** Resolve ten exports that had no importer
- [x] **DIST-074 (#136):** Stop double-counting above-the-fold pixels in palette area weights
- [x] **DIST-075 (#137):** Emit a `prefers-color-scheme: dark` block from `renderCssVariables`
- [x] **DIST-076 (#138):** Skip the AI interpretation lane on `mode: "structure"` URL runs
- [x] **DIST-077 (#139):** Omit `text` swatch rather than duplicating background hex on single-cluster images

### Phase 9 — Workbench UI Polish & Overlay Mitigation *(in progress)*

- **Goal:** refine workbench UX and interaction fidelity, and mitigate view-obscuring overlays and inaccessible URLs.
- [x] **Interactive cursor feedback (#157):** Set cursor pointer on interactive buttons across the workbench
- [x] **Tab bar layout shift (#159):** Keep result tab bar button widths and positions stable across tab switches
- [x] **Action button consolidation (#160):** Streamlined header actions by removing "Copy .md" button in favor of download
- [x] **Distill Design System theme integration (#164):** Adopted semantic theme tokens (`app/distill-theme.css`)
- [x] **Overlay mitigation spike (#166 / #156):** Completed spike (`.agents/reports/overlay-mitigation-spike.md`) recommending 4-layer clearing pipeline (Ghostery adblocker, autoconsent, generic modal dismissal, error fallback)
- [ ] **Overlay, cookie wall & bot mitigation (#156):** Implement overlay dismissal and bot/access error reporting in ingestion and UI

## 13. Future Considerations

- **Multi-page aggregation:** crawl N pages of one site, merge palettes/recipes across pages with per-page provenance.
- **Authenticated capture:** cookie/storage-state injection for logged-in pages.
- **Diffing:** compare two runs of the same site over time ("design drift" reports).
- **CLI / library packaging:** expose `analyzeUrl`/`analyzeImages` as an installable package decoupled from Next.js.
- **More viewports & container-query awareness** in the responsive diff.
- **APCA-first contrast reporting** as WCAG 3 matures.
- **Paid AI tier / provider re-evaluation:** if rate limits or the provider's data-use terms become binding constraints, change the OpenRouter model or account — deliberately *not* an argument for a multi-provider abstraction layer.

## 14. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Heuristic changes silently regress extraction quality on real sites | Wrong reports, eroded trust | Offline eval harness with per-site floors + baseline gate, both tracks scored; deliberate-only baseline refresh (`UPDATE_BASELINE=1`) |
| AI lane drift/hallucination contaminates measured data | Violates core principle | Hard lane separation (`extractFromCapture` is network-free); AI output merged onto — never into — measured fields; provenance stamps; `eval:ai` stability check |
| **Graceful AI fallback hides real breakage** (proven: `temperature: 0.1` disabled two lanes indefinitely, indistinguishable from "no key set") | Features silently never ship | Phase 5 deletes the offending parameter; live end-to-end verification is an explicit Phase-5 exit criterion; console warnings (`AI Structure Labeller failed`, `Vision structure inference failed`) must be checked, not assumed absent |
| **Provider rate limits (429)** — a `both`-mode run fires two AI calls with up to four images | Bursty testing 429s; `retryOnce` treats a 429 as failure and falls back, so a rate-limited run *looks identical to a quality regression* | Response cache absorbs repeats; check the server console before concluding the model is bad; raise the OpenRouter limit if it binds |
| **AI-lane screenshots pass through OpenRouter and the provider that it routes to** | Third-party screenshots leave the operator's control | Documented in §9; operators decide before they point Distill at sensitive properties |
| Vision quality regression moving off a frontier model | Image-derived skeletons degrade | Explicit spot-check in Phase-5 validation; Zod remains the hard gate on shape |
| Open URL fetching enables SSRF on public deployments | Server compromise | Resolve-then-check guard on the submitted URL + `SSRF_ALLOWLIST_HOSTS` (§9); redirect interception shipped in DIST-044 but is **best-effort only** — it races the navigation and fires after Chromium has already made the request (§12 Phase 7 / P0-4). Network-level egress filtering (README "Layer 2") is the load-bearing control, not the in-process guard |
| **A shipped security control is documented as stronger than it is** (proven: the DIST-044 report claims redirects are "aborted immediately … before loading response bodies"; neither holds) | Operators under-provision the real boundary because the in-process guard reads as sufficient | Validate security controls against the adversarial case, not the convenient one — DIST-044's synthetic test used a literal IP, which resolves instantly and hides the race; state the residual gap in the same document that claims the fix |
| Site anti-bot / consent walls break capture | Empty or skewed reports | Consent-banner dismissal in ingest; best-effort second passes fail to absence; cache + forceRefresh for retries |
| Capture-shape evolution invalidates frozen eval fixtures | Green-but-meaningless evals | Policy: fixtures refreshed only when capture shape itself changes, in the same PR, with baseline; new lanes must treat absent fields as "nothing observed" |
| Playwright/Chromium footprint complicates deployment | Failed installs | postinstall auto-install; multi-stage Dockerfile with browser deps baked in, base image pinned to the `package.json` version |
| Unauthenticated endpoint invites resource exhaustion | Cost/DoS on public deploys | Bounded cache, bounded rate-limiter store, request-body cap, image count/size caps; auth explicitly the deployer's responsibility |
| **`enrichWithAI` re-assembles the report field-by-field, so any lane added to `extractFromCapture` but not mirrored there is silently dropped** (proven: the motion lane, §12 P0-1) | Measured data lost whenever the AI lane runs — and invisible to the eval harness, which never calls `enrichWithAI` | Treat the AI merge as *additive onto* the measured report rather than a rebuild from parts; failing that, any new optional lane must be added to both `buildReport` call sites in the same change |
| **Duplicated logic drifts into divergent behavior** (proven: the two CSSOM scanner copies in `styleDump.ts`, whose `STATE_PROPS` divergence disabled 3 of 4 cross-origin state properties) | A lane reports as working while silently measuring less than it claims | §6 "one seam per concern" applies inside `page.evaluate` callbacks too; the self-contained-callback constraint argues for one parameterized copy, not two maintained ones |
| **Provider-specific capability gaps in a "single seam" that no longer behaves as one** (`callOpenRouterModel` ignores `thinkingLevel` and weakens JSON-schema enforcement) | Identical code produces different output quality depending on which key is set; token-budget assumptions silently break | Shipped 2026-07-29 (DIST-056): `jsonSchema` honored via non-strict `response_format: json_schema`; `thinkingLevel` is the one accepted gap, now asserted via a one-time runtime warning and documented at every call site rather than silently dropped **Closed 2026-10-14 (#199):** the native Gemini path and `thinkingLevel` were removed, so there is one request builder. |

## 15. Appendix

- **Related documents:**
  - `README.md` — user-facing capabilities & setup
  - `AGENTS.md` — authoritative agent/contributor architecture guide (`CLAUDE.md` points to it)
  - `PLAN.md` — rounds 1–3 fix-plan history (the de-facto changelog of Phases 1–3)
  - `.agents/plans/completed/from-claude-to-gemini-plan.md` — the Phase-5 migration plan (delivered; retained as the record of intent, including the two deltas noted in §12 Phase 5)
  - `.agents/plans/completed/`, `.agents/reports/`, `.agents/reviews/`, `.agents/stories/` — per-story plans, spike reports, code reviews, and backlog
- **Key spike reports:** `motion-spike.md` (GO → shipped DIST-041), `tailwind-theme-spike-report.md` (GO → shipped DIST-042), `cross-origin-states-spike.md` (GO, Strategy A → shipped DIST-043), `overlay-mitigation-spike.md` (GO, 4-layer pipeline → pending implementation #156)
- **Key dependencies:** [Playwright](https://playwright.dev), [sharp](https://sharp.pixelplumbing.com), [culori](https://culorijs.org), [Zod](https://zod.dev), and [OpenRouter](https://openrouter.ai) for the AI lane (key: https://openrouter.ai/keys).
- **Repository structure:** see §6; eval harness under `eval/` (`run.ts`, `score.ts`, `scoreStructure.ts`, `stability.ts`, `corpus/{clean-light,dark-mode}/`, `baseline.json`).
