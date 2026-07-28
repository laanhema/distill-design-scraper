# Distill — Comprehensive Codebase Analysis & System Health Report

**Generated At:** 2026-07-29  
**Repository:** `distill-design-scraper`  
**Version:** 0.1.2  
**Target Architecture:** Next.js (App Router), Playwright, Sharp, Google GenAI SDK, Tailwind CSS  

---

## Executive Summary

**Distill** is a web application and API that converts a live URL or set of uploaded images into structured Markdown design-system reports (**Track A: Design-tokens lane**) and page layout structure reports (**Track B: Structure lane**).

The application strictly adheres to the core principle: **"Measured, never faked."** Any unobserved layout or token field is left omitted in outputs rather than filled with synthetic defaults, and all measurements carry explicit `provenance` tags (`measured`, `inferred`, or `ai`).

---

## 1. System Architecture & Components

```
                      ┌─────────────────────────────────────────┐
                      │          User Input (URL / Image)        │
                      └────────────────────┬────────────────────┘
                                           │
                                  POST /api/analyze
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    │                                             │
            URL Input Pipeline                             Image Input Pipeline
                    │                                             │
            lib/security/ssrfGuard                         lib/extract/imagePalette
            lib/ingest (Playwright)                        lib/extract/imageMediaType
                    │                                             │
       ┌────────────┴────────────┐                     ┌──────────┴──────────┐
       │                         │                     │                     │
   Track A                    Track B               Track A               Track B
Design Tokens                Structure            Image Palette        Vision Infer
(styleDump.ts)           (harvester, etc.)        (imagePalette.ts) (structureFromImage.ts)
       │                         │                     │                     │
       └────────────┬────────────┘                     └──────────┬──────────┘
                    │                                             │
                    └──────────────────────┬──────────────────────┘
                                           │
                                 lib/aiLane & lib/interpret
                                  (Optional AI Enrichment)
                                           │
                                     lib/emit.ts
                             (Markdown & Tailwind @theme)
```

### 1.1 Ingestion Layer (`lib/ingest.ts`, `lib/security/`)
- **Playwright Headless Chromium**: Spawns a Chromium session to render URLs, settle animations, automatically dismiss cookie consent banners, and capture multi-viewport snapshots.
- **Panorama & Responsive Harvests**: Stitches full-page scroll tiles into gapless panorama images via `sharp` and harvests DOM trees across responsive breakpoints (`390x844` mobile and `768x1024` tablet).
- **Security & Rate Limiting**:
  - `ssrfGuard.ts`: Resolves hostnames to IP addresses before navigation and rejects loopback (127.0.0.1), RFC1918 private subnets, link-local, and broadcast IPs. Supports opt-out via `SSRF_ALLOWLIST_HOSTS`.
  - `rateLimiter.ts`: In-memory token bucket rate limiter with sliding window and LRU cleanup guarding `POST /api/analyze`.

### 1.2 Track A: Design Tokens Lane (`lib/extract/*`)
- **`styleDump.ts`**: The single DOM observation primitive. Evaluates in-browser (`page.evaluate`) to extract a flat array of `NodeStyle` entries containing computed colors (by channel: `background`, `text`, `border`, `fill`, `stroke`), typography, layout dimensions, interactive attributes, ARIA context, CSSOM `:hover`/`:focus-visible` state deltas, and CSS transition/animation specs.
- **`palette.ts`**: Merges near-duplicate colors via ΔE (Lab/OKLCH perceptual color space), calculates area weights across screenshot pixels with `sharp`, and assigns canonical roles (`background`, `surface`, `text`, `primary`, `accent`, `muted`, `border`, `success`, `warning`, `danger`, `on-primary`).
- **`typography.ts` & `tokens.ts`**: Aggregates observed font stacks, type scales (display, h1, h2, h3, body, small), spacing scales (GCD base unit calculation), border radius scales, and box shadows.
- **`recipes.ts`**: Groups elements into modal recipes (`Button`, `TextLink`, `Input`, `Card`, `NavItem`, `Badge`).
- **`states.ts` & `motion.ts`**: Maps CSSOM interactive deltas to palette roles and extracts keyframe animations.
- **`imagePalette.ts`**: Multi-image color quantization and ΔE cluster merging for image-only uploads.

