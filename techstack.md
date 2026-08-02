# Tech Stack

A snapshot of Distill's tech stack: what it's built on, what it depends on, and the
non-obvious constraints those choices carry.

## Core framework

**Next.js 15 (App Router) + React 19, TypeScript 5.7 strict, ESM throughout.** It's a
single-app monolith — no separate backend service. The whole app surface is:

- `app/page.tsx` — one client component (the entire UI; no state library, no component library)
- `app/api/analyze/route.ts` — the only API route; does render → extract → optional AI enrichment
- `app/layout.tsx` + `app/globals.css` — Tailwind v4 via `@import "tailwindcss"`

Everything else is plain TypeScript modules under `lib/` (~30 files) and `eval/`.
Path alias `@/*` → project root (`tsconfig.json`).

## Runtime dependencies (9 total — deliberately thin)

| Package               | Version                 | Role                                                                                                                                |
| --------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `next`                | ^15.1.6                 | app framework (App Router)                                                                                                          |
| `react` / `react-dom` | ^19.0.0                 | UI runtime                                                                                                                          |
| `playwright`          | 1.61.1 (pinned exactly) | headless Chromium — the ingestion engine in `lib/ingest.ts`; renders the URL, runs the in-page style dump, screenshots, DOM harvest |
| `sharp`               | ^0.35.3                 | image pipeline — pixel quantization for palette area-weighting, panorama tile stitching, upload format sniffing                     |
| `culori`              | ^4.0.2                  | perceptual color math (Lab/OKLCH, ΔE) — all color decisions go through `lib/color.ts`, never raw RGB                                |
| `zod`                 | ^4.4.3                  | **the schema source of truth** (`lib/schema.ts`, `lib/extract/structureSchema.ts`) — also the shape gate on every AI response       |
| `@google/genai`       | ^2.13.0                 | Gemini SDK — the only model SDK, isolated to `lib/aiLane.ts`                                                                        |
| `js-yaml`             | ^5.2.1                  | YAML frontmatter emit/parse for the report contract                                                                                 |

## Dev / build tooling

- **Tailwind CSS v4** via `@tailwindcss/postcss` — no `tailwind.config.js`; CSS-first config
  in `app/globals.css`
- **ESLint 9** flat config (`eslint.config.mjs`) with `eslint-config-next`
- **tsx** — runs the `eval/*` scripts directly
- **`postinstall`** auto-runs `playwright install chromium`

## Scripts

```bash
npm run dev             # Next.js dev server
npm run build           # production build
npm run start           # production server
npm run lint            # eslint .
npm run typecheck       # tsc --noEmit

npm run eval            # regression gate over the measured extraction lane
npm run eval:capture    # (re)capture eval/corpus/*/capture.json
npm run eval:ai         # stability check on AI-lane outputs across repeated runs
```

## Notable architectural details

**Two AI providers behind one seam.** Despite only `@google/genai` being a dependency,
`lib/aiLane.ts` also speaks to OpenRouter over plain `fetch` (`/chat/completions`) — no SDK
needed. If `OPENROUTER_API_KEY` is set it wins; otherwise the Gemini SDK path. Both default
to a Gemini 3.5 Flash-generation model (`GEMINI_MODEL` / `OPENROUTER_MODEL` override each
independently). No other file is allowed to import a model SDK, inline a model id, or scrape
JSON out of a model response.

**Playwright is excluded from Next's bundler** (`serverExternalPackages: ["playwright",
"playwright-core"]` in `next.config.mjs`) because it spawns a real browser binary off disk
and needs the actual `node_modules` present.

**Deployment is Docker**, based on `mcr.microsoft.com/playwright:v1.61.1-jammy` (two-stage
build, runs as the image's non-root `pwuser`). The image tag is intentionally locked to the
`playwright` dependency version — bumping one without the other means "browser not found" at
launch. Bump both in the same commit.

**No test framework.** There's no jest/vitest. The correctness gate is a custom eval harness
(`npm run eval`) that replays committed JSON captures offline — no browser, no network — and
scores extraction against hand-authored `expected.yaml` specs, with a per-site absolute floor
plus a no-regression check against `eval/baseline.json`. CI (`.github/workflows/ci.yml`) runs
`typecheck → lint → eval` on Node 20 with **no API key** in the environment, so anything that
only passes with a key set will fail there.

**No database, no auth.** Persistent state is an in-process TTL + LRU cache (`lib/cache.ts`)
and an in-memory token-bucket rate limiter (`lib/security/rateLimiter.ts`) — both explicitly
per-process, a documented single-instance MVP limitation rather than an oversight. Both are
bounded via env vars parsed through `lib/env.ts`.
