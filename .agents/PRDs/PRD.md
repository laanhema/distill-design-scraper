# PRD — Distill: Design System & Structure Scraper

> **Note:** This PRD was authored retroactively (2026-07-23) against an already-built codebase. "In Scope" items marked `[x]` are implemented and verified; unchecked items are genuinely open. Implementation phases mirror the actual delivery history recorded in `PLAN.md` and git.

---

## 1. Executive Summary

Distill converts any live website URL — or one or more uploaded screenshots — into a structured Markdown **design-system report** and **page-architecture report**. Each report pairs machine-parseable YAML frontmatter with a human-readable body derived from the *same* underlying object, so the two representations can never drift. The goal: **an LLM or developer should be able to build a new website from these two files alone.**

The product's differentiating principle is **"measured, never faked."** Every extracted value is stamped with provenance (`measured` / `inferred` / `ai`); a signal that cannot be observed produces an *omitted* field, never a synthesized one. Deterministic extraction (headless Chromium render → single DOM style-dump walk → perceptual color science → staged structure pipeline) runs fully offline-capable; an optional AI vision lane enriches — but never replaces — measured output.

The MVP goal: given a URL, produce token and structure reports faithful enough to rebuild the page's visual system (palette with roles and contrast pairs, typography scale with fallback stacks, spacing/radius/elevation tokens, component recipes, interactive states, responsive deltas, light+dark schemes, and a semantic component skeleton) — with a lighter palette-and-mood path for image input.

## 2. Mission

**Mission statement:** Make any website's design language and page architecture legible, portable, and honestly sourced — one URL or screenshot in, two rebuild-sufficient Markdown files out.

**Core principles:**

1. **Measured, never faked** — omitted beats guessed; every field carries provenance.
2. **One contract, two views** — YAML frontmatter is the machine contract; the body is derived from the same object, so they cannot disagree.
3. **Deterministic core, optional AI shell** — the measured lane runs offline with no API key; AI enrichment is additive and fails open to measured output.
4. **Perceptual, not naive** — all color math is Lab/OKLCH ΔE and WCAG/APCA contrast, never raw RGB distance.
5. **Regression-gated evolution** — extraction changes must pass the offline eval harness against committed captures; baselines are refreshed deliberately, never as a side effect.

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

- [x] **URL analysis** via headless Chromium (Playwright): screenshot + panorama (full-page) capture, computed-style dump, raw DOM harvest — all from one rendered session
- [x] **Design-tokens lane (Track A):** palette with staged role assignment (surface/primary/text/border/muted + semantic success/warning/danger), typography scale with full fallback stacks + mobile sizes, spacing base-unit/scale (px-explicit), radius + named elevation tokens
- [x] **Component recipes:** modal-value aggregation per element class (Button, TextLink, Input, Card, NavItem, Badge) with colors resolved to palette roles
- [x] **Interactive states:** CSSOM-harvested `:hover` / `:focus-visible` deltas attributed to palette roles
- [x] **Dark scheme capture:** `prefers-color-scheme: dark` second pass → `paletteDark` only when backgrounds measurably shift
- [x] **Structure lane (Track B):** harvest → prune → repetition detection → ontology naming → optional AI semantic naming → responsive diff (390×844) → region metrics → token cross-link (`both` mode) → ASCII skeleton + component map emit
- [x] **Image input:** multi-image (≤6) palette merge via ΔE dedup + AI palette-mood report; AI-inferred structure clearly stamped `fidelity: inferred`
- [x] **Report format:** YAML frontmatter + derived body, ending in a derived `## CSS variables` `:root` block
- [x] **Honesty framing:** provenance per lane, `naming: ai | heuristic` flag, intent-oriented region annotations (`padY` over raw heights)

### In Scope — Technical

- [x] Offline-replayable measured lane (`extractFromCapture` never touches network/API keys)
- [x] Eval regression harness: committed captures + hand-authored expectations, per-site floor + baseline gate (`npm run eval`), AI-stability check (`npm run eval:ai`)
- [x] Result caching keyed on URL/mode/all image payloads, with force-refresh
- [x] Zod schemas as single source of truth (`lib/schema.ts`, `lib/extract/structureSchema.ts`)

### In Scope — Integration & Deployment

