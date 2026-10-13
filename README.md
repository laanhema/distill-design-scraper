# Distill: design system and structure scraper

Distill turns a website URL, or a few dropped-in images, into a Markdown report of the design system and the page structure. A headless browser renders the page, deterministic code mines the CSS tokens and the DOM layout, and an optional AI vision pass adds interpretation on top. The report is YAML frontmatter that a machine can parse, followed by a body that a person can read.

## What it extracts

Distill runs two extraction tracks side by side.

### Track A: the token lane (design system)

- The palette comes from area-weighted pixel analysis (Sharp and Culori) of both the viewport shot and the stitched full-page panorama, together with DOM color clustering, perceptual ΔE merging, OKLCH math and WCAG contrast floors. Roles are assigned in stages: primary, surface, text, border, muted, and the semantic success, warning and danger.
- A dark palette (`paletteDark`) comes from a second render under `prefers-color-scheme: dark`. It is emitted only if the backgrounds actually shift, so a single-scheme site never gets a made-up dark palette.
- Typography covers font families, the size hierarchy, weights, line heights and letter spacing. Mobile heading sizes (`sizePxMobile`) are measured from a real re-harvest at 390px wide.
- Spacing and geometry tokens are the inferred spacing base unit and its multiples, the corner radius scale, and normalized box-shadow elevation levels.
- Component recipes are the modal property values per element class (Button, TextLink, NavItem, Input, Card, Badge), with colors resolved back to palette-role names. One outlier instance can't skew a recipe.
- Interaction states are the `:hover` and `:focus-visible` deltas read from the CSSOM, each attributed to the palette role of the node's own base color. That includes rules recovered from cross-origin stylesheets, which `document.styleSheets` refuses to expose.
- Motion tokens are the declared `transition` and `animation` shorthands, attributed to the same element classes. Only the `@keyframes` definitions that are actually referenced are kept.
- AI visual interpretation is optional. A vision model describes the brand identity and personality, aesthetic style tags, the target audience and Unsplash `imageMood` keywords, and it refines the color roles.

Every lane stamps a `provenance` (`measured`, `inferred` or `ai`), and a lane with no signal is left out of the report rather than synthesized. Measured, never faked.

### Track B: the structure lane (layout architecture)

- The pipeline runs in stages: `Render` → `Harvest` → `Prune` → `Wrapper Collapse/Squash` → `Repetition Detection` → `Ontological Mapping` → `AI Semantic Refinement` → `Responsive Diff` → `Region Metrics` → `Token Link` (in `both` mode) → `Section Digest` → `Structure Emitter`.
- Layout mechanics are recorded: page layout modes (CSS Grid, Flexbox), max-width constraints, sticky headers and responsive breakpoint rules.
- Structural regions are classified as Header, Hero, Navigation, Sidebar, Main Content, Footer, Cards, Grids, Forms or Controls.
- Nested UI component trees and repeating patterns are mapped.
- The responsive diff re-harvests at mobile (390×844) and tablet (768×1024) viewports and records layout deltas per component (for example `3col → 1col`) by aligning the trees on structural position.
- The section digest is an ordered summary per band (`SiteHeader`, each direct child of `MainContent`, `SiteFooter`). It joins band metrics, layout, contents, linked tokens and responsive behaviour, and on the AI path it adds a one-line intent description per section.
- The token link (`both` mode only) joins structure components to the design report by bounds overlap, then by ΔE-nearest color or an exact spacing-scale match. It is best-effort, and it never guesses a token that isn't in the report.

### Derived exports

Both exports are rendered from fields that already exist in the report, so they add no schema surface of their own.

- CSS variables: a `:root { … }` fence that closes the Markdown body.
- Tailwind v4 `@theme`: a standalone stylesheet (colors, `--font-*`, `--text-*` with line-height/weight/letter-spacing, `--spacing`, `--radius-*`, `--shadow-*`, plus a `prefers-color-scheme: dark` override block when `paletteDark` exists), downloadable from the UI.

## Input modes

For a URL, Distill launches headless Chromium through Playwright and captures computed styles, screenshots and the raw DOM node tree. You pick a mode: `tokens`, `structure` or `both`. A few cheap follow-up passes reuse the same browser session:

- a full-page panorama, which is contiguous viewport-tall scroll tiles (capped at 12 viewports) stitched into one seamless PNG. It feeds both the palette's area-weight pass and the UI gallery.
- responsive harvests at mobile and tablet widths (DOM and heading sizes only, with no screenshot and no style dump)
- a dark-scheme capture via `emulateMedia({ colorScheme: "dark" })`