### 1.3 Track B: Structure Lane (`lib/extract/structure/*`)
- **Staged Pipeline**: `harvester` → `pruner` (wrapper collapse) → `repetition` (pattern detection) → `ontology` (region/component naming) → `structureAI` (optional Stage 7 semantic naming) → `responsive` (breakpoint diffing) → `regionMetrics` → `tokenLink` (bounds-overlap matching to design tokens).
- **`structureFromImage.ts`**: One-shot vision-inferred layout skeleton for image uploads without DOM access.

### 1.4 AI Enrichment Lane (`lib/aiLane.ts`, `lib/interpret.ts`)
- Centralized Gemini caller via `@google/genai`. Provides automatic repair retries (`retryOnce`), loose JSON extraction (`parseJsonLoose`), rate-limit detection (`warnAiFailure`), and schema validation (`zod`).
- Merges brand adjectives, archetype, description, hero/texture mood tags, and Stage-E color-role refinements onto measured reports.

---

## 2. Code Quality & Test Coverage Evaluation

| Verification Gate | Command | Current Status | Notes |
| :--- | :--- | :--- | :--- |
| **TypeScript Typecheck** | `npm run typecheck` | ✅ **PASS** | Zero `tsc` type errors (`--noEmit`). |
| **ESLint** | `npm run lint` | ✅ **PASS** | Zero lint errors across root & `app/`, `lib/`, `eval/`. |
| **Offline Eval Harness** | `npm run eval` | ✅ **PASS** | 100% aggregate score on `clean-light` and `dark-mode` corpus fixtures. |
| **AI Stability Eval** | `npm run eval:ai` | ⚠️ **OPT-IN** | Requires `GEMINI_API_KEY` set in environment. |

---

## 3. Issues, Edge Cases & Proposed Improvements

### 3.1 🔴 Critical / High Priority

