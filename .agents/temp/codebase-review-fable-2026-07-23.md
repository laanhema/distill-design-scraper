# Distill — Full Codebase Review by Fable (2026-07-23)

Full-source review of every file outside `node_modules` (app, lib, eval, config, docs).
Verdict: well-above-average codebase — clear architecture, honest provenance discipline,
strong comments — but with two violations of its own "measured, never faked" principle,
one security-relevant cache bug, a Docker build that cannot succeed, and a structure-lane
eval that silently tests nothing.

Items are grouped by theme; the **Fix priority order** at the bottom is the suggested
work sequence. Checkboxes are for tracking as fixes land.

---

## Security

### S1 — Image cache key only hashes the first 100 chars of each image ⚠️ cross-user leak

- **Where:** `app/api/analyze/route.ts:67`
- **Problem:** `images.map((img) => img.data.slice(0, 100))` feeds the SHA-256 cache key.
  100 base64 chars ≈ 75 bytes; same-dimension PNGs from the same tool often share far more
  identical prefix bytes (signature + IHDR + early IDAT). Two users uploading _different_
  images can collide; the second silently receives the first user's cached report,
  including their screenshot previews (the whole response payload is cached, globally,
  not per client).
- **Note:** CLAUDE.md claims "the cache key hashes all image payloads" — code contradicts docs.
- **Fix:** hash the full payloads (hashing a few MB is trivial next to a Chromium render).
- [ ] fixed

### S2 — Response cache is unbounded → memory exhaustion

- **Where:** `lib/cache.ts`
- **Problem:** entries are only deleted when re-read after expiry; never-again-requested
  keys live forever, and each entry holds multi-MB base64 screenshots. The rate limiter
  next to it was carefully bounded (`RATE_LIMIT_MAX_BUCKETS` + sweep) against exactly this
  class of bug; the cache has no entry cap, no sweep, no size limit. Combined with S5
  (XFF spoof defeats the rate limit when direct-exposed), heap growth is unbounded.
- **Fix:** entry cap + LRU eviction + periodic sweep of expired entries.
- [ ] fixed

### S3 — SSRF guard residual gaps beyond what the README documents

- **Where:** `lib/security/ssrfGuard.ts`, README threat model
- **Gaps:**
  - **TOCTOU / DNS rebinding:** `assertSafeUrl` resolves via `dns.lookup`; Chromium then
    resolves _again_ independently. A short-TTL hostname can answer public to the guard
    and private to the browser. Full fix is network-layer (README Layer 2 already
    prescribes egress firewalling), but the threat-model text should say this explicitly.
  - **Hex-form IPv4-mapped IPv6:** `extractIpv4Mapped` (`ssrfGuard.ts:88`) only matches
    the dotted-quad form. `::ffff:7f00:1` passes `ipv6ToBigInt`, isn't in fc00::/7 or
    fe80::/10, and is allowed.
  - **Missing ranges:** `100.64.0.0/10` (CGNAT — used by some cloud-internal services),
    multicast/reserved space.
- [ ] hex-mapped form handled
- [ ] extra ranges added
- [ ] README threat model mentions rebinding

### S4 — CPU exhaustion via image uploads

- **Where:** `lib/extract/imagePalette.ts:57-72` (`quantizeImage`)
- **Problem:** per-pixel CIEDE2000 against a _growing, unbounded_ cluster list. A
  photographic/gradient-noise image produces thousands of clusters (nothing merges at
  ΔE ≤ 2.5): 320×320 ≈ 102k pixels × thousands of clusters × expensive Lab conversion,
  per image, up to 6 images per request. Cheap way to pin a core inside the 60s route.
- **Reference pattern:** `lib/extract/palette.ts` pixel pass deliberately uses squared-Lab
  distance against a _small fixed_ canonical set.
- **Fix:** coarse-bucket quantize first (e.g. 4-bit/channel histogram, as `palette.ts`'s
  `farBuckets` already does), then ΔE-merge the buckets.
- **Related:** no request body size limit on the route; `sharp` receives
  attacker-controlled buffers before any dimension check.
- [ ] quantization rewritten
- [ ] body size limit added

### S5 — Rate limiter identity spoofable (documented) + shared fallback bucket

- **Where:** `lib/security/rateLimiter.ts:97-108`, README Layer 3
- **Status:** direct-exposed, a random `X-Forwarded-For` per request = fresh 20-token
  bucket = full bypass. README documents this and prescribes a trusted proxy —
  acceptable MVP decision, no code change required unless scope changes. Also: all
  unproxied clients share the single `"unknown"` bucket (one local user can starve others).
- [ ] acknowledged / revisit if auth scope changes

### S6 — Minor security notes

