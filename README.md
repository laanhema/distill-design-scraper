# Distill — Design System & Structure Scraper

**Distill** turns any website URL or dropped-in image into a structured Markdown design system and page architecture specification. It combines headless browser extraction, deterministic CSS token mining, DOM layout analysis, and optional AI vision interpretation to produce machine-parseable YAML frontmatter paired with human-readable documentation.

---

## Capabilities & Feature Lanes

Distill operates via two parallel extraction tracks:

### 🎨 Track A: Token Lane (Design System)
- **Palette Harvesting**: Area-weighted pixel analysis (via Sharp & Culori), DOM color clustering, OKLCH perception, APCA contrast calculations, and automatic role assignment (*primary*, *surface*, *text*, *border*, *status*).
- **Typography Scale**: Extracted font families, size hierarchy, font weights, line heights, and letter spacing.
- **Spatial & Geometry Tokens**: Inferred spacing multiples/base units, corner radius scales, and normalized box-shadow elevation levels.
- **AI Visual Interpretation** *(Optional)*: Vision model analysis producing brand identity/personality, aesthetic style tags, target audience framing, and Unsplash `imageMood` keywords.

### 🏗️ Track B: Structure Lane (Layout Architecture)
- **8-Stage Extraction Pipeline**: `Render` → `Harvest` → `Prune` → `Wrapper Collapse` → `Repetition Detection` → `Ontological Mapping` → `AI Semantic Refinement` → `Structure Emitter`.
- **Layout Mechanics**: Detailing page layout modes (CSS Grid, Flexbox, Container Queries), max-width constraints, sticky headers, and responsive breakpoint rules.
- **Page Ontology & Regions**: Classifies structural regions (Header, Hero, Navigation, Sidebar, Main Content, Footer, Cards, Grids, Forms, Controls).
- **Modularity & Hierarchies**: Maps nested UI component trees and repeating patterns.

---

## Input Modes & Reports

- **URL Input**: Executes a headless Chromium browser instance via Playwright to capture computed styles, screenshot, and raw DOM node trees. Supports mode selection: `tokens`, `structure`, or `both`.
- **Image Input**: Generates a lighter `palette-mood` report based on image palette extraction and AI vision interpretation (bypassing synthetic or faked typography/spacing tokens). **Palette & Mood only** — an uploaded image has no DOM to harvest, so there is no layout-structure report for image input, regardless of mode. Accepts one or more images of the same site/design (up to 6); their pixel clusters are merged into a single deduplicated palette rather than producing one report per image.

---

## Interactive UI & API

Distill includes a modern Next.js web application featuring:
- **Interactive Workbench**: URL submission, mode toggles (`tokens`, `structure`, `both`) for URL input, and drag-and-drop multi-image upload (Palette & Mood only) with a thumbnail strip, plus forced cache refresh controls.
- **Visual Swatches & Previews**: Live viewport rendering alongside visual color swatches and OKLCH/APCA contrast indicators.
- **Tabbed Markdown Output**: Quick tabs for Preview, Design System Tokens, and Structural Architecture, with 1-click Markdown copying and file downloading.
- **REST Endpoint**: `POST /api/analyze` accepts JSON payloads containing `{ url, images, mode, forceRefresh }` (`images` is `{ data, name? }[]`; the legacy single-image `image`/`imageName` fields still work as a one-element alias) and returns fully formatted reports and metadata.

---

## Requirements

- **Node.js 18+** (Developed and tested on Node 20 / 22)
- **Chromium** (Installed automatically by Playwright during `npm install`)
- **Anthropic API Key** *(Optional)*: Required for the AI lane (`identity`, `imageMood`, and semantic structural refinement). Without a key, deterministic token extraction operates fully offline.

---

## Setup & Configuration

1. **Install dependencies**:
   ```bash
   npm install
   ```
   *Note: `npm install` automatically triggers `playwright install chromium` via a postinstall hook.*

2. **Configure Environment Variables** *(Optional)*:
   Create a `.env.local` file in the project root to enable the AI interpretation lane:
   ```env
   # .env.local
   ANTHROPIC_API_KEY=sk-ant-...
   ```

3. **SSRF guard** *(built in, no configuration required)*:
   Before navigating to any submitted URL, Distill resolves its hostname via DNS and
   rejects the request if the resolved address falls in a loopback, private, or
   link-local range — `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`,
   `169.254.0.0/16`, `0.0.0.0/8` (IPv4), and `::1`, `fc00::/7`, `fe80::/10` (IPv6,
   including IPv4-mapped addresses like `::ffff:127.0.0.1`). Validation happens
   *after* DNS resolution, not against the literal hostname string, so a hostname
   that resolves to a private address is blocked even if it looks public. Non-`http(s)`
   schemes (`file://`, `ftp://`, etc.) are always rejected.

   To explicitly permit an internal target (e.g. a staging host), set
   `SSRF_ALLOWLIST_HOSTS` in `.env.local` to a comma-separated, case-insensitive list
   of exact hostnames:
   ```env
   # .env.local
   SSRF_ALLOWLIST_HOSTS=staging.example.internal,localhost
   ```

