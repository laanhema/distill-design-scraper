# Tech stack

What Distill runs on, what it pulls in, and the specific constraints behind those choices.

## Core framework

The whole project is a single Next.js 15 app on React 19, written in strict TypeScript 5.7 with ESM throughout. There is no separate backend service or database to juggle. The visible app surface fits in three places:

- `app/page.tsx`: A single client component that renders the entire UI. No state management library, no component kits.
- `app/api/analyze/route.ts`: The only API endpoint in the project. It drives the render pipeline, extracts design tokens and layout structure, and runs optional AI enrichment.
- `app/layout.tsx` and `app/globals.css`: Page shell and Tailwind v4 loaded directly through `@import "tailwindcss"`.

Everything else lives in plain TypeScript modules under `lib/` (around 30 files) and `eval/`. The `@/*` path alias points straight to the project root.

## Runtime dependencies (8 total, deliberately thin)

| Package               | Version         | Role                                                                                                                                            |
| --------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `next`                | ^15.1.6         | App Router web framework                                                                                                                        |
| `react` / `react-dom` | ^19.0.0         | UI runtime                                                                                                                                      |
| `playwright`          | 1.61.1 (pinned) | Headless Chromium ingestion engine in `lib/ingest.ts`. Renders target URLs, dumps in-page styles, captures screenshots, and harvests DOM nodes. |
| `sharp`               | ^0.35.3         | Image processing: pixel quantization for palette area weights, panorama tile stitching, and upload format sniffing.                             |
| `culori`              | ^4.0.2          | Perceptual color math (Lab, OKLCH, and ΔE). All color calculations run through `lib/color.ts` instead of raw RGB.                               |
| `zod`                 | ^4.4.3          | Primary schema definitions in `lib/schema.ts` and `lib/extract/structureSchema.ts`, plus runtime validation on every AI response.               |
| `js-yaml`             | ^5.2.1          | Emits and parses YAML frontmatter in the report contract.                                                                                       |

## Dev and build tooling

Tooling is kept straightforward:

- Tailwind CSS v4 runs through `@tailwindcss/postcss`. There is no `tailwind.config.js`; theme variables and utility configurations live directly in `app/globals.css`.
- ESLint 9 uses the flat config format in `eslint.config.mjs` alongside `eslint-config-next`.
- `tsx` executes TypeScript eval scripts directly without a build step.
- The `postinstall` script downloads the matching Playwright Chromium binary automatically.

## Scripts

```bash
npm run dev             # Next.js dev server
npm run build           # production build
npm run start           # production server
npm run lint            # eslint .
npm run typecheck       # tsc --noEmit
npm run check           # typecheck + lint + build + eval (runs in CI)

npm run eval            # regression gate over the measured extraction lane
npm run eval:capture    # capture eval/corpus/*/capture.json from live pages or fixtures
npm run eval:ai         # stability check on AI-lane outputs across repeated runs
```

## Notable architectural details

Rather than importing an official client library, `lib/aiLane.ts` speaks directly to OpenRouter via standard `fetch` against `/chat/completions`. That keeps the dependency tree lean and avoids tying the codebase to any vendor's abstractions. The default model is `google/gemini-3.5-flash`, which can be overridden with the `OPENROUTER_MODEL` environment variable. To prevent AI logic from leaking across the project, no other file is permitted to touch a provider endpoint, hardcode a model identifier, or parse model JSON.

Playwright is explicitly excluded from Next.js bundling via `serverExternalPackages: ["playwright", "playwright-core"]` in `next.config.mjs`. Because it launches a physical Chromium binary from disk, bundling breaks it; it needs real filesystem access to `node_modules`.

Docker deployment is built around `mcr.microsoft.com/playwright:v1.61.1-jammy` in a two-stage build running under the container's unprivileged `pwuser`. The base image tag is tightly coupled to the `playwright` version in `package.json`. If you bump one without the other, the container will throw "browser not found" errors at startup. Always update both in the same commit.

There is no Jest or Vitest in the repository. Instead, correctness is enforced by a custom eval harness (`npm run eval`). It replays frozen JSON captures completely offline (no live browser, no network) and scores extraction against hand-written `expected.yaml` fixture targets. Each fixture must clear an absolute score floor, and the combined score cannot fall below `eval/baseline.json`. CI runs `npm run check` on Node 20 without an API key in the environment, which guarantees that extraction passes without depending on external LLM calls.

The system intentionally skips a database and user authentication. State is ephemeral: an in-process TTL and LRU cache (`lib/cache.ts`) for scrape results, and an in-memory token-bucket rate limiter (`lib/security/rateLimiter.ts`). Both are scoped to the running Node process, which is a conscious design tradeoff for a single-instance deployment rather than an oversight. Both limits are configurable via environment variables parsed in `lib/env.ts`.