#### 1. Gemini Model String Pinning (`lib/aiLane.ts`)
- **File:** [lib/aiLane.ts:21](file:///home/lauri/github/distill-design-scraper/lib/aiLane.ts#L21)
- **Description:** `AI_MODEL` is pinned to `"gemini-3.5-flash"`. In the official `@google/genai` API SDK, model strings for Flash are typically `"gemini-2.5-flash"`, `"gemini-2.0-flash"`, or `"gemini-1.5-flash"`. Calling `gemini-3.5-flash` against the production Google AI API will fail with an invalid model identifier error (400 Bad Request).
- **Recommended Fix:** Change `AI_MODEL` to `"gemini-2.5-flash"` or make `process.env.GEMINI_MODEL` the primary override with `"gemini-2.5-flash"` as default.

#### 2. SSRF Protection Gaps on HTTP Redirects (`lib/security/ssrfGuard.ts`, `lib/ingest.ts`)
- **File:** [lib/ingest.ts:160](file:///home/lauri/github/distill-design-scraper/lib/ingest.ts#L160)
- **Description:** `assertSafeUrl(url)` is invoked prior to calling `page.goto(url)`. However, if the target URL issues an HTTP 301/302 redirect to a local/private address (e.g. `http://169.254.169.254/latest/meta-data/` or `http://127.0.0.1:8080`), Playwright follows the redirect automatically, bypassing the initial host check.
- **Recommended Fix:** Intercept Playwright requests via `page.route('**/*', ...)` to validate the resolved IP of all HTTP redirect responses before body loading.

---

### 3.2 🟡 Medium Priority (UX & Operational)

#### 3. Action Button Ambiguity in Header (`app/page.tsx`)
- **File:** [app/page.tsx:373-379](file:///home/lauri/github/distill-design-scraper/app/page.tsx#L373-L379)
- **Description:** The header buttons say "Copy .md" and "Download .md". When viewing the "Design System Preview" tab, clicking these buttons exports the Design System markdown. Users cannot tell which document is exported when both Design System and Layout Structure reports exist. Additionally, line 162 contains an unaddressed `TODO` comment.
- **Recommended Fix:** Dynamicize button labels based on the active tab (e.g., `Copy Design System .md`, `Download Structure .md`) or provide clear dropdown options. Resolve line 162.

#### 4. Missing API Key User Guidance in Frontend UI (`app/page.tsx`)
- **File:** [app/page.tsx:427-430](file:///home/lauri/github/distill-design-scraper/app/page.tsx#L427-L430)
- **Description:** When `GEMINI_API_KEY` is not present, the metadata panel shows `AI lane: skipped (no key)`. Users have no immediate indication of how to enable AI features.
- **Recommended Fix:** Add a helper tooltip or link explaining how to set `GEMINI_API_KEY` in `.env.local`.

#### 5. Leftover Temporary Artifact (`temp.txt`)
- **File:** [temp.txt](file:///home/lauri/github/distill-design-scraper/temp.txt)
- **Description:** `temp.txt` contains scratch notes, pricing comparison tables, and manual issue log entries.
- **Recommended Fix:** Delete `temp.txt` or add it to `.gitignore` to keep the repository clean.

---

### 3.3 🟢 Low Priority (CI/CD & Maintenance)

#### 6. Missing Automated GitHub Actions Workflow (`.github/workflows/ci.yml`)
- **Description:** The repository has evaluation scripts (`npm run eval`), typechecking, and linting, but lacks a GitHub Actions CI workflow to execute these checks automatically on PRs.
- **Recommended Fix:** Create `.github/workflows/ci.yml` running `npm run typecheck`, `npm run lint`, and `npm run eval`.

#### 7. Container Playwright Dependency Verification (`Dockerfile`)
- **Description:** Ensure Docker container builds invoke `npx playwright install-deps chromium` so Linux system libraries (e.g., `libnss3`, `libgbm`) are present in non-GUI environments.

---

## 4. File-by-File Status Matrix

| File Path | Status | Needs Changes? | Details / Action Item |
| :--- | :---: | :---: | :--- |
| `app/api/analyze/route.ts` | Healthy | No | Robust payload size checks (8 MiB/image limit), caching, rate limiting, and 422/502 handling. |
| `app/page.tsx` | Functional | **Yes** | Update Copy/Download button labels for clarity; resolve line 162 TODO; add API key setup hint. |
| `lib/aiLane.ts` | Operational | **Yes** | Fix `AI_MODEL` string (`gemini-2.5-flash`). |
| `lib/analyze.ts` | Healthy | No | Clean orchestration of measured vs. AI lanes. |
| `lib/ingest.ts` | Functional | **Yes** | Add HTTP redirect validation to Playwright navigation route interceptor. |
| `lib/schema.ts` | Healthy | No | Complete Zod schemas covering design tokens and layout structure. |
| `lib/emit.ts` | Healthy | No | Full markdown generator and Tailwind `@theme` CSS variable exporter. |
| `lib/security/ssrfGuard.ts` | Healthy | No | Thorough DNS resolution and private IP range checker. |
| `lib/security/rateLimiter.ts` | Healthy | No | LRU-bounded token bucket rate limiter. |
| `lib/extract/styleDump.ts` | Healthy | No | Self-contained single-pass DOM evaluation script. |
| `lib/extract/palette.ts` | Healthy | No | ΔE merging, Sharp area weighting, role scoring & semantic priority rules. |
| `lib/extract/structure/*` | Healthy | No | Staged layout extraction pipeline. |
| `eval/run.ts` | Healthy | No | Replays committed captures offline against expected YAML scores. |
| `temp.txt` | Stale | **Yes** | Delete or add to `.gitignore`. |

---

## 5. Conclusion & Action Plan

The codebase is well-structured, modular, and adheres to high engineering standards (strict TypeScript types, zero lint errors, offline test harness).

**Recommended Immediate Sequence of Fixes:**
1. Update model identifier string in `lib/aiLane.ts` (`"gemini-2.5-flash"`).
2. Clean up UI action buttons and remove `TODO` in `app/page.tsx`.
3. Add redirect IP verification in `lib/ingest.ts`.
4. Delete `temp.txt`.
5. Add `.github/workflows/ci.yml` for automated CI gating.