- [x] `POST /api/analyze` REST endpoint (`{ url | images[], mode, forceRefresh }`)
- [x] Interactive Next.js workbench: mode toggles, drag-and-drop multi-image upload, swatch/contrast previews, tabbed Markdown output with copy/download
- [x] Multi-stage Dockerfile with Playwright deps
- [x] Optional `ANTHROPIC_API_KEY` via `.env.local` for the AI lane

### Out of Scope (deferred)

- [ ] Authentication, multi-tenancy, or persistent server-side storage of reports
- [ ] Crawling beyond a single page (multi-page/site-wide aggregation)
- [ ] Authenticated/paywalled page capture (login flows)
- [ ] Animation/motion token extraction (transitions, easings, keyframes)
- [ ] Direct code generation (React/Tailwind components) from reports
- [ ] Additional responsive viewports beyond 390×844 (e.g. 768px tablet)
- [ ] Browser-extension or CLI-first distribution
- [ ] Icon/asset extraction and export

## 5. User Stories

1. **As an LLM coding agent**, I want a self-contained spec with explicit units and role names, so that I can rebuild a website without ambiguity. *(e.g. `Scale (px): [4, 8, 16, 24, 32, 48, 64]`, `unit: "px"` in frontmatter)*
2. **As a frontend developer**, I want a site's palette extracted with perceptual role assignment and contrast grades, so that I can adopt its color system accessibly. *(e.g. `on-primary #ffffff on primary — 5.9:1 AA`)*
3. **As a frontend developer**, I want component recipes (Button: bg role, padding, radius, type token), so that tokens come with "amounts," not just ingredients.
4. **As a design engineer**, I want hover/focus state deltas and dark-scheme palettes captured from real CSS, so that rebuilt components behave like the original — and I want them *omitted* when the site has none, not invented.
5. **As a designer**, I want to drop in up to six screenshots of a design and get one merged palette plus brand mood/identity, so that I can document references that have no URL.
6. **As an agency builder**, I want a page-structure skeleton with semantic component names and responsive deltas (`3col → 1col`), so that I can quote and plan a rebuild from one artifact.
7. **As an API consumer**, I want a single `POST /api/analyze` endpoint with caching, so that I can integrate Distill into my own pipeline.

**Technical user stories:**

8. **As a maintainer**, I want extraction logic gated by an offline eval corpus, so that heuristic changes can't silently regress real-site quality.
9. **As a maintainer**, I want the measured lane to run with zero API keys, so that evals are deterministic and the product degrades gracefully.

## 6. Core Architecture & Patterns

**High-level flow:**

```
URL ──▶ ingest (Playwright) ──▶ Capture { screenshots, styleDump, rawHarvestNode,
                                          responsiveHarvests?, darkCapture? }
                                    │
              ┌─────────────────────┴──────────────────────┐
              ▼                                            ▼
   Track A: extractFromCapture              Track B: extractStructureFromCapture
   (palette → typography → tokens           (prune → repetition → ontology →
    → recipes → states → dark)               AI naming → responsive → tokenLink)
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
  ingest.ts        the single URL→Capture seam (render, second passes)
  schema.ts        Zod contract (re-exports structureSchema)
  emit.ts          report → markdown (conditional render* per optional lane)
  color.ts         perceptual color math (Lab/OKLCH, ΔE, contrast)
  extract/         Track A extractors + structure/ (Track B staged pipeline)
eval/              offline regression harness (corpus captures + expected.yaml + baseline)
```

**Key patterns:**

- **Single-walk style dump:** one `page.evaluate` DOM walk produces the `StyleDump` every Track-A extractor consumes; the DOM is never re-walked.
- **Optional-lane contract:** every schema addition = optional field + own `provenance` + `render*` called only `if (report.<field>)`.
- **Shared matchers:** `roleMatch.ts` (ΔE color→role) and `styleMatch.ts` (bounds-overlap node matching) are the only copies — never re-inlined.
- **Staged, ordered role assignment:** semantic roles claim colors before generic scorers; `pick()` skips taken canonicals.
- **Best-effort second passes:** responsive/dark captures fail to *absence*, which all consumers already treat as "nothing observed."
- **Modal aggregation:** recipes/states take the mode across instances so outliers can't skew a definition.

## 7. Tools / Features

