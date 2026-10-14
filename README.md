# Distill: design system and structure scraper

Distill inspects a live URL or a batch of uploaded screenshots and outputs a Markdown report covering both design tokens and layout structure. It combines headless Chromium style dumps and DOM harvesting with optional vision-model enrichment. The report couples machine-parseable YAML frontmatter with a human-readable body, along with ready-to-use CSS variables and a Tailwind v4 `@theme` block.

## Tech stack

Distill runs as a single Next.js monolith with no external database. Detailed notes on architectural constraints live in [TECHSTACK.md](TECHSTACK.md).

| Layer | Stack | Purpose |
| --- | --- | --- |
| Framework | Next.js 15, React 19, TypeScript 5.7 | Single-page UI workbench and the `POST /api/analyze` route |
| Styling | Tailwind CSS v4 | CSS-first configuration via `@import "tailwindcss"` |
| Ingestion | Playwright (Chromium 1.61.1) | Headless page rendering, computed style dumps, DOM harvest, and full-page panorama stitching |
| Image pipeline | Sharp | Pixel quantization for palette area weighting and panorama assembly |
| Color math | Culori | Perceptual color conversions in Lab and OKLCH, ΔE clustering, and WCAG contrast calculations |
| Schemas | Zod 4 | Runtime shape validation for internal contracts and AI responses |
| Serialization | js-yaml | Frontmatter generation and parsing |
| AI lane (optional) | OpenRouter (`gemini-3.5-flash`) | Brand identity, mood tagging, and semantic section refinement over standard `fetch` |

## What it extracts

Extraction splits into two largely independent tracks, both following a strict principle: measured, never faked. If a page does not exhibit a property, Distill leaves the field out instead of inventing a placeholder.

### Design tokens

The token lane turns rendered pixels and stylesheets into a coherent design system:

- Color palettes are derived from area-weighted pixel distributions across both the viewport and full-page panoramas. Colors cluster by perceptual distance (ΔE) in OKLCH space, assigning semantic roles like primary, surface, and text while testing for WCAG contrast. A second render under `prefers-color-scheme: dark` extracts a dedicated `paletteDark` when backgrounds actually shift.
- Typography captures declared font families, weight scales, and line heights. Heading sizes are measured twice: once on desktop and again during a mobile re-harvest at 390px.
- Spacing, corner radius scales, and box-shadow elevation levels are inferred from real element geometry.
- Component recipes aggregate modal CSS properties across common UI elements like buttons, inputs, badges, and cards, while interaction states record `:hover` and `:focus-visible` style deltas.
- Declared transition timings and referenced `@keyframes` animations are pulled straight from the CSSOM.

### Layout structure

The structure lane breaks down how the page is assembled:

- Structural regions categorize areas into Header, Hero, Main Content, Sidebar, Footer, and repeating item grids.
- A responsive diff re-renders at 390px and 768px viewports to detect layout reorganizations, like a three-column card grid collapsing into a single stack.
- The section digest produces an ordered breakdown of major page bands, summarizing layout metrics, responsive rules, and linked design tokens.

### Outputs and inputs

- Output formats include the unified Markdown report, a downloadable Tailwind v4 `@theme` stylesheet, and normalized `:root` CSS custom properties.
- Input supports live URLs (fetching computed styles, full-page scroll panoramas, and DOM snapshots) or up to six uploaded screenshots merged into a single deduplicated palette.

## Quick start

### Prerequisites

You need Node.js 18 or higher (Node 20+ recommended) and a Chromium binary, which installs automatically during setup.

An OpenRouter API key is optional. Without one, deterministic extraction runs completely offline.

### Setup

```bash
git clone https://github.com/laanhema/distill-design-scraper.git
cd distill-design-scraper
npm install
```

If you want the AI visual interpretation lane, create a `.env.local` file:

```env
OPENROUTER_API_KEY=your_key_here
# OPENROUTER_MODEL=google/gemini-3.5-flash  # optional override
```

### Running locally

Start the local development server:

```bash
npm run dev
```

Then visit [http://localhost:3000](http://localhost:3000).

To run inside Docker:

```bash
docker build -t distill .
docker run -p 3000:3000 -e OPENROUTER_API_KEY="..." distill
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the Next.js dev server at `http://localhost:3000` |
| `npm run build` | Builds the production bundle |
| `npm run start` | Runs the production server |
| `npm run check` | Runs typecheck, lint, build, and offline eval (runs in CI) |
| `npm run eval` | Scores extraction accuracy against offline corpus fixtures |
| `npm run eval:capture` | Captures fresh evaluation fixtures from live websites |

## Deploying publicly: hardening guide

Navigating a headless browser to arbitrary user-submitted URLs creates server-side request forgery risks. If you host Distill publicly, plan on defense in depth:

- Built-in SSRF guard: Distill resolves target hostnames before navigating and drops requests pointed at private, loopback, link-local, or cloud metadata addresses. The same validation applies to redirect targets (`3xx`). For local testing or staging sites, hostnames can be allowlisted using `SSRF_ALLOWLIST_HOSTS`.
- Container egress controls: The application-level guard cannot intercept every subresource or prevent DNS-rebinding tricks. Production deployments should block container egress to private IP ranges and `169.254.169.254` directly at the firewall or Docker host level.
- Edge reverse proxy: The API does not handle authentication. Put a proxy like Caddy, Nginx, or Cloudflare in front to manage TLS, handle auth, and forward reliable client IP headers to the rate limiter.

See [docs/architecture/security.md](docs/architecture/security.md) for details on the security implementation.

## Documentation

Detailed architecture docs live in `docs/architecture/`:

- [Tokens lane](docs/architecture/tokens-lane.md): Color math, typography heuristics, and token extraction.
- [Structure lane](docs/architecture/structure-lane.md): DOM harvesting, wrapper squashing, and layout trees.
- [Security](docs/architecture/security.md): SSRF validation rules and rate limiting.
- [API route](docs/architecture/api-route.md): `POST /api/analyze` request lifecycle.
- [Evaluation harness](AGENTS.md): Offline regression testing across fixture sites.
