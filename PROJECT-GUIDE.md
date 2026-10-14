# Project guide

Distill turns live web pages and screenshots into structured design systems. Feed it a URL or up to six images, and it outputs a Markdown report detailing colors, typography, spacing, component patterns, and layout structure. Along with the report, it generates ready-to-use CSS variables and a Tailwind v4 theme block.

The project follows one rule: measured, never faked. Scrapers love to guess or hallucinate when a page does not fit a neat template. Distill avoids that. If a page does not define a property, Distill omits the field instead of inventing an approximation. Every value carries an explicit provenance tag indicating where it came from: measured from CSS and DOM nodes, inferred through geometry heuristics, or suggested by an AI vision model.

## Big picture

Pulling a design system out of a website by hand is tedious. You open DevTools, sample colors from pixels, inspect computed styles on fifty different divs, and measure padding by hovering over elements. Distill automates that entire process in a single pass.

The extraction pipeline runs two independent tracks:

Track A extracts design tokens. Headless Chromium loads the page and dumps computed styles from every visible DOM node. Colors get clustered by perceptual distance in OKLCH space, weighted by how much physical screen area they occupy across the viewport and full-page panoramas, and checked for WCAG contrast. When a site supports dark mode, a second render runs with a dark color scheme to produce a dark palette, though only if the background colors actually change. Typography extracts font families, weights, and line heights, measuring heading sizes on desktop and again on a 390px mobile viewport. Spacing, corner radiuses, and elevation shadows come from real bounding boxes. Component recipes for buttons, inputs, and cards, along with CSS hover and focus states, get aggregated directly from stylesheets.

Track B extracts layout structure. It takes the raw DOM tree and strips away unstyled wrapper divs. A layout squashing step then merges redundant nested flex and grid containers. The pipeline flags repeating item grids, classifies major regions into semantic landmarks like header, hero, main content, and footer, and runs a responsive diff against mobile and tablet viewports to see how columns collapse. When you run both tokens and structure together, it links structural components back to their matching design tokens.

The AI lane is optional. It connects to OpenRouter using standard HTTP fetch calls, defaulting to Gemini 3.5 Flash. When enabled, it suggests brand adjectives, mood descriptions, and plain-English summaries for each section. Without an API key, the extraction pipeline runs completely offline.

## Codebase map

The codebase is lean. It contains roughly thirty core TypeScript files without extra layers or abstractions:

- `app/page.tsx` is the whole frontend. It is a single React client component that renders the input form, handles image uploads, and displays the three result tabs (preview, tokens, structure). It uses no component library or state management package.
- `app/api/analyze/route.ts` is the only API endpoint. It validates incoming requests, manages rate limits, checks the in-memory cache, and dispatches jobs to the extraction pipeline.
- `app/globals.css` and `app/distill-theme.css` contain Tailwind v4 styling and semantic theme tokens.
- `lib/analyze.ts` coordinates the extraction run. It ties together browser rendering, token analysis, structure harvesting, and the optional AI pass.
- `lib/ingest.ts` drives Playwright. It loads URLs, scrolls to take full-page stitched panorama screenshots, captures responsive snapshots, and extracts computed styles.
- `lib/schema.ts` and `lib/extract/structureSchema.ts` define all data contracts using Zod.
- `lib/emit.ts` and `lib/emitTailwind.ts` turn extracted data into Markdown, CSS custom properties, and Tailwind theme blocks.
- `lib/color.ts` wraps Culori for perceptual color math in Lab and OKLCH color spaces.
- `lib/aiLane.ts` is the single file that speaks to external AI models. It manages API requests to OpenRouter, handles retries, and extracts JSON safely.
- `lib/extract/` houses individual token extractors for palettes, typography, spacing, component recipes, hover states, and CSS keyframe animations.
- `lib/extract/structure/` contains the staged DOM analysis pipeline, handling pruning, squashing, repetition grouping, ontology labeling, responsive comparisons, and section digests.
- `lib/security/` houses SSRF protection in `ssrfGuard.ts` and an in-process token-bucket rate limiter in `rateLimiter.ts`.
- `eval/` contains the offline test suite. It replays committed JSON captures against hand-written expectations to catch regressions without touching the network.

