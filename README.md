# Distill — Design System & Structure Scraper

**Distill** turns any website URL or dropped-in image into a structured Markdown design system and page architecture specification. It combines headless browser extraction, deterministic CSS token mining, DOM layout analysis, and optional AI vision interpretation to produce machine-parseable YAML frontmatter paired with human-readable documentation.

---

## Capabilities & Feature Lanes

Distill operates via two parallel extraction tracks:

### 🎨 Track A: Token Lane (Design System)
- **Palette Harvesting**: Area-weighted pixel analysis (via Sharp & Culori) across the viewport shot *and* the stitched full-page panorama, DOM color clustering, perceptual ΔE merging, OKLCH math, WCAG contrast floors, and staged role assignment (*primary*, *surface*, *text*, *border*, *muted*, semantic *success/warning/danger*).
- **Dark-Scheme Palette** *(when present)*: A second render under `prefers-color-scheme: dark` yields `paletteDark` — emitted **only** if the backgrounds actually shift, so single-scheme sites never get a fabricated dark palette.
- **Typography Scale**: Font families, size hierarchy, weights, line heights, and letter spacing — plus mobile heading sizes (`sizePxMobile`) measured from a real 390px-wide re-harvest.
- **Spatial & Geometry Tokens**: Inferred spacing multiples/base units, corner radius scales, and normalized box-shadow elevation levels.
- **Component Recipes**: Per-element-class (Button, TextLink, NavItem, Input, Card, Badge) *modal* property values, with colors resolved back to palette-role names so one outlier instance can't skew a recipe.
- **Interaction States**: CSSOM-derived `:hover` / `:focus-visible` deltas attributed to the palette role of each node's own base color — including rules recovered from **cross-origin stylesheets** that `document.styleSheets` refuses to expose.
- **Motion Tokens**: Declared `transition` / `animation` shorthands attributed to the same element classes, keeping only the `@keyframes` definitions actually referenced.
- **AI Visual Interpretation** *(Optional)*: Vision model analysis producing brand identity/personality, aesthetic style tags, target audience framing, and Unsplash `imageMood` keywords, plus color-role refinements.

Every lane stamps a `provenance` (`measured` / `inferred` / `ai`), and any lane with no signal is **omitted from the report rather than synthesized** — measured, never faked.

### 🏗️ Track B: Structure Lane (Layout Architecture)
- **Staged Extraction Pipeline**: `Render` → `Harvest` → `Prune` → `Wrapper Collapse/Squash` → `Repetition Detection` → `Ontological Mapping` → `AI Semantic Refinement` → `Responsive Diff` → `Region Metrics` → `Token Link` (in `both` mode) → `Section Digest` → `Structure Emitter`.
- **Layout Mechanics**: Detailing page layout modes (CSS Grid, Flexbox), max-width constraints, sticky headers, and responsive breakpoint rules.
- **Page Ontology & Regions**: Classifies structural regions (Header, Hero, Navigation, Sidebar, Main Content, Footer, Cards, Grids, Forms, Controls).
- **Modularity & Hierarchies**: Maps nested UI component trees and repeating patterns.
- **Responsive Diff**: Re-harvests at mobile (390×844) and tablet (768×1024) viewports and records per-component layout deltas (e.g. `3col → 1col`) by aligning trees on structural position.
- **Section Digest**: An ordered, per-band summary (`SiteHeader`, each direct child of `MainContent`, `SiteFooter`) joining band metrics, layout, contents, linked tokens, responsive behaviour, and — on the AI path — a one-line intent description per section.
- **Token Link** *(`both` mode only)*: Joins structure components to the design report by bounds overlap, then by ΔE-nearest color / exact spacing-scale match — best-effort, never guessing a token that isn't in the report.

### 📦 Derived Exports

Both are rendered from fields that already exist in the report — they add no schema surface of their own:
- **CSS Variables**: A `:root { … }` fence closing the Markdown body.
- **Tailwind v4 `@theme`**: A standalone stylesheet (colors, `--font-*`, `--text-*` with line-height/weight/letter-spacing, `--spacing`, `--radius-*`, `--shadow-*`, plus a `prefers-color-scheme: dark` override block when `paletteDark` exists), downloadable from the UI.

---

## Input Modes & Reports

