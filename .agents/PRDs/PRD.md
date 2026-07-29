# PRD — Distill: Design System & Structure Scraper

> **Note:** This PRD was authored retroactively (2026-07-23) against an already-built codebase and refreshed **2026-07-29** to (a) match the shipped state of `main`, (b) adopt the AI-lane provider migration described in `from-claude-to-gemini-plan.md`, and (c) incorporate technical and security findings from the 2026-07-29 codebase health audit. "In Scope" items marked `[x]` are implemented and verified; unchecked items are genuinely open. Implementation phases mirror the actual delivery history recorded in `PLAN.md`, `.agents/plans/completed/`, and git.

---

## 1. Executive Summary

Distill converts any live website URL — or one or more uploaded screenshots — into a structured Markdown **design-system report** and **page-architecture report**. Each report pairs machine-parseable YAML frontmatter with a human-readable body derived from the *same* underlying object, so the two representations can never drift. The goal: **an LLM or developer should be able to build a new website from these two files alone.**

The product's differentiating principle is **"measured, never faked."** Every extracted value is stamped with provenance (`measured` / `inferred` / `ai`); a signal that cannot be observed produces an *omitted* field, never a synthesized one. Deterministic extraction (headless Chromium render → single DOM style-dump walk → perceptual color science → staged structure pipeline) runs fully offline-capable; an optional AI vision lane enriches — but never replaces — measured output.

The MVP goal: given a URL, produce token and structure reports faithful enough to rebuild the page's visual system (palette with roles and contrast pairs, typography scale with fallback stacks, spacing/radius/elevation tokens, component recipes with variants, interactive states, responsive deltas across mobile + tablet, light+dark schemes, and a semantic component skeleton led by an ordered page-section digest) — with a lighter palette-and-mood path for image input.

**Current standing (2026-07-29, post-audit):** the measured lanes (Tracks A and B) are complete, regression-gated, and shipping. **Phases 5 and 6 have both landed** — the AI lane was migrated off Anthropic to `@google/genai`, the latent `temperature: 0.1` that would have 400'd two of three call sites is deleted, and all three lanes were verified live end-to-end for the first time (DIST-039). The three spiked Phase-6 lanes — motion tokens, `emitTailwindTheme`, cross-origin state capture — are all built. CI, SSRF redirect interception, and dynamic UI action labels shipped alongside.