- Prompt injection: page-controlled text snippets flow into the structure-labelling
  prompt (`lib/extract/structure/structureAI.ts`) and page pixels into vision calls.
  Output is Zod/schema-constrained so impact is limited to mislabeled report content —
  acceptable, but worth a code comment.
- Raw `err.message` from the render path returned to clients (`route.ts:177`) —
  mild internal-detail leak.
- No XSS path found: markdown rendered in `<pre>`, hexes schema-validated,
  no `dangerouslySetInnerHTML`.
- [ ] comments added / error message sanitized

---

## "Measured, never faked" violations

### M1 — `imagePalette.ts` fabricates semantic swatches

- **Where:** `lib/extract/imagePalette.ts:197-209`
- **Problem:** the "fill remaining required roles" loop iterates **all** of `COLOR_ROLES`
  — including `on-primary`, `success`, `warning`, `danger`. Every image report claims
  semantic state colors assigned from arbitrary leftover clusters (fallback `clusters[0]`
  even duplicates hexes), stamped `provenance: "measured"`. Directly contradicts the
  schema comment ("assigned only on strong evidence … never synthesized").
- **Fix:** restrict the loop to at most `muted`/`border` (as its own comment says), or
  better, omit unfilled roles entirely.
- [ ] fixed

### M2 — `tokens.ts` ships invented default scales stamped `measured`

- **Where:** `lib/extract/tokens.ts:96` (spacing `[4, 8, 16, 24, 32, 48, 64]`),
  `lib/extract/tokens.ts:143` (radius `["4px","8px","16px","9999px"]`)
- **Problem:** hardcoded guesses emitted with `provenance: "measured"` when nothing was
  observed. Per the project contract these lanes should be omitted, not defaulted.
- **Fix:** return `undefined` (make `extractSpacing`/`extractRadius` optional-returning,
  plumb through `extractTokens` → `buildReport`, which already handles optional lanes).
- [ ] fixed

---

## Correctness bugs

### C1 — Eval harness never tests the structure lane (doubly) 🔴