- **URL Input**: Executes a headless Chromium browser instance via Playwright to capture computed styles, screenshots, and raw DOM node trees. Supports mode selection: `tokens`, `structure`, or `both`. Cheap follow-up passes reuse the same browser session:
  - a **full-page panorama** — contiguous viewport-tall scroll tiles (capped at 12 viewports) stitched into one seamless PNG, feeding both the palette's area-weight pass and the UI gallery;
  - **responsive harvests** at mobile and tablet widths (DOM + heading sizes only — no screenshot, no style dump);
  - a **dark-scheme capture** via `emulateMedia({ colorScheme: "dark" })`.

  All follow-up passes are best-effort: a failure logs a warning and the field is simply absent.
- **Image Input**: Produces a measured palette + mood report from image pixel analysis and AI vision interpretation. Layout structure from an image is vision-inferred — stamped `fidelity: inferred` — and requires an API key (no DOM to walk, so no measured layout is possible). Accepts one or more images of the same site/design (up to 6); their pixel clusters are merged into a single deduplicated palette rather than producing one report per image.

---

## Interactive UI & API

Distill includes a modern Next.js web application featuring:
- **Interactive Workbench**: URL submission and drag-and-drop multi-image upload with a thumbnail strip (up to 6 images merge into a single palette). Structure from images is vision-inferred and requires an API key.
- **Visual Swatches & Previews**: Live viewport rendering (plus the full-page panorama when one was captured) alongside visual color swatches and OKLCH/WCAG contrast indicators.
- **Tabbed Markdown Output**: Quick tabs for Preview, Design System Tokens, and Structural Architecture. Copy and download act on the *active* tab and are labelled accordingly (*Copy Design System .md* vs. *Copy Structure .md*), so it's never ambiguous which report you're taking. A separate **Download Tailwind @theme** action emits the derived Tailwind v4 stylesheet.
- **AI Lane Status**: The meta panel reports whether the AI lane was `applied` or `skipped (no key)`, and — when skipped — shows an inline hint for configuring a key.
- **REST Endpoint**: `POST /api/analyze` accepts JSON payloads containing `{ url, images, mode, forceRefresh }` (`images` is `{ data, name? }[]`, capped at 6; the legacy single-image `image`/`imageName` fields still work as a one-element alias, merged into `images`) and returns the formatted reports, `viewportShots`, and metadata. Oversized bodies are rejected with `413` before any work starts; a `structure`/`both` request whose structure lane fails returns `structureUnavailableReason` and is deliberately **not** cached, so a retry can succeed.

---

## Requirements

- **Node.js 18+** (CI runs Node 20; developed and tested on Node 20 / 22)
- **Chromium** (Installed automatically by Playwright during `npm install`)
- **An AI provider key** *(Optional)*: Required for the AI lane (`identity`, `imageMood`, semantic structural refinement, and vision-inferred structure from images). Without a key, deterministic token extraction operates fully offline. Two providers are supported behind one seam:
  - **Google Gemini** — `GEMINI_API_KEY`, model pinned to `gemini-3.5-flash`. A free-tier key with no credit card required is available at https://aistudio.google.com/apikey.
  - **OpenRouter** — `OPENROUTER_API_KEY`, model selectable via `OPENROUTER_MODEL` (defaults to `google/gemini-2.5-flash`).

  If **both** keys are set, OpenRouter wins. Note that Gemini-only knobs (thinking-level capping, native JSON-schema enforcement) silently don't apply on the OpenRouter path — JSON mode degrades to `response_format: json_object`.

---

## Setup & Configuration

1. **Install dependencies**:
   ```bash
   npm install
   ```
   *Note: `npm install` automatically triggers `playwright install chromium` via a postinstall hook.*

2. **Configure Environment Variables** *(Optional)*:
   Create a `.env.local` file in the project root to enable the AI interpretation lane. Pick **one** provider:
   ```env
   # .env.local — option A: Google Gemini (free tier, no credit card)
   GEMINI_API_KEY=...

   # option B: OpenRouter (takes precedence if both are set)
   OPENROUTER_API_KEY=...
   OPENROUTER_MODEL=google/gemini-2.5-flash   # optional; this is the default
   ```
   Restart the dev server after editing `.env.local`. With no key set, every AI lane
   degrades gracefully: the measured report is returned untouched, structure falls back
   to heuristic naming, and the UI's meta panel reads `skipped (no key)`.