| Feature | What it does | Key detail |
|---|---|---|
| Palette extraction | Colors → ΔE merge → area-weight vs screenshot pixels → score → role guardrails | WCAG floor on text roles; semantic roles need usage-context evidence |
| Panorama capture | Full-page screenshot weighting | Below-the-fold colors count toward area weights |
| Typography | Family clusters w/ full fallback stacks, size/weight/line-height scale | `sizePxMobile` from 390px second harvest |
| Spacing/radius/elevation | Frequency-ranked, base-unit-snapped scales; named shadow levels | Explicit `unit: "px"` in contract |
| Recipes | Per-element-class modal styles, role-referenced colors | Falls back to raw hex, never fabricates a role |
| States | CSSOM `:hover`/`:focus-visible` deltas per palette role | Cross-origin sheets skipped silently |
| Dark palette | Dark-emulated second dump, emitted only on measured background shift | Single-scheme sites get nothing |
| Structure skeleton | Pruned semantic tree, repetition-collapsed, ASCII box-drawing emit | Heuristic names always; AI names when keyed (`naming` flag) |
| Responsive diff | 390×844 re-harvest aligned by structural position | Per-component deltas (`3col → 1col`) |
| Token-link | `both`-mode join of structure components to design tokens | Bounds overlap + ΔE/exact-scale match; never guesses |
| Image path | ≤6 images → merged palette + AI mood; AI-inferred skeleton | Stamped `fidelity: inferred`; no fake bounds |
| CSS variables block | Derived `:root {}` fence closing the design report | Zero new schema surface; traces 1:1 to frontmatter |

## 8. Technology Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) + React 19 | Workbench UI + API route in one deployable |
| Styling | Tailwind CSS 4 | |
| Browser automation | Playwright ^1.50 (Chromium, auto-installed postinstall) | Rendered-page capture, viewport/media emulation |
| Image analysis | sharp ^0.35 | Pixel sampling for area weights & image quantization |
| Color science | culori ^4 | Lab/OKLCH conversion, ΔE |
| Validation | Zod 4 | Single-source report contracts |
| AI lane (optional) | `@anthropic-ai/sdk` | Vision interpretation + semantic naming; fails open |
| Serialization | js-yaml | Frontmatter emit |
| Tooling | TypeScript 5.7, tsx (eval scripts), ESLint (`next lint`) | No jest/vitest — eval harness is the correctness gate |
| Runtime | Node 18+ (developed on 20/22) | |

## 9. Security & Configuration

- **Authentication:** none — MVP is a local/self-hosted tool; the API route is unauthenticated by design. Anyone deploying publicly must add their own auth in front (see README "Deploying Publicly — Hardening Guide").
- **Configuration:** single optional env var `ANTHROPIC_API_KEY` (`.env.local` or container env). Absence disables the AI lane cleanly; it never blocks measured extraction.
- **In-scope security posture:**
  - AI-lane key read server-side only; never sent to the client.
  - Image uploads capped (`MAX_IMAGES = 6`); AI lane further caps at 4 images sent to the model.
  - No report/user data persisted beyond the local analysis cache.
  - SSRF guard on URL ingestion: hostname DNS-resolved and validated against loopback/private/link-local ranges before navigation, fail-closed, with an explicit `SSRF_ALLOWLIST_HOSTS` opt-out for trusted internal targets.
  - Per-client rate limiting on `POST /api/analyze`: bounded token-bucket store (`RATE_LIMIT_*` env vars), capped at `RATE_LIMIT_MAX_BUCKETS` distinct client IDs to prevent unbounded memory growth.
- **Out of scope:** user accounts, secrets management beyond env vars, a shared/global rate-limit store for multi-instance deployments (each process enforces its own independent limit), and post-navigation egress control (the SSRF guard validates the initial URL only — subresource requests, redirects, and JS-initiated fetches after navigation are not re-checked; mitigated via documented network sandboxing, not code).
- **Deployment:** local dev (`npm run dev`), production Node server, or the provided multi-stage Docker image with Playwright system deps baked in.

## 10. API Specification

### `POST /api/analyze`

**Request** (JSON):

```jsonc
{
  "url": "https://stripe.com",          // OR images — mutually exclusive inputs
  "images": [{ "data": "<base64>", "name": "home.png" }],  // ≤ 6
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
  "viewportShots": ["<base64>", "…"],                     // one preview per source image / URL viewport
  "viewportShot": "<base64>",                             // legacy singular alias
  "cached": true
}
```

- **Auth:** none (see §9).
- **Caching:** key hashes url + mode + all image payloads.
- **Errors:** 4xx on invalid payload (Zod-rejected), 5xx on render/extraction failure; AI-lane failure is *not* an error — measured report returns untouched.