- **Where:** `eval/capture.ts:44-58`, `eval/run.ts:57-66`, `eval/scoreStructure.ts:23-30`
- **Problems (layered):**
  1. `capture.ts` builds its `Capture` without `rawHarvestNode` (field exists on
     `captured` but isn't copied) → `run.ts`'s `if (capture.rawHarvestNode)` never fires.
     Confirmed: neither committed `capture.json` has the key.
  2. Even if it fired, `scoreStructure(structReport)` is called with no `expected` spec
     → constant 1.0.
  3. Latent: once fixed, `extractStructureFromCapture` → `runStructureAILabeller` makes
     **live Anthropic calls** whenever `ANTHROPIC_API_KEY` is in the env — the "offline"
     gate becomes nondeterministic. Eval path must force the heuristic fallback.
- **Note:** CLAUDE.md's claim that eval replays structure extraction offline is currently false.
- [ ] rawHarvestNode written by eval:capture (captures re-captured + committed)
- [ ] expected structure specs authored and passed to scoreStructure
- [ ] AI labeller forced off in eval path

### C2 — `npm run lint` is broken 🔴

- **Where:** repo root (no ESLint config exists anywhere)
- **Problem:** `next lint` drops into an interactive "How would you like to configure
  ESLint?" prompt. CLAUDE.md and the git policy mandate lint after every change —
  currently impossible non-interactively; would hang CI. (`npm run typecheck` passes.)
- **Fix:** add an ESLint config (and consider migrating off deprecated `next lint`
  per its own warning, before Next 16).
- [ ] fixed

### C3 — Dockerfile cannot build 🔴

- **Where:** `Dockerfile`
- **Problems:**
  1. `COPY --from=base /app/public ./public` — **no `public/` directory exists** → build fails.
  2. Base image `mcr.microsoft.com/playwright/node:20-jammy` is unpinned while
     `package.json` floats `playwright: ^1.50.0` (1.61.1 installed). Runner relies on the
     image's preinstalled browsers → eventual version mismatch → "browser not found" at
     launch. Pin the image tag to the matching Playwright version.
  3. Runner stage omits `next.config.mjs`.
  4. Runs as root (headless Chromium under root typically needs sandbox workarounds);
     consider `USER pwuser`.
- [ ] public copy removed (or dir added)
- [ ] image pinned to Playwright version
- [ ] next.config.mjs copied
- [ ] non-root user

### C4 — `imagePalette.ts` crashes on degenerate input

- **Where:** `lib/extract/imagePalette.ts:111` (`bgCluster.hex` with empty `clusters`)
- **Problem:** fully transparent / unparseable-pixel image → zero clusters →
  `bgCluster` undefined → unhandled TypeError → 502 from a single upload.
- **Fix:** guard the empty-cluster case (return an honest error or empty palette).
- [ ] fixed

### C5 — Frontend multi-file order race

- **Where:** `app/page.tsx:58-70` (`handleFilesSelect`), pairing used at `:100`, `:143`, `removeImage`
- **Problem:** previews append in `FileReader.onload` completion order, not selection
  order → index `i` pairing of `imagePreviews`↔`selectedFiles` can mismatch: wrong names
  sent to API, `removeImage(i)` deletes mismatched pairs.
- **Fix:** read sequentially, or keep `{file, preview}` pairs in one state array.
- **Also minor:** after a new analysis with no structure report, active tab can stay
  `"structure"` showing an empty pane; "Copy .md" then copies `""`. Reset tab on analyze.
- [ ] file/preview pairing fixed
- [ ] tab reset fixed

### C6 — URL path caches transient structure failures

- **Where:** `app/api/analyze/route.ts:139-170`
- **Problem:** image path deliberately skips caching when structure failed (comment cites
  review finding #3), but the URL path caches `structureReport: null` after a transient
  structure exception for the full 10-min TTL — the exact behavior the image-path fix
  addressed.
- **Fix:** mirror the image-path behavior (skip `setCache` when structure was requested
  but errored).
- [ ] fixed

### C7 — Small drifts / dead code

- `lib/extract/structure/repetition.ts:77-80` — `isNearMatch` comment promises "80% of
  child tags match" but only base tags are compared; `matchedVariance` doesn't affect
  control flow (child pushed regardless), so `varianceNote` tagging is looser than intended.
- `lib/interpret.ts` `OUTPUT_SCHEMA` restricts roles to 7 values; Zod mirror
  (`aiResponseSchema` via `colorRoleSchema`) accepts all 11 — the "mirrors" have drifted.
- `route.ts:37` `stripDataUrlPrefix` won't strip `data:image/svg+xml;base64,` (the `+`).
- `lib/aiLane.ts` claims one shared retry policy, but `structureAI.ts` doesn't use `retryOnce`.
- `lib/extract/structure/harvester.ts:90` — `[..., "svg"].includes(tag) && tag !== "svg"`
  is a confusing no-op contradiction; also `harvestDomTree` has **no node cap** (unlike
  `styleDump`'s `NODE_CAP = 5000`) → unbounded JSON payload on pathological DOMs.
- `lib/extract/structureFromImage.ts:131` — module-level mutable `idCounter` (minor smell).
- [ ] addressed

---

## Documentation drift

### D1 — README contradicts the code

- **Where:** `README.md`
- Says image input is "**Palette & Mood only** — no layout-structure report for image
  input, regardless of mode" — but `structureFromImages` produces exactly that, and the
  UI advertises it. (README lines 28 and 35 also contradict each other.)
- Promises UI "mode toggles" and "forced cache refresh controls" — `page.tsx` hardcodes
  `mode: "both"` and never sends `forceRefresh`.
- Claims APCA contrast and Container Query detection — code uses WCAG only, never
  inspects container queries.
- [ ] README synced with reality

### D2 — CLAUDE.md inaccuracies (from findings above)

- "Cache key hashes all image payloads" → false (S1).
- "the eval harness replays structure extraction offline too" → false (C1).
- [ ] updated alongside the fixes

---

## Worth keeping (don't break these)

- `extractFromCapture` really is network-free — the measured/AI lane split is enforced
  where it matters; keep it that way.
- Zod gates every model output; provenance is stamped server-side, never trusted from
  the model.
- Shared helpers (`roleMatch`, `styleMatch`, `aiLane`) sit exactly where duplication
  would otherwise creep in.
- Palette pipeline's staged scoring with ordering-dependent guardrails
  (semantic-before-generic `pick()` order) is well-reasoned — preserve the ordering.
- SSRF guard validates _resolved IPs_, fails closed; rate limiter store is bounded
  against spoofed-header growth; README hardening guide is honest about its limits.

---

## Fix priority order

1. **S1** — hash full image payloads in the cache key (small change, real cross-user leak)
2. **C3** — fix the Dockerfile (`public/` copy, pin Playwright image)
3. **M1 + M2** — remove fabricated semantic roles (`imagePalette.ts`) and fabricated
   default scales (`tokens.ts`)
4. **S2 + S4 (body limit)** — bound the response cache; cap request body size
5. **C1** — restore the structure lane to the eval harness (rawHarvestNode + expected
   specs + heuristic-only naming offline)
6. **C2** — add an ESLint config so `npm run lint` works at all
7. **S4** — rewrite `quantizeImage` to bucket-quantize before ΔE-merging
8. **D1/D2** — sync README and CLAUDE.md with reality
9. Remaining: C4, C5, C6, C7, S3, S6