3. **SSRF guard** *(built in, no configuration required)*:
   Before navigating to any submitted URL, Distill resolves its hostname via DNS and
   rejects the request if the resolved address falls in a loopback, private, or
   otherwise reserved range — `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`,
   `169.254.0.0/16`, `0.0.0.0/8`, `100.64.0.0/10` (CGNAT), `224.0.0.0/4` (multicast),
   `240.0.0.0/4` (reserved/broadcast) for IPv4, and `::1`, `fc00::/7`, `fe80::/10` for IPv6 —
   including IPv4-mapped IPv6 addresses in both their dotted (`::ffff:127.0.0.1`) and
   hex (`::ffff:7f00:1`) spellings. Validation happens
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
docker run -p 3000:3000 -e GEMINI_API_KEY="..." distill
# …or with OpenRouter instead:
docker run -p 3000:3000 -e OPENROUTER_API_KEY="..." distill
```

### Continuous Integration
`.github/workflows/ci.yml` runs on every push and pull request to `main`: Node 20, `npm ci`,
`playwright install --with-deps chromium`, then `typecheck` → `lint` → `eval`. No API key is
present in CI, so anything that only passes with a key set will fail there — which is exactly
why `npm run eval` is fully offline and deterministic.

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
- **Redirect re-validation**: the guard is re-applied to the `Location` target of every `3xx`
  response Chromium receives during navigation, so an open redirect on a public host can't be
  used to bounce the browser into a private range. A failing redirect aborts the render and
  surfaces the same `UnsafeUrlError`.
- **Rate limiting**: `POST /api/analyze` enforces a per-client token bucket (`RATE_LIMIT_*` env
  vars), returning `429` + `Retry-After` once exhausted — see Setup & Configuration §4 above.
  Honestly: the bucket store is in-memory per process, so a horizontally-scaled deployment (N
  instances behind a load balancer) enforces N independent limits, not one global cap. A shared
  store (e.g. Redis) would be required to close that gap; it's not built in.

### Layer 2 — network-restrict the container

The built-in SSRF guard validates the submitted URL and the target of any `3xx` redirect. It does
**not** cover everything else the browser does: once Chromium starts rendering, the page's own
subresource requests (images, scripts, stylesheets, iframes) and JS-initiated `fetch`/`XHR` calls
all ride the browser session without being re-checked. The cross-origin stylesheet refetch in
`styleDump` likewise issues its own requests from the rendered page's context.

The guard is also subject to a TOCTOU / DNS-rebinding race: it resolves the hostname once via
`dns.lookup` and validates *that* result, but Chromium performs its own, independent DNS
resolution when it actually navigates. A rebinding DNS name can answer with a public address at
check time and a private one (e.g. `169.254.169.254`) at navigation time, passing the guard while
still reaching internal targets. No in-process check can close this race — network-level egress
restriction on the container is the real mitigation, for this and for the subresource gap above.

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
| `npm run lint` | Runs ESLint (`eslint .`) code checks. |
| `npm run typecheck` | Validates TypeScript types (`tsc --noEmit`). |
| `npm run eval` | Evaluates extraction heuristics against corpus fixtures (`eval/corpus`) offline without a live browser. |
| `npm run eval:ai` | Performs stability checks on AI interpretation outputs across multiple runs. |
| `npm run eval:capture` | Captures fresh corpus screenshots and DOM/style dumps for evaluation fixtures. |

---

## Testing & Evaluation

There is no unit test framework in this project — `npm run eval` is the correctness gate for
extraction logic. It replays committed captures in `eval/corpus/<slug>/capture.json` against
hand-authored `eval/corpus/<slug>/expected.yaml`, entirely offline: no browser, no network, no
API key. Both lanes are scored — palette (0.5) / typography (0.3) / structure (0.2) for captures
carrying a DOM harvest, palette (0.6) / typography (0.4) for those without — and the run is gated
twice: an absolute per-site floor, plus a rule that no site may regress below `eval/baseline.json`.

Workflow when changing any extractor (`lib/extract/**`, `lib/emit.ts`, `lib/analyze.ts`):

1. Make the change.
2. Run `npm run eval` — it must pass unchanged unless the score change is the *intended* result of your fix.
3. Only then refresh the baseline deliberately: `UPDATE_BASELINE=1 npm run eval`.

New optional lanes are additive by construction: old committed fixtures simply won't populate the
new field, and the code must treat that as "nothing observed" rather than erroring. Verify new
extraction logic against a synthetic local fixture rather than re-capturing the corpus.