4. **Rate limiting** *(built in, tunable/disable-able)*:
   `POST /api/analyze` enforces a per-client-IP token bucket — 20 requests per minute
   by default — guarding the expensive Chromium render / AI enrichment path. Cache hits
   don't count against the limit, since they do no render/AI work at all; only a cache
   miss or `forceRefresh` request consumes a token. Once a client's bucket is empty, the
   route returns `429` with a `Retry-After` header (seconds until the next token refills).
   The store is bounded to at most `RATE_LIMIT_MAX_BUCKETS` distinct client IDs, so a
   high-cardinality traffic pattern (e.g. spoofed `X-Forwarded-For` headers) can't grow
   the limiter's own memory usage without bound. Tune or disable it via `.env.local`:
   ```env
   # .env.local
   RATE_LIMIT_MAX_REQUESTS=20
   RATE_LIMIT_WINDOW_MS=60000
   RATE_LIMIT_MAX_BUCKETS=50000  # cap on distinct tracked client IDs
   RATE_LIMIT_DISABLED=true   # disable entirely, e.g. for local dev
   ```

---

## Running the Application

### Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build
```bash
npm run build
npm run start
```

### Docker Container
Distill includes a multi-stage Dockerfile pre-configured with Playwright browser dependencies:
```bash
docker build -t distill .
docker run -p 3000:3000 -e ANTHROPIC_API_KEY="sk-ant-..." distill
```

---

## Deploying Publicly — Hardening Guide

### Threat model

Distill navigates a real headless Chromium browser to arbitrary user-submitted URLs — the classic
SSRF (server-side request forgery) surface. A malicious submission could aim that browser at the
operator's internal network, or at a cloud metadata endpoint (`169.254.169.254` on AWS/GCP/Azure)
that can leak instance credentials. Defending against this is layered: built-in protections first,
network sandboxing second, and auth/limits at the edge third.

### Layer 1 — built-in protections

- **SSRF guard**: before navigating anywhere, Distill DNS-resolves the submitted hostname and
  fails closed if the resolved address is loopback, private, or link-local — see Setup &
  Configuration §3 above for the full range list and the `SSRF_ALLOWLIST_HOSTS` opt-out.
- **Rate limiting**: `POST /api/analyze` enforces a per-client token bucket (`RATE_LIMIT_*` env
  vars), returning `429` + `Retry-After` once exhausted — see Setup & Configuration §4 above.
  Honestly: the bucket store is in-memory per process, so a horizontally-scaled deployment (N
  instances behind a load balancer) enforces N independent limits, not one global cap. A shared
  store (e.g. Redis) would be required to close that gap; it's not built in.

### Layer 2 — network-restrict the container

The built-in SSRF guard only validates the *initial* submitted URL. Once Chromium starts
rendering, the page's own subresource requests, any HTTP redirects it follows, and JS-initiated
`fetch`/`XHR` calls all ride the browser session and are **not** re-checked against the guard.
Network-level egress restriction on the container is the layer that closes this gap.

Example: block the container's route to cloud metadata and RFC1918 private ranges via the
`DOCKER-USER` iptables chain on the Docker host (consulted for all traffic leaving Docker
networks):

```bash
# Block container egress to cloud metadata + private ranges (DOCKER-USER
# chain is consulted for all traffic leaving Docker networks):
iptables -I DOCKER-USER -d 169.254.0.0/16 -j DROP   # link-local incl. 169.254.169.254 metadata
iptables -I DOCKER-USER -d 10.0.0.0/8     -j DROP
iptables -I DOCKER-USER -d 172.16.0.0/12  -j DROP
iptables -I DOCKER-USER -d 192.168.0.0/16 -j DROP
```

An internal network + egress proxy, or a cloud-native egress firewall (security groups / VPC
firewall rules), achieves the same result. Whichever mechanism you use, remember that any host
you add to `SSRF_ALLOWLIST_HOSTS` needs a corresponding hole in the egress rules, or the guard
will let the request through only for the network layer to drop it anyway.

### Layer 3 — front the API

`POST /api/analyze` is unauthenticated by design (see Setup & Configuration above) — that's an
intentional MVP scope decision, not an oversight. Before exposing it publicly, put a reverse proxy
(nginx, Caddy, Cloudflare, etc.) in front to provide TLS and auth (basic auth, an OAuth proxy, or
API keys). This also matters for rate limiting: the limiter trusts the first `X-Forwarded-For`
entry (falling back to `X-Real-IP`) as the client identity, so a direct-exposed deployment lets
any client spoof that header and dodge its own limit. Accurate per-client limits require a
trusted reverse proxy that sets or overwrites `X-Forwarded-For` itself, rather than passing through
whatever the client sent.

---

## Scripts & CLI Commands

| Command | Description |
|---|---|
| `npm run dev` | Starts Next.js development server at `http://localhost:3000`. |
| `npm run build` | Builds the Next.js production application. |
| `npm run start` | Runs the production Next.js server. |
| `npm run lint` | Runs `next lint` code checks. |
| `npm run typecheck` | Validates TypeScript types (`tsc --noEmit`). |
| `npm run eval` | Evaluates extraction heuristics against corpus fixtures (`eval/corpus`) offline without a live browser. |
| `npm run eval:ai` | Performs stability checks on AI interpretation outputs across multiple runs. |
| `npm run eval:capture` | Captures fresh corpus screenshots and DOM/style dumps for evaluation fixtures. |