All of the follow-up passes are best-effort. If one fails, a warning is logged and the field is absent.

For images, Distill produces a measured palette and mood report from pixel analysis and AI vision interpretation. Layout structure from an image is inferred by the vision model and stamped `fidelity: inferred`. It needs an API key, because there is no DOM to walk and so no measured layout is possible. You can give it up to 6 images of the same site or design. Their pixel clusters are merged into one deduplicated palette instead of producing one report per image.

## UI and API

The web app is built with Next.js.

- The workbench takes a URL, or a drag-and-drop upload of several images, shown as a thumbnail strip (up to 6 images merge into a single palette). Structure from images is vision-inferred and requires an API key.
- The result shows the live viewport render (plus the full-page panorama when one was captured) next to color swatches with OKLCH and WCAG contrast indicators.
- The Markdown output has tabs for Preview, Design System Tokens and Structural Architecture. The Markdown download acts on the active tab and is labelled to match (Download Design System .md or Download Layout Structure .md), so it's never ambiguous which report you're taking. A separate Download Tailwind @theme action emits the derived Tailwind v4 stylesheet.
- The meta panel reports whether the AI lane was `applied`, `skipped (no key)`, `skipped (not requested)`, or `failed`. When it was skipped for lack of a key, an inline hint shows how to configure one.
- `POST /api/analyze` accepts a JSON payload `{ url, images, mode, forceRefresh }` and returns the formatted reports, `viewportShots` and metadata. `images` is `{ data, name? }[]`, capped at 6. The legacy single-image `image`/`imageName` fields still work as a one-element alias, merged into `images`. Oversized bodies are rejected with `413` before any work starts. A `structure` or `both` request whose structure lane fails returns `structureUnavailableReason` and is deliberately not cached, so a retry can succeed.

## Requirements

- Node.js 18+ (CI runs Node 20; developed and tested on Node 20 and 22)
- Chromium, which Playwright installs automatically during `npm install`
- An AI provider key, which is optional. The AI lane needs one (`identity`, `imageMood`, semantic structural refinement, and vision-inferred structure from images). Without a key, deterministic token extraction works fully offline. Two providers are supported behind one seam:
  - Google Gemini: `GEMINI_API_KEY`, model defaults to `gemini-3.5-flash`, overridable via `GEMINI_MODEL`. A free-tier key that needs no credit card is available at https://aistudio.google.com/apikey.
  - OpenRouter: `OPENROUTER_API_KEY`, model selectable via `OPENROUTER_MODEL` (defaults to `google/gemini-3.5-flash`).

  If both keys are set, OpenRouter wins. Structured output is requested on both paths. OpenRouter sends a real (non-strict) `response_format: json_schema`, but provider support for it varies by the routed model, and Zod is the real shape gate on both paths either way. `thinkingLevel` (thinking-effort capping) remains Gemini-only. A lane that sends one over OpenRouter is logged once per process rather than silently ignored.

## Setup and configuration

1. Install dependencies.
   ```bash
   npm install
   ```
   `npm install` also runs `playwright install chromium` through a postinstall hook.

2. Configure environment variables (optional). Create a `.env.local` file in the project root to enable the AI interpretation lane. Pick one provider:
   ```env
   # .env.local, option A: Google Gemini (free tier, no credit card)
   GEMINI_API_KEY=...
   GEMINI_MODEL=gemini-3.5-flash   # optional; this is the default

   # option B: OpenRouter (takes precedence if both are set)
   OPENROUTER_API_KEY=...
   OPENROUTER_MODEL=google/gemini-3.5-flash   # optional; this is the default
   ```
   Restart the dev server after editing `.env.local`. With no key set, the AI lanes step aside: the measured report is returned untouched, structure falls back to heuristic naming, and the UI's meta panel reads `skipped (no key)`.

3. SSRF guard (built in, nothing to configure). Before navigating to a submitted URL, Distill resolves its hostname via DNS and rejects the request if the resolved address falls in a loopback, private, or otherwise reserved range. For IPv4 that means `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `0.0.0.0/8`, `100.64.0.0/10` (CGNAT), `224.0.0.0/4` (multicast) and `240.0.0.0/4` (reserved/broadcast). For IPv6 it means `::1`, `fc00::/7` and `fe80::/10`, as well as IPv4-mapped IPv6 addresses in both their dotted (`::ffff:127.0.0.1`) and hex (`::ffff:7f00:1`) spellings. Validation happens after DNS resolution, not against the literal hostname string, so a hostname that resolves to a private address is blocked even if it looks public. Non-`http(s)` schemes (`file://`, `ftp://` and so on) are always rejected.

   To permit an internal target such as a staging host, set `SSRF_ALLOWLIST_HOSTS` in `.env.local` to a comma-separated, case-insensitive list of exact hostnames:
   ```env
   # .env.local
   SSRF_ALLOWLIST_HOSTS=staging.example.internal,localhost
   ```