## 11. Success Criteria

**MVP success definition:** a `both`-mode run on a real production site yields two reports from which a competent LLM/developer can rebuild the page's visual system without viewing the site.

**Functional requirements:**

- [x] Every emitted field traces to a measurement or is provenance-stamped `inferred`/`ai`; unmeasured lanes are omitted
- [x] Measured lane runs offline with no API key; AI failure degrades to measured output
- [x] `npm run eval` passes: per-site floor + no regression below `eval/baseline.json`
- [x] Frontmatter parses (Zod-validated) and body values match frontmatter (derived from one object)
- [x] Single-scheme sites emit no dark palette; state-less sites emit no `## States`
- [x] Image input never fabricates typography/spacing/bounds

**Quality indicators:**

- Eval corpus scores at/above committed baseline; AI-lane stability across repeated runs (`npm run eval:ai`)
- Spacing scales are base-unit multiples, not noise; recipes match fixture CSS ground truth
- Structure skeleton and component map never contradict each other

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

### Phase 4 — Hardening & reach *(open, proposed)*
- **Goal:** make Distill safe to deploy publicly and broader in coverage.
- [x] Built-in SSRF guard (resolve-then-check, fail-closed) + `SSRF_ALLOWLIST_HOSTS`; per-client rate limiting; README deployment-hardening guide with egress-restriction example
- [ ] Tablet viewport (768px) in `RESPONSIVE_VIEWPORTS` (capture-shape change → corpus refresh in same PR)
- [ ] Motion/transition token exploration (spike)
- [ ] Report-to-code spike: generate a starter Tailwind theme / CSS file from frontmatter
- **Validation:** eval corpus refreshed once, deliberately; new lanes additive.

## 13. Future Considerations

- **Multi-page aggregation:** crawl N pages of one site, merge palettes/recipes across pages with per-page provenance.
- **Code generation:** emit Tailwind config / CSS custom-property theme / component stubs directly from the machine contract.
- **Authenticated capture:** cookie/storage-state injection for logged-in pages.
- **Diffing:** compare two runs of the same site over time ("design drift" reports).
- **CLI / library packaging:** expose `analyzeUrl`/`analyzeImages` as an installable package decoupled from Next.js.
- **More viewports & container-query awareness** in the responsive diff.
- **APCA-first contrast reporting** as WCAG 3 matures.

## 14. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Heuristic changes silently regress extraction quality on real sites | Wrong reports, eroded trust | Offline eval harness with per-site floors + baseline gate; deliberate-only baseline refresh (`UPDATE_BASELINE=1`) |
| AI lane drift/hallucination contaminates measured data | Violates core principle | Hard lane separation (`extractFromCapture` is network-free); AI output merged onto — never into — measured fields; provenance stamps; `eval:ai` stability check |
| Open URL fetching enables SSRF on public deployments | Server compromise | Built-in resolve-then-check guard + `SSRF_ALLOWLIST_HOSTS` (§9); README hardening guide documents network-restriction (egress-blocking) for post-navigation traffic the guard can't cover |
| Site anti-bot / consent walls break capture | Empty or skewed reports | Consent-banner dismissal in ingest; best-effort second passes fail to absence; cache + forceRefresh for retries |
| Capture-shape evolution invalidates frozen eval fixtures | Green-but-meaningless evals | Policy: fixtures refreshed only when capture shape itself changes, in the same PR, with baseline; new lanes must treat absent fields as "nothing observed" |
| Playwright/Chromium footprint complicates deployment | Failed installs | postinstall auto-install; multi-stage Dockerfile with browser deps baked in |

## 15. Appendix

- **Related documents:** `README.md` (user-facing capabilities & setup), `CLAUDE.md` (authoritative agent/contributor architecture guide), `PLAN.md` (rounds 1–3 fix-plan history — the de-facto changelog of Phases 1–3), `AGENTS.md` (pointer to CLAUDE.md), `SUMMARY.md`.
- **Key dependencies:** [Playwright](https://playwright.dev), [sharp](https://sharp.pixelplumbing.com), [culori](https://culorijs.org), [Zod](https://zod.dev), [Anthropic SDK](https://docs.anthropic.com).
- **Repository structure:** see §6; eval harness under `eval/` (`run.ts`, `corpus/{clean-light,dark-mode}/`, `baseline.json`).