A full-codebase audit on **2026-07-29** (§12 Phase 7) then found three correctness defects that every existing gate passes over: the AI enrichment pass silently drops the measured `motion` lane, cross-origin state capture discards 3 of its 4 properties through a camelCase/kebab-case mismatch, and the no-API-key path never sets the `structureUnavailableReason` its own docs promise. A subsequent OpenRouter provider addition (#94/#95) also reintroduced multi-provider divergence into what §6 calls a single seam. Phase 7 tracks the remediation; **§4, §7–§12 below were refreshed on 2026-07-29 to describe shipped state rather than planned state.**

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
- [x] ~~**Regression:** that seam is no longer single-provider. The OpenRouter addition (#94/#95) introduced a second model-selection path (`OPENROUTER_MODEL`) and a second request builder that silently ignores `thinkingLevel` and weakens JSON-schema enforcement — see §12 Phase 7 / P2-1~~ — **closed 2026-07-29 (DIST-056).** `jsonSchema` now sends a real (non-strict) `response_format: json_schema` on OpenRouter; `thinkingLevel` remains a documented, one-time-logged Gemini-only gap; both providers default to the same model generation (`gemini-3.5-flash`), each independently overridable (`GEMINI_MODEL`/`OPENROUTER_MODEL`).

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
- [x] ~~Multi-provider AI abstraction — Phase 5 is a **replacement**, not an adapter layer; one provider, one code path~~ — **superseded 2026-07-29.** #94/#95 added an OpenRouter path, so the codebase now has two providers behind one seam. This was a scope change, not an implementation of the above intent. **Settled 2026-07-29 (DIST-056):** two providers behind one seam is accepted scope, not a regression — `lib/aiLane.ts` is still the only file importing a provider SDK, and the `ModelCall` contract's one intentionally-accepted gap (`thinkingLevel` on OpenRouter) is documented at the call sites and logged once at runtime.

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
| AI lane (optional) | `@google/genai` ^2.13, `AI_MODEL = "gemini-3.5-flash"` (overridable via `GEMINI_MODEL`), gated on `GEMINI_API_KEY`. Alternatively OpenRouter via `OPENROUTER_API_KEY` + `OPENROUTER_MODEL` (default `google/gemini-3.5-flash`), which takes precedence when set | Vision interpretation + semantic naming; fails open. Gemini's free tier removed the prepaid-credit barrier that kept this lane dark through Phases 1–4, and native JSON mode removed brace-match JSON extraction. Both paths default to the same model generation (`gemini-3.5-flash` / `google/gemini-3.5-flash`), each overridable (`GEMINI_MODEL` / `OPENROUTER_MODEL`); OpenRouter sends a real non-strict `response_format: json_schema`, but `thinkingLevel` capping remains Gemini-only (logged once when ignored) — see §12 Phase 7 / P2-1 (closed) |
| Serialization | js-yaml ^5.2 (ships its own types) | Frontmatter emit |
| Tooling | TypeScript 5.7, tsx (eval scripts), ESLint 9 flat config (`eslint .`) | No jest/vitest — the eval harness is the correctness gate |
| Runtime | Node 18+ (developed on 20/22) | |

## 9. Security & Configuration

- **Authentication:** none — MVP is a local/self-hosted tool; the API route is unauthenticated by design. Anyone deploying publicly must add their own auth in front (see README "Deploying Publicly — Hardening Guide").
- **Configuration** (all optional; sane defaults, absence never blocks measured extraction):

  | Env var | Purpose |
  |---|---|
  | `GEMINI_API_KEY` | Enables the AI lane (Gemini path). Read server-side only |
  | `GEMINI_MODEL` | Model override for the Gemini path (default `gemini-3.5-flash`) — restores the Phase-5-specced override |
  | `OPENROUTER_API_KEY` | Enables the AI lane via OpenRouter instead; **takes precedence over `GEMINI_API_KEY` when both are set** |
  | `OPENROUTER_MODEL` | Model id for the OpenRouter path (default `google/gemini-3.5-flash`) |
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
- **Data-handling note:** Google's **free tier uses submitted prompts for product improvement**; the paid tier does not. Distill's AI-lane inputs are screenshots of third-party sites. Operators pointing Distill at sensitive or internal properties should use a paid tier — this is a deployment decision, not a code change. **Routing through OpenRouter adds a second data processor** with its own retention terms, and the request sends an identifying `HTTP-Referer`/`X-Title` pair; operators should evaluate that separately rather than assuming the Gemini analysis carries over.
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
- [ ] **A measured lane cannot be lost by enabling the AI lane** — *currently failing:* `motion` is dropped whenever `enrichWithAI` runs (§12 Phase 7 / P0-1). No existing criterion covered this, which is why it shipped
- [ ] **A shipped lane measures what it claims** — *currently failing:* cross-origin state capture silently recovers only `color` of its four properties (§12 Phase 7 / P0-2)

**Quality indicators:**

- Eval corpus scores at/above committed baseline (currently 1.0 on both fixtures — but see §12 Phase 7 / P3-1 on how little that gate actually covers); AI-lane stability across repeated runs (`npm run eval:ai` — Jaccard floors 0.5 adjectives / 0.3 archetype, first executed in DIST-039)
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

- [x] **Motion/transition token lane** (DIST-041) — `lib/extract/motion.ts`; JS-driven motion remains an honest, documented gap. *Regression: dropped by the AI lane, §12 Phase 7 / P0-1.*
- [x] **`emitTailwindTheme(report)`** (DIST-042) — Tailwind v4 `@theme` + `prefers-color-scheme` dark override, download button wired; `--spacing: <baseUnitPx>px` as specced.
- [x] **Cross-origin state capture** (DIST-043) — Strategy A shipped with schema and capture shape byte-identical as designed. *Regression: recovers only `color`, §12 Phase 7 / P0-2.*

### Phase 7 — Codebase health audit remediation *(open, 2026-07-29 sweep)*

> **Document status note:** this phase records a full-codebase audit performed **after** Phases 5 and 6 landed. `npm run typecheck`, `npm run lint`, and `npm run eval` are all green on `main` at `40341cd` — none of the findings below are caught by the existing gates, which is itself part of the finding. **Sections §1, §4, §7–§12, §14, and §15 were refreshed on 2026-07-29** to describe shipped rather than planned state (item P2-6, now closed); the remediation items below are open.

- **Goal:** close three verified correctness defects, remove duplicated/dead code that caused one of them, and re-align documentation with shipped behavior.
- **Source:** full-codebase sweep, 2026-07-29. Every item below was verified against the code (and, where noted, empirically against Chromium), not inferred.

#### P0 — Correctness defects

- [ ] **The AI lane silently deletes the entire motion lane.** `lib/analyze.ts:156` — `extractFromCapture` measures `motion` and passes it to `buildReport` (line 98), but `enrichWithAI` rebuilds the report from scratch and its `buildReport` call omits `motion`. Because `buildReport` drops any field it isn't handed, `motion` disappears from both the frontmatter and the `## Motion` body section on **every URL analysis where an API key is set**. Invisible to `npm run eval`, which only exercises `extractFromCapture` — a direct instance of the §14 "graceful AI fallback hides real breakage" risk, this time as silent data loss rather than silent no-op. *Fix: pass `motion: measured.report.motion` (and audit the call for any future lane added to `extractFromCapture` but not mirrored here).*
- [ ] **Cross-origin hover/focus capture drops 3 of its 4 properties.** `lib/extract/styleDump.ts:570` — the cross-origin `STATE_PROPS` map uses camelCase computed-property names (`backgroundColor`, `borderColor`, `boxShadow`) but reads them via `cs.getPropertyValue()`, which only accepts kebab-case. Verified in Chromium: `getPropertyValue("backgroundColor")` → `""`, `getPropertyValue("background-color")` → `"rgb(1, 2, 3)"`. `from` is therefore always empty, the `if (!from || from === to) continue` guard fires, and background/border/shadow deltas from cross-origin stylesheets are **always** discarded. Only `color` survives, because its key is identical in both spellings. The same-origin copy 100 lines above is correct (`"border-color": "border-top-color"`). This silently halves the value of the Phase-6 cross-origin state lane. *Fix as part of P1-1, not in place.*
- [ ] **The SSRF redirect interceptor can be outrun, and doesn't prevent the request.** `lib/ingest.ts:364` — the handler is `async` and Playwright does not await `page.on("response")` listeners, so its `assertSafeUrl` DNS lookup races `page.goto()` resolving; the post-`goto` `if (redirectSsrfError) throw` check can run before the lookup finishes. The DIST-044 synthetic test passes because a literal IP (`169.254.169.254`) resolves instantly — a redirect to a *hostname* that resolves privately is the untested case. Independently, by the time the 30x event fires Chromium has already issued the request to the target, so the control gates the *result*, not the request. The DIST-044 report's "navigation is aborted immediately … before loading response bodies" overstates both. *Fix: await the redirect validation on the navigation path (or pre-resolve via `request.route`) and correct the claim; treat network egress filtering as the real boundary either way.*
- [ ] **`structureUnavailableReason` is never set for the no-API-key case.** `lib/analyze.ts:237` — `wantsStructure` ANDs in `aiLaneAvailable()`, so a keyless image request returns `undefined` for both the structure report *and* the reason. Its own doc comment (`lib/analyze.ts:193`) promises "no API key, or the vision model failed", and the frontend type (`app/page.tsx:30`) says "image mode without an API key". Keyless users get a silently absent structure pane instead of the explanation both docs advertise — and §11's Phase-5 exit criterion is written against this exact behavior.

#### P1 — Redundancy, waste, and dead code

- [ ] **Two drifted copies of the CSSOM scanner.** `lib/extract/styleDump.ts:454-538` vs `607-688` — `applyRule`, `scanRules`, `resolveVarRefs`, and `STATE_PROPS` are duplicated between the same-origin and cross-origin passes and have *already* diverged: different `STATE_PROPS` values (the P0-2 bug) and different `resolveVarRefs` implementations (3 passes / one regex vs 5 passes / another). This violates the §6 "one seam per concern" principle that `roleMatch.ts` and `styleMatch.ts` exist to enforce. The duplication is the root cause of P0-2; deduplicate rather than patching the constant, or a third divergence is a matter of time.
- [ ] **A full-page screenshot is captured on every render and thrown away.** `lib/ingest.ts:309` — `fullPageShot` flows through `capturePage` → `RenderResult` but `captureFromRender` never copies it into `Capture`, and nothing outside `ingest.ts` reads it. On tall pages `screenshot({ fullPage: true })` is among the most expensive calls in the pipeline, and the result is held as base64 for the rest of the request. The in-code comment justifies it as a "dead-code fallback so a future reader doesn't simplify by swapping it in" — that intent is served by the comment alone, at zero runtime cost.
- [ ] **Dead export:** `analyzeUrlStructure` (`lib/analyze.ts:358`) is exported but called from nowhere in `lib`, `app`, or `eval`.
- [ ] **Duplicated download plumbing** in `app/page.tsx:161-199` — `downloadActiveMarkdown` and `downloadTailwindTheme` share a verbatim hostname-derivation block plus identical blob/anchor/revoke boilerplate.
- [ ] **`populateMissingComponentDefs` is a pure alias** for `walkComponentMap` (`lib/extract/structure/structureAI.ts:331`), and the name misleads: it also mutates existing entries' `composition` and `instances`.
- [x] ~~**Redundant, version-mismatched type dependency:** the project runs `js-yaml@5.2.1`, which ships its own types; `--traceResolution` confirms TS resolves the bundled v5 `.d.ts` for the import, while `@types/js-yaml@4.0.9` is still pulled in as a global type-reference directive describing a different major version.~~ — **done 2026-07-29.** `@types/js-yaml` dropped from `devDependencies`; `--traceResolution` now resolves only the bundled v5 `.d.ts`.

#### P2 — Documentation and configuration drift

- [x] ~~**The OpenRouter path broke the "one pinned model" invariant.** §6 and `CLAUDE.md` both state `lib/aiLane.ts` holds *one* pinned `AI_MODEL`. Since the OpenRouter PR (#94/#95) there are two selection paths: `AI_MODEL = "gemini-3.5-flash"` (Gemini only) and `OPENROUTER_MODEL`, defaulting to `"google/gemini-2.5-flash"` — a different model generation. Worse, `callOpenRouterModel` (`lib/aiLane.ts:68`) **ignores `thinkingLevel` entirely** and downgrades structured output from a real JSON schema to bare `response_format: { type: "json_object" }`. Every lane that pins a thinking level for budget reasons behaves differently on OpenRouter — `interpret.ts` pins `MINIMAL` specifically so thinking tokens don't truncate its 2048-token JSON. Either honor both parameters on the OpenRouter path or document it as a deliberately degraded fallback; the §4 "Out of Scope — multi-provider AI abstraction: one provider, one code path" line now contradicts shipped code.~~ — **closed 2026-07-29 (DIST-056).** OpenRouter now sends a real non-strict `response_format: json_schema` (not `strict: true` — `STRUCTURE_SCHEMA`'s dictionary-shaped `additionalProperties` fields aren't representable under strict mode); `thinkingLevel` stays Gemini-only but is now asserted (one-time runtime warning) and documented at every call site; both providers default to `gemini-3.5-flash`-generation models, independently overridable via `GEMINI_MODEL`/`OPENROUTER_MODEL`.
- [x] ~~**`OPENROUTER_API_KEY` and `OPENROUTER_MODEL` are undocumented** — absent from `README.md` and from the §9 configuration table.~~ — already shipped; audit line was stale (`README.md:67-71` documents both).
- [ ] **Setup hint names only `GEMINI_API_KEY`** (`app/page.tsx:438`), shown whenever the AI lane didn't apply, though `OPENROUTER_API_KEY` now enables it equally.
- [ ] **CI never builds.** `.github/workflows/ci.yml` — the job is named "Build, Lint & Eval" and runs typecheck, lint, and eval; there is no `npm run build`. A Next.js-specific failure (client/server boundary, route config) ships green.
- [ ] **Stale `Anthropic` reference** in `lib/extract/structure/index.ts:23` ("without ever constructing the `Anthropic` client") — the SDK was removed in `dist-038`.
- [x] ~~**Refresh the stale PRD sections**~~ — **done 2026-07-29.** §1 standing paragraph, §4 scope lists, §7 feature table (states row corrected; motion + Tailwind rows added), §8 stack row, §9 config table + redirect posture + OpenRouter data-handling note, §10 response shape and error codes, §11 criteria, §12 Phases 5–6, §14 risk rows, §15 appendix. Two spec-vs-shipped deltas surfaced while doing it and are now recorded rather than silently normalized: the `GEMINI_MODEL` override was specced but never built, and `AI_MODEL` shipped as `gemini-3.5-flash` rather than the planned `gemini-2.5-flash`.

#### P3 — Gate coverage

- [ ] **The eval gate is weaker than the documentation implies.** §11 and `CLAUDE.md` present `npm run eval` as *the* correctness gate for extraction logic, but it currently scores **two synthetic fixtures, both pinned at exactly 1.0**, and silently skips `stripe`, `linear`, and `vercel` (their captures are git-ignored by design, per `eval/corpus.ts`). With a `SITE_FLOOR` of 0.7 and a baseline of `{1, 1}`, there is little room to detect a real-world regression, and a missing corpus entry is a log line rather than a failure. This is a deliberate MVP posture, not a defect — but the gap between "the correctness gate" and "two perfect-scoring fixtures" should be named. *Options: commit sanitized captures for at least one real site, or fail rather than skip when a `CORPUS` entry has no capture.*
- [ ] **Latent viewport coupling:** `Capture` carries no viewport, so `extractStructureFromCapture` always lets the structure lane fall back to its 1440×900 default (`lib/extract/structure/index.ts:44`). Correct today only because `renderUrl` is never called with a custom `RenderOptions.viewport`; if it ever is, `regionMetrics` silently measures against the wrong viewport height.

- **Validation:** `lint` + `typecheck` clean; **`npm run eval` passes with `eval/baseline.json` untouched** — every P0/P1 item is either outside the measured lane (P0-1, P0-3) or a pure dedup/removal, so *any* score movement means the change leaked into measured extraction and must be investigated, not baselined away. P0-2 additionally needs a live cross-origin verification against a synthetic two-server fixture (per `CLAUDE.md` "Manually verifying extraction changes"), since no committed capture exercises cross-origin stylesheets. P0-1 needs a keyed `both`-mode URL run confirming `## Motion` survives AI enrichment.

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
| Open URL fetching enables SSRF on public deployments | Server compromise | Resolve-then-check guard on the submitted URL + `SSRF_ALLOWLIST_HOSTS` (§9); redirect interception shipped in DIST-044 but is **best-effort only** — it races the navigation and fires after Chromium has already made the request (§12 Phase 7 / P0-4). Network-level egress filtering (README "Layer 2") is the load-bearing control, not the in-process guard |
| **A shipped security control is documented as stronger than it is** (proven: the DIST-044 report claims redirects are "aborted immediately … before loading response bodies"; neither holds) | Operators under-provision the real boundary because the in-process guard reads as sufficient | Validate security controls against the adversarial case, not the convenient one — DIST-044's synthetic test used a literal IP, which resolves instantly and hides the race; state the residual gap in the same document that claims the fix |
| Site anti-bot / consent walls break capture | Empty or skewed reports | Consent-banner dismissal in ingest; best-effort second passes fail to absence; cache + forceRefresh for retries |
| Capture-shape evolution invalidates frozen eval fixtures | Green-but-meaningless evals | Policy: fixtures refreshed only when capture shape itself changes, in the same PR, with baseline; new lanes must treat absent fields as "nothing observed" |
| Playwright/Chromium footprint complicates deployment | Failed installs | postinstall auto-install; multi-stage Dockerfile with browser deps baked in, base image pinned to the `package.json` version |
| Unauthenticated endpoint invites resource exhaustion | Cost/DoS on public deploys | Bounded cache, bounded rate-limiter store, request-body cap, image count/size caps; auth explicitly the deployer's responsibility |
| **`enrichWithAI` re-assembles the report field-by-field, so any lane added to `extractFromCapture` but not mirrored there is silently dropped** (proven: the motion lane, §12 P0-1) | Measured data lost whenever the AI lane runs — and invisible to the eval harness, which never calls `enrichWithAI` | Treat the AI merge as *additive onto* the measured report rather than a rebuild from parts; failing that, any new optional lane must be added to both `buildReport` call sites in the same change |
| **Duplicated logic drifts into divergent behavior** (proven: the two CSSOM scanner copies in `styleDump.ts`, whose `STATE_PROPS` divergence disabled 3 of 4 cross-origin state properties) | A lane reports as working while silently measuring less than it claims | §6 "one seam per concern" applies inside `page.evaluate` callbacks too; the self-contained-callback constraint argues for one parameterized copy, not two maintained ones |
| **Provider-specific capability gaps in a "single seam" that no longer behaves as one** (`callOpenRouterModel` ignores `thinkingLevel` and weakens JSON-schema enforcement) | Identical code produces different output quality depending on which key is set; token-budget assumptions silently break | Shipped 2026-07-29 (DIST-056): `jsonSchema` honored via non-strict `response_format: json_schema`; `thinkingLevel` is the one accepted gap, now asserted via a one-time runtime warning and documented at every call site rather than silently dropped |

## 15. Appendix

- **Related documents:**
  - `README.md` — user-facing capabilities & setup
  - `CLAUDE.md` — authoritative agent/contributor architecture guide (`AGENTS.md` points to it)
  - `PLAN.md` — rounds 1–3 fix-plan history (the de-facto changelog of Phases 1–3)
  - `.agents/plans/completed/from-claude-to-gemini-plan.md` — the Phase-5 migration plan (delivered; retained as the record of intent, including the two deltas noted in §12 Phase 5)
  - `.agents/plans/completed/`, `.agents/reports/`, `.agents/reviews/`, `.agents/stories/` — per-story plans, spike reports, code reviews, and backlog
- **Key spike reports:** `motion-spike.md` (GO → shipped DIST-041), `tailwind-theme-spike-report.md` (GO → shipped DIST-042), `cross-origin-states-spike.md` (GO, Strategy A → shipped DIST-043)
- **Key dependencies:** [Playwright](https://playwright.dev), [sharp](https://sharp.pixelplumbing.com), [culori](https://culorijs.org), [Zod](https://zod.dev), and [Google Gen AI](https://ai.google.dev) for the AI lane (free key: https://aistudio.google.com/apikey), optionally routed via [OpenRouter](https://openrouter.ai).
- **Repository structure:** see §6; eval harness under `eval/` (`run.ts`, `score.ts`, `scoreStructure.ts`, `stability.ts`, `corpus/{clean-light,dark-mode}/`, `baseline.json`).