4. Rate limiting (built in; you can tune it or turn it off). `POST /api/analyze` enforces a token bucket per client IP, 20 requests per minute by default, which guards the expensive Chromium render and AI enrichment path. Cache hits don't count against the limit, because they do no render or AI work at all. Only a cache miss or a `forceRefresh` request consumes a token. Once a client's bucket is empty, the route returns `429` with a `Retry-After` header (seconds until the next token refills). The store is bounded to at most `RATE_LIMIT_MAX_BUCKETS` distinct client IDs, so a high-cardinality traffic pattern (spoofed `X-Forwarded-For` headers, say) can't grow the limiter's own memory usage without bound. Tune or disable it via `.env.local`:
   ```env
   # .env.local
   RATE_LIMIT_MAX_REQUESTS=20
   RATE_LIMIT_WINDOW_MS=60000
   RATE_LIMIT_MAX_BUCKETS=50000  # cap on distinct tracked client IDs
   RATE_LIMIT_DISABLED=true   # disable entirely, e.g. for local dev
   ```

## Running the application

### Development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production build

```bash
npm run build
npm run start
```

### Docker

The Dockerfile is multi-stage and already has Playwright's browser dependencies in it:

```bash
docker build -t distill .
docker run -p 3000:3000 -e GEMINI_API_KEY="..." distill
# or with OpenRouter instead:
docker run -p 3000:3000 -e OPENROUTER_API_KEY="..." distill
```

### Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request to `main`: Node 20, `npm ci`, `playwright install --with-deps chromium`, then `typecheck` → `lint` → `build` → `eval`. There is no API key in CI, so anything that only passes with a key set will fail there. That is why `npm run eval` is fully offline and deterministic.

## Deploying publicly: hardening guide

### Threat model

Distill navigates a real headless Chromium browser to arbitrary URLs that users submit. That is the classic SSRF (server-side request forgery) surface. A malicious submission could aim the browser at the operator's internal network, or at a cloud metadata endpoint (`169.254.169.254` on AWS/GCP/Azure) that can leak instance credentials. The defence comes in layers: built-in protections first, network sandboxing second, and auth and limits at the edge third.

### Layer 1: built-in protections