## Tech stack and design decisions

Distill was built with deliberate constraints. The goal was a clean single-container application without backend sprawl.

### Framework and runtime

Distill runs as a single Next.js 15 application on React 19 and TypeScript 5.7. Next.js provides both the user interface and the server endpoints needed to drive Playwright in one repository. There is no separate backend service, worker queue, or external database to manage.

### Runtime dependencies

The project relies on eight runtime packages:

- `playwright`: Headless Chromium for page rendering, screenshots, and style dumping. It is pinned to version 1.61.1 to match the base Docker image exactly. In `next.config.mjs`, it is excluded from server bundling because bundling breaks Playwright's filesystem access to browser binaries.
- `sharp`: Fast C-based image processing. It handles pixel quantization for palette area weighting, stitches panorama slices, and checks uploaded file formats.
- `culori`: Accurate color space conversions. Naive RGB math does not match human perception. Culori clusters colors using delta-E in OKLCH and Lab spaces so near-identical shades combine cleanly.
- `zod`: Enforces runtime schemas on user requests, internal data contracts, and AI model outputs.
- `js-yaml`: Generates and parses YAML frontmatter in reports.
- `next`, `react`, `react-dom`: The core web framework and UI runtime.

### Styling with Tailwind CSS v4

Tailwind v4 runs through `@tailwindcss/postcss`. Distill uses the new CSS-first setup directly in `app/globals.css`, eliminating `tailwind.config.js`. UI elements use semantic role classes like `bg-surface`, `text-ink-muted`, and `border-line` defined in `app/distill-theme.css`, which adapt to light and dark themes automatically.

### Direct OpenRouter integration

Instead of pulling in provider-specific SDKs, `lib/aiLane.ts` calls OpenRouter's HTTP completion endpoint using standard fetch. This avoids vendor lock-in, keeps the dependency tree small, and isolates all model communication into one file. The default model is `google/gemini-3.5-flash`, which can be overridden using the `OPENROUTER_MODEL` environment variable.

### Ephemeral state

Distill deliberately skips a database. Scrape results sit in an in-process TTL and LRU cache (`lib/cache.ts`) for ten minutes. Rate limiting (`lib/security/rateLimiter.ts`) uses an in-memory token bucket. Both reset when the process restarts. For a single-node tool, this keeps operations simple and removes database maintenance entirely.

### Custom eval harness instead of test frameworks

There is no Jest or Vitest in the repository. Standard unit tests with mocked DOM objects do not catch scraper regressions well. Instead, `npm run eval` replays frozen JSON captures against hand-crafted `expected.yaml` fixture targets. It runs offline without internet access, testing token extraction and layout structure deterministically in CI.

## Development and testing

### Scripts

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

### Docker deployment

The project includes a multi-stage `Dockerfile` based on `mcr.microsoft.com/playwright:v1.61.1-jammy`. The container runs as the unprivileged `pwuser` user. The base image tag is tightly coupled to the `playwright` version in `package.json`. If you update one, always update the other in the same commit to avoid startup errors.

## Security and deployment

Navigating a headless browser to arbitrary user-submitted URLs creates server-side request forgery risks. If you host Distill publicly, plan on multiple defensive layers:

The built-in SSRF guard in `lib/security/ssrfGuard.ts` resolves hostnames before navigation and rejects requests targeting private, loopback, link-local, or cloud metadata addresses like `169.254.169.254`. For local testing, specific hostnames can be allowlisted using `SSRF_ALLOWLIST_HOSTS`.

Application-level guards cannot intercept every subresource or prevent all DNS-rebinding tricks. Production deployments should block container network egress to private IP ranges directly at the firewall or Docker host level.

Because the API does not handle user authentication, put a reverse proxy like Caddy, Nginx, or Cloudflare in front to manage TLS, handle authentication, and forward client IP addresses to the rate limiter.