The SSRF guard runs before any navigation. Distill DNS-resolves the submitted hostname and fails closed if the resolved address is loopback, private, or link-local. Step 3 of [Setup and configuration](#setup-and-configuration) has the full range list and the `SSRF_ALLOWLIST_HOSTS` opt-out.

Redirects get the same check. The guard is re-applied to the `Location` target of every `3xx` response that Chromium receives during navigation, and the check is awaited before the render is treated as safe to use: every redirect-validation promise is collected, and `Promise.allSettled` runs before `renderUrl` returns or hands the page to capture. That closes the race a fire-and-forget check would have, where a fast-resolving malicious hostname completes navigation before the check finishes.

It does not prevent the request to the redirect target from being sent. Playwright's `page.route()` interception would run before Chromium issues a request, but we evaluated it and it doesn't see server-side redirect hops at all. Playwright's own docs say route handlers are "only called for the first url if the response is a redirect", and a maintainer confirmed that as intentional for the identical case, so it isn't a bug we could work around. The request to a redirect target is therefore always issued, and its response received, before this check can act. What the awaited check buys is detection that is reliable every time instead of racing navigation.

It doesn't close the underlying TOCTOU either. Our check resolves the hostname once via `dns.lookup`, but Chromium does its own independent DNS resolution when it actually connects, so a DNS-rebinding attacker whose second answer differs from the first can still get the request to a private target. Network-level egress filtering (Layer 2, below) is what actually stops both of those cases. Treat this control as a reliable fast-fail for the common case, not a hard boundary.

Rate limiting is the third built-in. `POST /api/analyze` enforces a per-client token bucket (the `RATE_LIMIT_*` env vars) and returns `429` with `Retry-After` once it is exhausted; see step 4 of [Setup and configuration](#setup-and-configuration). It has a real gap, though. The bucket store is in memory per process, so a horizontally scaled deployment (N instances behind a load balancer) enforces N independent limits, not one global cap. Closing that gap would take a shared store such as Redis, and that isn't built in.

### Layer 2: network-restrict the container

The built-in SSRF guard validates the submitted URL and the target of any `3xx` redirect. It does not cover everything else the browser does. Once Chromium starts rendering, the page's own subresource requests (images, scripts, stylesheets, iframes) and JS-initiated `fetch`/`XHR` calls all ride the browser session without being re-checked. The cross-origin stylesheet refetch in `styleDump` likewise issues its own requests from the rendered page's context.

The guard is also subject to a TOCTOU / DNS-rebinding race. It resolves the hostname once via `dns.lookup` and validates that result, but Chromium performs its own, independent DNS resolution when it actually navigates. A rebinding DNS name can answer with a public address at check time and a private one (`169.254.169.254`, for instance) at navigation time, which passes the guard and still reaches internal targets. No in-process check can close this race. Network-level egress restriction on the container is the real mitigation, for this and for the subresource gap above.

For example, on the Docker host you can block the container's route to cloud metadata and the RFC1918 private ranges through the `DOCKER-USER` iptables chain:

```bash
# Block container egress to cloud metadata + private ranges (DOCKER-USER
# chain is consulted for all traffic leaving Docker networks):
iptables -I DOCKER-USER -d 169.254.0.0/16 -j DROP   # link-local incl. 169.254.169.254 metadata
iptables -I DOCKER-USER -d 10.0.0.0/8     -j DROP
iptables -I DOCKER-USER -d 172.16.0.0/12  -j DROP
iptables -I DOCKER-USER -d 192.168.0.0/16 -j DROP
```

An internal network with an egress proxy, or a cloud-native egress firewall (security groups, VPC firewall rules), gets you the same result. Whichever mechanism you use, any host you add to `SSRF_ALLOWLIST_HOSTS` needs a matching hole in the egress rules. Otherwise the guard lets the request through and the network layer drops it anyway.

### Layer 3: front the API

`POST /api/analyze` is unauthenticated by design (see [Setup and configuration](#setup-and-configuration)). That was an MVP scope decision. Before exposing it publicly, put a reverse proxy (nginx, Caddy, Cloudflare or similar) in front of it to provide TLS and auth (basic auth, an OAuth proxy, or API keys).

The proxy matters for rate limiting too. The limiter trusts the first `X-Forwarded-For` entry (falling back to `X-Real-IP`) as the client identity, so on a directly exposed deployment any client can spoof that header and dodge its own limit. Accurate per-client limits need a trusted reverse proxy that sets or overwrites `X-Forwarded-For` itself and doesn't pass through whatever the client sent.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts the Next.js development server at `http://localhost:3000`. |
| `npm run build` | Builds the Next.js production application. |
| `npm run start` | Runs the production Next.js server. |
| `npm run lint` | Runs ESLint (`eslint .`). |
| `npm run typecheck` | Checks TypeScript types (`tsc --noEmit`). |
| `npm run eval` | Scores the extraction heuristics against the corpus fixtures (`eval/corpus`), offline and without a live browser. |
| `npm run eval:ai` | Checks that AI interpretation outputs are stable across multiple runs. |
| `npm run eval:capture` | Captures fresh corpus screenshots and DOM/style dumps for the evaluation fixtures. |

## Testing and evaluation

This project has no unit test framework. `npm run eval` is the correctness gate for extraction logic. It replays the committed captures in `eval/corpus/<slug>/capture.json` against hand-authored `eval/corpus/<slug>/expected.yaml`, entirely offline: no browser, no network, no API key.

Both lanes are scored. Captures that carry a DOM harvest are weighted palette 0.5, typography 0.3 and structure 0.2. Captures without one are weighted palette 0.6 and typography 0.4. The run is gated twice, by an absolute floor per site and by a rule that no site may regress below `eval/baseline.json`.

When you change an extractor (`lib/extract/**`, `lib/emit.ts`, `lib/analyze.ts`):

1. Make the change.
2. Run `npm run eval`. It must pass unchanged unless the score change is the intended result of your fix.
3. Only then refresh the baseline, deliberately: `UPDATE_BASELINE=1 npm run eval`.

New optional lanes are additive by construction. Old committed fixtures simply won't populate the new field, and the code must treat that as "nothing observed" rather than erroring. Verify new extraction logic against a synthetic local fixture instead of re-capturing the corpus.
