# Stories — Codebase Review Remediation (Fable, 2026-07-23)

Source: `.agents/temp/codebase-review-fable-2026-07-23.md` (full-codebase review).
Last Updated: 2026-10-14
Stories are ordered by the review's **Fix priority order**. IDs continue the `DIST-` sequence
from `phase-4-hardening-stories.md` (last used: DIST-006).

Note: review finding **S5** (rate-limiter identity spoofable when direct-exposed) is
deliberately **not** a story — the review accepts the documented trusted-proxy MVP posture
and asks only to revisit if auth scope changes.

---

## Status

All 16 stories are done: each issue (#13–#28) is closed as completed and each pull request is merged into `main`. No issue or pull request of this file is still open.

| Story | Issue | Pull request | Phase | Status | Acceptance criteria ticked |
| --- | --- | --- | --- | --- | --- |
| DIST-007 Hash full image payloads | #13 | #41 | 1 | done | 4 of 4 |
| DIST-008 Reliable Dockerfile | #14 | #42 | 1 | done | 4 of 4 |
| DIST-009 No fabricated image swatches | #15 | #43 | 1 | done | 4 of 4 |
| DIST-010 Omit unobserved spacing/radius | #16 | #44 | 1 | done | 4 of 4 |
| DIST-011 Bound the response cache | #17 | #45 | 2 | done | 4 of 4 |
| DIST-012 Request body size limit | #18 | #46 | 2 | done | 3 of 3 |
| DIST-013 Structure lane in eval | #19 | #66 | 2 | done | 5 of 5 |
| DIST-014 Flat ESLint config | #20 | #47 | 2 | done | 3 of 3 |
| DIST-015 Bucket-quantize images | #21 | #48 | 3 | done | 1 of 3 |
| DIST-016 Degenerate image input | #22 | #49 | 3 | done | 3 of 3 |
| DIST-017 Multi-file race + stale tab | #23 | #50 | 3 | done | 3 of 3 |
| DIST-018 No caching of structure failures | #24 | #51 | 3 | done | 3 of 3 |
| DIST-019 Residual SSRF gaps | #25 | #52 | 3 | done | 4 of 4 |
| DIST-020 README/CLAUDE.md sync | #26 | #67 | 3 | done | 4 of 4 |
| DIST-021 Sanitize errors, injection notes | #27 | #53 | 4 | done | 3 of 3 |
| DIST-022 Small drifts and dead code | #28 | #54 | 4 | done | 7 of 7 |

The criteria were checked on 2026-10-14 against the code at `4291324`, with offline `npm run typecheck`, `npm run lint` and `npm run eval` runs (all passed); the product was not run and no Docker image was built. A criterion that needs a run (a Docker build, a timing, a live render) is ticked on the validation section of the story's implementation report in `.agents/reports/`, where the code still holds the behaviour. A ticked box means the code satisfies the criterion now, an unticked box carries a note with what is missing, and an As Built section records where the result differs from the text or where it lives. Plans are in `.agents/plans/completed/`, reviews in `.agents/reviews/`.

### Open Items Without a Story

**Open GitHub issues that no story names**

- #156 [TODO-1] Handle inaccessible URLs, bot-blocks, and view-obscuring overlays gracefully
- #158 [TODO-3] Investigate secure local distribution and sharing models (Docker / BYOK)
- #166 [TODO-1] Spike: bypass or detect view-obscuring overlays, cookie walls, and paywalls before capture

## [DIST-007] Hash full image payloads in the analyze cache key

**Type**: Bug
**GitHub Label**: bug
**Priority**: High
**Complexity**: Small
**Phase**: 1 (review fix-priority #1)
**Labels**: `security`, `api`
**Review ref**: S1
**Status**: done — issue closed, PR #41 merged

### Description

As an image-upload user, I want the response cache keyed on my complete image payloads, so that another user's visually similar upload can never collide with mine and hand them my cached report (including my screenshot previews).

### Acceptance Criteria

- [x] Given two different images sharing the first 100 base64 chars (identical PNG signature/IHDR prefix), when each is analyzed, then they produce distinct cache keys and distinct responses.
- [x] Given the same image uploaded twice, when the second request arrives within TTL, then the cached response is still returned (caching behavior preserved).
- [x] Given the fix, when reading `app/api/analyze/route.ts`, then no `.slice(0, 100)` (or any prefix truncation) feeds the hash — full payloads are hashed.
- [x] `npm run typecheck` and `npm run eval` pass unchanged.

### Technical Notes

- `app/api/analyze/route.ts:67` — replace `images.map((img) => img.data.slice(0, 100))` with full `img.data` into the SHA-256 input. Hashing a few MB is trivial next to a Chromium render.
- CLAUDE.md already claims full payloads are hashed — after this fix the docs become true (see DIST-020).

### As Built

- The cache key in `app/api/analyze/route.ts` is `createCacheKey` over `url`, every full `img.data` joined by `|`, and `mode`; no prefix truncation remains.

### Dependencies

- Blocked by: none
- Blocks: DIST-020 (doc sync references this fix)

---

## [DIST-008] Make the Dockerfile build and run reliably

**Type**: Bug
**GitHub Label**: bug
**Priority**: High
**Complexity**: Medium
**Phase**: 1 (review fix-priority #2)
**Labels**: `infra`, `docker`
**Review ref**: C3
**Status**: done — issue closed, PR #42 merged

### Description

As a deployer, I want `docker build` to succeed and the container to launch Chromium reliably, so that the documented container deployment path actually works.

### Acceptance Criteria

- [x] Given the repo at HEAD, when running `docker build .`, then the build completes (the `COPY --from=base /app/public ./public` failure is gone — line removed or `public/` added).
- [x] Given the built image, when the container starts and analyzes a URL, then Playwright finds a matching browser (base image tag pinned to the installed Playwright version, e.g. `mcr.microsoft.com/playwright/node:v1.61.1-jammy` matching `package.json`).
- [x] Given the runner stage, when the app boots, then `next.config.mjs` is present in the image.
- [x] Given the runner stage, when inspecting the running container, then it runs as a non-root user (`USER pwuser` or equivalent) and headless Chromium still launches.

### Technical Notes

- `Dockerfile` — four distinct problems; fix all in one pass since they're all in the same short file.
- Pinning: keep the image tag and the `playwright` version in `package.json` in lockstep; add a comment in the Dockerfile stating the invariant.
- Verify with an actual `docker build` + smoke run, not just inspection.

### As Built

- Both stages use `mcr.microsoft.com/playwright:v1.61.1-jammy` (not the `playwright/node` tag the criterion names), matching `"playwright": "1.61.1"` in `package.json`, with a comment stating the lockstep rule.
- The runner copies `node_modules`, `package.json`, `.next` and `next.config.mjs` owned by `pwuser` and runs as `USER pwuser`; there is no `public/` copy.
- The build and in-container URL analysis rest on the docker smoke run recorded in `.agents/reports/dockerfile-build-run-reliability-report.md`; this run did not rebuild the image.

### Dependencies

- Blocked by: none
- Blocks: none

---

## [DIST-009] Stop fabricating semantic swatches in the image palette

**Type**: Bug
**GitHub Label**: bug
**Priority**: High
**Complexity**: Small
**Phase**: 1 (review fix-priority #3)
**Labels**: `extraction`, `provenance`
**Review ref**: M1
**Status**: done — issue closed, PR #43 merged

### Description

As a report consumer, I want image-input palettes to only claim roles with real evidence, so that `success`/`warning`/`danger`/`on-primary` swatches stamped `provenance: "measured"` are never invented from arbitrary leftover clusters.

### Acceptance Criteria

- [x] Given an uploaded image with no plausible semantic-state colors, when the report is generated, then `success`/`warning`/`danger`/`on-primary` are omitted from the palette (not filled from leftover clusters, not duplicated from `clusters[0]`).
- [x] Given the fill loop in `imagePalette.ts`, when reading the code, then it iterates at most `muted`/`border` (per its own comment) — or omits unfilled roles entirely.
- [x] Given an omitted role, when the Markdown body renders, then the corresponding lines are absent rather than empty (existing optional-field contract).
- [x] `npm run eval` passes unchanged (image lane isn't in the eval corpus, but the gate must not regress).

### Technical Notes

- `lib/extract/imagePalette.ts:197-209` — restrict the "fill remaining required roles" loop; the review recommends omitting unfilled roles outright as the better option.
- This is a direct "measured, never faked" violation — the project's core invariant (CLAUDE.md).
- Coordinate with DIST-015/DIST-016, which touch the same file.

### As Built

- `extractImagePalette` in `lib/extract/imagePalette.ts` has no fill loop: any role not assigned from cluster evidence (`muted`, `border`, `on-primary`, `success`, `warning`, `danger`) is omitted.

### Dependencies

- Blocked by: none
- Blocks: none

---

## [DIST-010] Omit spacing/radius scales when nothing was observed

**Type**: Bug
**GitHub Label**: bug
**Priority**: High
**Complexity**: Small
**Phase**: 1 (review fix-priority #3)
**Labels**: `extraction`, `provenance`
**Review ref**: M2
**Status**: done — issue closed, PR #44 merged

### Description

As a report consumer, I want spacing and radius sections to appear only when actually measured, so that hardcoded default scales (`[4, 8, 16, 24, 32, 48, 64]`, `["4px","8px","16px","9999px"]`) are never emitted with `provenance: "measured"`.

### Acceptance Criteria

- [x] Given a capture with no observable spacing values, when the report is built, then the `spacing` field is absent from frontmatter and the body section is not rendered.
- [x] Given a capture with no observable radius values, when the report is built, then the `radius` field is likewise absent.
- [x] Given a normal capture (eval corpus), when `npm run eval` runs, then scores are unchanged — real measurements still flow through.
- [x] `npm run typecheck` passes with `extractSpacing`/`extractRadius` returning optional values plumbed through `extractTokens` → `buildReport`.

### Technical Notes

- `lib/extract/tokens.ts:96` (spacing default) and `:143` (radius default) — return `undefined` instead.
- `buildReport` already handles optional lanes; the `render*` functions in `lib/emit.ts` are already conditional — this should be plumbing only.

### As Built

- `lib/extract/tokens.ts` returns `undefined` for an empty spacing or radius scale, and `buildReport` in `lib/analyze.ts` passes both through as optional lanes.

### Dependencies

- Blocked by: none
- Blocks: none

---

## [DIST-011] Bound the response cache (entry cap + LRU + sweep)

**Type**: Technical
**GitHub Label**: technical
**Priority**: High
**Complexity**: Medium
**Phase**: 2 (review fix-priority #4)
**Labels**: `security`, `api`
**Review ref**: S2
**Status**: done — issue closed, PR #45 merged

### Description

As an operator, I want the response cache bounded like the rate limiter already is, so that never-again-requested entries holding multi-MB base64 screenshots cannot grow the heap without limit.

### Acceptance Criteria

- [x] Given more insertions than the entry cap, when a new entry is added, then the least-recently-used entry is evicted and total entries never exceed the cap.
- [x] Given expired entries that are never re-read, when the periodic sweep runs, then they are removed without requiring a read.
- [x] Given normal cache hits within TTL, when the same key is requested, then behavior is unchanged (hit returns cached response, refreshes recency).
- [x] Cache limits are named constants with a brief comment, mirroring the `RATE_LIMIT_MAX_BUCKETS` pattern.

### Technical Notes

- `lib/cache.ts` — model the fix on `lib/security/rateLimiter.ts`, which was already bounded against exactly this class of bug (cap + sweep).
- A `Map` gives insertion-order iteration; delete+re-set on read gives cheap LRU recency.

### As Built

- `lib/cache.ts` caps entries at `DEFAULT_MAX_ENTRIES = 50` (override `CACHE_MAX_ENTRIES`, read through `parsePositiveInteger` in `lib/env.ts`), sweeps expired entries first, then evicts the least-recently-used.
- The periodic sweep runs every `SWEEP_INTERVAL_MS = 60_000`, is started lazily and is `unref()`d; the TTL is `DEFAULT_TTL_MS` (10 minutes).

### Dependencies

- Blocked by: none
- Blocks: none

---

## [DIST-012] Enforce a request body size limit on `/api/analyze`

**Type**: Technical
**GitHub Label**: technical
**Priority**: High
**Complexity**: Small
**Phase**: 2 (review fix-priority #4)
**Labels**: `security`, `api`
**Review ref**: S4 (body-limit half)
**Status**: done — issue closed, PR #46 merged

### Description

As an operator, I want oversized request bodies rejected before any processing, so that attacker-controlled buffers never reach `sharp` or the palette pipeline unchecked.

### Acceptance Criteria

- [x] Given a request body over the limit, when it hits `/api/analyze`, then the route responds 413 (or equivalent 4xx) without invoking `sharp` or Playwright.
- [x] Given a legitimate 6-image upload within the limit, when analyzed, then behavior is unchanged.
- [x] The limit is a named constant sized from `MAX_IMAGES` × a sane per-image ceiling, with a comment stating the rationale.

### Technical Notes

- `app/api/analyze/route.ts` — check `Content-Length` and/or measure the parsed payload before decoding; Next.js route handlers don't apply the old `bodyParser` size config, so enforce explicitly.
- Complements DIST-015 (CPU exhaustion) — this bounds input size, that bounds per-pixel work.

### As Built

- `MAX_REQUEST_BODY_BYTES = MAX_IMAGES * MAX_IMAGE_PAYLOAD_BYTES` (6 × 8 MB) in `app/api/analyze/route.ts`; `readBodyWithinLimit` rejects on a declared `Content-Length` or while streaming, and cancels the stream on breach.
- The 413 comes before `JSON.parse`, so neither `sharp` nor Playwright runs.

### Dependencies

- Blocked by: none
- Blocks: none

---

## [DIST-013] Restore the structure lane to the eval harness

**Type**: Technical
**GitHub Label**: technical
**Priority**: High
**Complexity**: Large
**Phase**: 2 (review fix-priority #5)
**Labels**: `eval`, `structure-lane`
**Review ref**: C1
**Status**: done — issue closed, PR #66 merged

### Description

As a maintainer, I want `npm run eval` to actually exercise and score the structure lane offline, so that structure-extraction regressions are caught by the gate instead of silently scoring a constant 1.0 on a lane that never runs.

### Acceptance Criteria

- [x] Given `npm run eval:capture`, when captures are re-taken, then each `eval/corpus/<slug>/capture.json` contains `rawHarvestNode` (copied through in `eval/capture.ts`), and the refreshed captures are committed.
- [x] Given hand-authored expected structure specs per corpus site, when `npm run eval` runs, then `scoreStructure` receives an `expected` spec and produces a real (non-constant) score that feeds the site gate.
- [x] Given `ANTHROPIC_API_KEY` set in the environment, when `npm run eval` runs, then **no network call is made** — the structure pipeline's AI naming stage is forced to the heuristic fallback in the eval path, and repeated runs are deterministic.
- [x] Given a deliberate structure-extractor break (manual spot check), when `npm run eval` runs, then the score drops below baseline and the gate fails.
- [x] `eval/baseline.json` refreshed deliberately via `UPDATE_BASELINE=1 npm run eval` once scores are real.

### Technical Notes

- Three layered fixes: `eval/capture.ts:44-58` (copy `rawHarvestNode` into the written capture), `eval/run.ts:57-66` (pass expected spec), `eval/scoreStructure.ts:23-30` (stop returning 1.0 with no spec — score against it).
- AI-off switch: `extractStructureFromCapture` → Stage 7 labeller; add an explicit option (or env guard in the eval runner) forcing the heuristic path — don't rely on unsetting the key in the environment.
- This is the one sanctioned reason to touch committed `capture.json` files: the capture *shape* changes (per CLAUDE.md, same precedent as `responsiveHarvests`/`darkCapture`).
- Authoring expected specs for both corpus sites is the bulk of the work — budget accordingly.

### As Built

- All three committed captures (`clean-light`, `dark-mode`, `adversarial-shell`) carry `rawHarvestNode`, and `eval/scoreStructure.ts` scores them against the `structure` block of each `expected.yaml`.
- The AI-off switch is the `forceHeuristicNaming: true` option that `eval/run.ts` passes; the key it guards against is now `OPENROUTER_API_KEY`, since the Anthropic key no longer exists.
- A structure-lane exception scores `0`, and `combinedScore` weights palette 0.5 / typography 0.3 / structure 0.2.
- The deliberate-break check rests on the run recorded in `.agents/reports/dist-013-restore-structure-eval-lane-report.md` (combined 100% → 90%).

### Dependencies

- Blocked by: none
- Blocks: DIST-020 (doc sync references this fix)

---

## [DIST-014] Add a working ESLint config so `npm run lint` runs non-interactively

**Type**: Technical
**GitHub Label**: technical
**Priority**: High
**Complexity**: Small
**Phase**: 2 (review fix-priority #6)
**Labels**: `tooling`, `ci`
**Review ref**: C2
**Status**: done — issue closed, PR #47 merged

### Description

As a contributor, I want `npm run lint` to run to completion without prompting, so that the lint gate mandated by CLAUDE.md and the git policy is actually usable locally and in CI.

### Acceptance Criteria

- [x] Given a fresh checkout, when running `npm run lint` non-interactively, then it completes with a pass/fail result and no interactive prompt.
- [x] Given the current codebase, when lint runs, then it passes (fix or explicitly disable rules that fire on existing code — no drive-by refactors).
- [x] The config uses Next's recommended preset (`next/core-web-vitals` or the flat-config equivalent), and the deprecated `next lint` wrapper is migrated per its own deprecation warning if straightforward.

### Technical Notes

- No ESLint config exists anywhere in the repo — `next lint` drops into its setup wizard.
- Next 15 deprecates `next lint`; prefer invoking `eslint` directly with `eslint-config-next` in a flat config, keeping the `npm run lint` script name stable.

### As Built

- `eslint.config.mjs` is a flat config that extends `next/core-web-vitals` and `next/typescript` through `FlatCompat`; `npm run lint` runs `eslint .` and passed on 2026-10-14.

### Dependencies

- Blocked by: none
- Blocks: none

---

## [DIST-015] Bucket-quantize images before ΔE cluster merging

**Type**: Enhancement
**GitHub Label**: enhancement
**Priority**: Medium
**Complexity**: Medium
**Phase**: 3 (review fix-priority #7)
**Labels**: `security`, `extraction`, `performance`
**Review ref**: S4 (quantization half)
**Status**: done — issue closed, PR #48 merged. 2 criteria are only partly verified.

### Description

As an operator, I want image quantization to run in bounded time regardless of image content, so that a photographic or gradient-noise upload cannot pin a CPU core for the whole 60s route budget.

### Acceptance Criteria

- [x] Given a worst-case noise/gradient image (every pixel distinct), when `quantizeImage` runs, then work is bounded by the fixed bucket count (e.g. 4-bit/channel histogram = 4096 buckets), not by an unbounded growing cluster list.
- [ ] Given the existing eval-adjacent behavior, when a normal screenshot is quantized, then the resulting role assignment is materially unchanged (spot-check palettes on 2–3 real screenshots before/after).
  - *Partly verified:* the recorded spot-check covered the two committed corpus screenshots and one synthetic image (the corpus holds no third real one); `clean-light` kept its roles, but `dark-mode` swapped `primary` and `accent` between its two near-equal-chroma colors.
- [ ] Given 6 max-size images in one request, when analyzed, then quantization completes in a small fraction of the route timeout.
  - *Partly verified:* the recorded timing used six 320×320 noise images (370 ms in all), not six images at the 8 MB payload cap.

### Technical Notes

- `lib/extract/imagePalette.ts:57-72` — coarse-bucket first (as `palette.ts`'s `farBuckets` already does), then ΔE-merge the bucket centroids. The reference pattern is in the same repo: `lib/extract/palette.ts` uses squared-Lab distance against a small fixed set.
- Same file as DIST-009/DIST-016 — sequence these to avoid conflicts (suggested order: 009 → 016 → 015, or land 015 last since it rewrites the function the others touch).

### As Built

- `quantizeImage` in `lib/extract/imagePalette.ts` builds a 4-bit-per-channel histogram (at most 4096 buckets) and then ΔE-merges the bucket centroids, largest first.
- The timings and spot-check are in `.agents/reports/bucket-quantize-image-palette-report.md` (a 320×320 gradient went from 28,269 ms to 69 ms).

### Dependencies

- Blocked by: none (soft: coordinate with DIST-009, DIST-016)
- Blocks: none

---

## [DIST-016] Handle zero-cluster (degenerate) image input without crashing

**Type**: Bug
**GitHub Label**: bug
**Priority**: Medium
**Complexity**: Small
**Phase**: 3
**Labels**: `extraction`, `api`
**Review ref**: C4
**Status**: done — issue closed, PR #49 merged

### Description

As an image-upload user, I want a fully transparent or unparseable image to produce an honest error or empty palette, so that a single bad upload doesn't 502 the whole request with an unhandled TypeError.

### Acceptance Criteria

- [x] Given a fully transparent PNG, when analyzed, then the route returns a clean, actionable 4xx/valid-report response — no unhandled `TypeError` on `bgCluster.hex`, no 502.
- [x] Given a mixed upload (one degenerate image + valid images), when analyzed, then the valid images still produce a palette (degenerate one skipped or reported).
- [x] The empty-cluster guard omits palette fields rather than inventing them (provenance contract).

### Technical Notes

- `lib/extract/imagePalette.ts:111` — `clusters[0]` is undefined when quantization yields nothing; guard before use.
- If DIST-015 lands first its rewrite must include this guard; whichever ships first closes the crash.

### As Built

- `extractImagePalette` skips an unreadable or empty image with a `console.warn` and throws `DegenerateImageError` only when no image yields a cluster; the route maps that to a 422 with an actionable message.

### Dependencies

- Blocked by: none (soft: coordinate with DIST-009, DIST-015)
- Blocks: none

---

## [DIST-017] Fix multi-file selection race and stale structure tab in the UI

**Type**: Bug
**GitHub Label**: bug
**Priority**: Medium
**Complexity**: Small
**Phase**: 3
**Labels**: `frontend`
**Review ref**: C5
**Status**: done — issue closed, PR #50 merged

### Description

As a multi-image user, I want previews, filenames, and remove buttons to always refer to the same file, so that out-of-order `FileReader` completions can't send wrong names to the API or delete the wrong image.

### Acceptance Criteria

- [x] Given several files selected at once (varying sizes so read-completion order differs from selection order), when previews render, then each preview, its displayed name, and its `removeImage` target refer to the same underlying file.
- [x] Given the fix, when reading `page.tsx`, then file and preview live in one state entry (`{file, preview}[]`) or reads are strictly sequential — no parallel-index pairing across two arrays.
- [x] Given a new analysis that returns no structure report, when results render, then the active tab resets away from `"structure"` (no empty pane; "Copy .md" never copies `""`).

### Technical Notes

- `app/page.tsx:58-70` (`handleFilesSelect`); pairing consumed at `:100`, `:143`, and in `removeImage`.
- The single-state-array approach also simplifies `removeImage` to one splice.

### As Built

- `app/page.tsx` holds uploads as one `{ file, preview }[]` array, so a preview, its name and its remove target cannot drift apart.
- When a response has no `structureReport`, the tab moves from `structure` to `preview`; the "Copy .md" button no longer exists (#160), and downloads act on the active tab.

### Dependencies

- Blocked by: none
- Blocks: none

---

## [DIST-018] Stop caching transient structure failures on the URL path

**Type**: Bug
**GitHub Label**: bug
**Priority**: Medium
**Complexity**: Small
**Phase**: 3
**Labels**: `api`
**Review ref**: C6
**Status**: done — issue closed, PR #51 merged

### Description

As a URL-analysis user, I want a transient structure-lane failure to not be cached, so that I'm not served `structureReport: null` for the full 10-minute TTL after a one-off exception.

### Acceptance Criteria

- [x] Given a URL analysis where structure was requested but threw, when the response is produced, then `setCache` is skipped (mirroring the image path's existing behavior).
- [x] Given a URL analysis where structure succeeded (or wasn't requested), when the response is produced, then caching behaves exactly as today.
- [x] Given a retry after a transient failure, when the same URL is re-analyzed, then a fresh attempt runs instead of returning the cached null.

### Technical Notes

- `app/api/analyze/route.ts:139-170` — the image path already implements this (comment cites review finding #3); copy that condition to the URL path.

### As Built

- The URL path in `app/api/analyze/route.ts` skips `setCache` whenever `structureUnavailableReason` is set; the image path skips it only when the failure is transient (`aiLaneAvailable()` is true).

### Dependencies

- Blocked by: none
- Blocks: none

---

## [DIST-019] Close residual SSRF guard gaps

**Type**: Technical
**GitHub Label**: technical
**Priority**: Medium
**Complexity**: Small
**Phase**: 3
**Labels**: `security`
**Review ref**: S3
**Status**: done — issue closed, PR #52 merged

### Description

As an operator, I want the SSRF guard to cover hex-form IPv4-mapped IPv6 addresses and remaining private/special ranges, and the threat model to name DNS rebinding explicitly, so that the guard's documented coverage matches its actual coverage.

### Acceptance Criteria

- [x] Given `http://[::ffff:7f00:1]/` (hex-form IPv4-mapped loopback), when `assertSafeUrl` checks it, then it is rejected like `::ffff:127.0.0.1`.
- [x] Given targets in `100.64.0.0/10` (CGNAT) and multicast/reserved space, when checked, then they are rejected.
- [x] Given the README threat model, when reading Layer 2, then it explicitly states the TOCTOU/DNS-rebinding limitation (guard resolves via `dns.lookup`; Chromium resolves again) and that egress firewalling is the real mitigation.
- [x] Existing allowed public URLs still pass (no over-blocking regression).

### Technical Notes

- `lib/security/ssrfGuard.ts:88` — `extractIpv4Mapped` only matches the dotted-quad form; normalize hex-form `::ffff:xxxx:xxxx` to IPv4 before the range checks.
- Keep the guard's fail-closed posture (the review flags it as worth preserving).

### As Built

- `lib/security/ssrfGuard.ts` normalizes hex-form `::ffff:xxxx:xxxx` to IPv4 and blocks `100.64.0.0/10`, `224.0.0.0/4` and `240.0.0.0/4`, failing closed.
- The README has no "Layer 2" heading any more: its "Container egress controls" bullet says the in-app guard cannot prevent DNS-rebinding tricks and that egress must be blocked at the firewall, without spelling out the second resolution by Chromium; the code comment in `lib/ingest.ts` does name it.

### Dependencies

- Blocked by: none
- Blocks: none

---

## [DIST-020] Sync README and CLAUDE.md with actual behavior

**Type**: Technical
**GitHub Label**: documentation
**Priority**: Medium
**Complexity**: Small
**Phase**: 3 (review fix-priority #8)
**Labels**: `docs`
**Review ref**: D1, D2
**Status**: done — issue closed, PR #67 merged

### Description

As a contributor, I want the README and CLAUDE.md to describe what the code actually does, so that agents and humans stop planning work against false claims.

### Acceptance Criteria

- [x] README no longer claims image input is "Palette & Mood only" (`structureFromImages` exists and the UI advertises it); the internal contradiction between README lines 28 and 35 is resolved.
- [x] README no longer promises UI mode toggles or forced-cache-refresh controls unless they exist (`page.tsx` hardcodes `mode: "both"`, never sends `forceRefresh`) — either document reality or note them as planned.
- [x] README no longer claims APCA contrast or Container Query detection (code is WCAG-only, never inspects container queries).
- [x] CLAUDE.md's cache-key claim matches the DIST-007 fix, and its "eval replays structure extraction offline" claim matches the DIST-013 fix.

### Technical Notes

- Purely doc edits; do this after DIST-007 and DIST-013 land so the docs describe fixed behavior instead of choosing which wrong state to document.

### As Built

- The rules now live in `AGENTS.md` (`CLAUDE.md` is a pointer) and `docs/architecture/`; `api-route.md` states that the cache key hashes all image payloads, and the eval section states that structure extraction is replayed offline from `rawHarvestNode`.
- The README makes no APCA, container-query, mode-toggle or force-refresh claim and states that the workbench always runs both tracks.

### Dependencies

- Blocked by: DIST-007, DIST-013
- Blocks: none

---

## [DIST-021] Sanitize render-path error responses and annotate injection surfaces

**Type**: Technical
**GitHub Label**: technical
**Priority**: Low
**Complexity**: Small
**Phase**: 4
**Labels**: `security`, `api`
**Review ref**: S6
**Status**: done — issue closed, PR #53 merged

### Description

As an operator, I want raw internal error messages kept out of client responses and known prompt-injection surfaces documented in code, so that internal details don't leak and future maintainers don't unknowingly widen the injection blast radius.

### Acceptance Criteria

- [x] Given a render-path failure, when the route responds, then the client receives a generic message while the raw `err.message` goes to server logs only (`route.ts:177`).
- [x] Given `lib/extract/structure/structureAI.ts`, when reading it, then a code comment states that page-controlled text flows into the labelling prompt and that Zod/schema constraints bound the impact to mislabeled report content.
- [x] The equivalent note exists where page pixels enter vision calls.

### Technical Notes

- The review found no XSS path (markdown in `<pre>`, schema-validated hexes, no `dangerouslySetInnerHTML`) — this story is hardening + documentation, not a live vulnerability.

### As Built

- The catch-all in `app/api/analyze/route.ts` logs `Analyze pipeline error:` server-side and returns a fixed 502 message; the typed `UnsafeUrlError` (400) and `DegenerateImageError` (422) messages stay client-facing.
- Prompt-injection notes sit in `structureAI.ts`, `structureFromImage.ts` and `lib/interpret.ts`.

### Dependencies

- Blocked by: none
- Blocks: none

---

## [DIST-022] Clean up small drifts and dead code

**Type**: Technical
**GitHub Label**: technical
**Priority**: Low
**Complexity**: Small
**Phase**: 4
**Labels**: `cleanup`
**Review ref**: C7
**Status**: done — issue closed, PR #54 merged

### Description

As a maintainer, I want the reviewed minor drifts fixed in one sweep, so that comments match behavior and known footguns are removed before they mislead the next change.

### Acceptance Criteria

- [x] `lib/extract/structure/repetition.ts:77-80` — `isNearMatch` behavior and comment agree (either compare child tags as promised or fix the comment), and `matchedVariance`/`varianceNote` tagging matches intent.
- [x] `lib/interpret.ts` `OUTPUT_SCHEMA` and the Zod mirror (`aiResponseSchema` via `colorRoleSchema`) accept the same role set (7 vs 11 drift resolved, one source of truth).
- [x] `route.ts:37` `stripDataUrlPrefix` handles `data:image/svg+xml;base64,` (the `+` in the MIME type).
- [x] `lib/aiLane.ts`'s shared-retry claim is true: `structureAI.ts` uses `retryOnce` (or the claim is corrected).
- [x] `lib/extract/structure/harvester.ts:90` — the `[..., "svg"].includes(tag) && tag !== "svg"` contradiction is resolved, and `harvestDomTree` gets a node cap mirroring `styleDump`'s `NODE_CAP = 5000` (bounds JSON payload on pathological DOMs).
- [x] `lib/extract/structureFromImage.ts:131` — module-level mutable `idCounter` replaced with per-invocation state.
- [x] `npm run eval`, `npm run typecheck`, `npm run lint` all pass.

### Technical Notes

- The harvester node cap is the one item here with security weight (unbounded payload); if this story slips, extract that item into DIST-011/DIST-012's phase instead.
- The repetition.ts fix may shift `varianceNote` output — watch the eval score and only accept intended changes.

### As Built

- `OUTPUT_SCHEMA` in `lib/interpret.ts` is generated from `aiResponseSchema` with `z.toJSONSchema`, so the role sets cannot drift.
- `harvester.ts` caps the walk at `NODE_CAP = 5000` and keeps `svg`; `structureFromImage.ts` passes a per-call `counter`; `structureAI.ts` calls `retryOnce`; `stripDataUrlPrefix` accepts `svg+xml`.

### Dependencies

- Blocked by: DIST-014 (lint must be runnable for the final AC)
- Blocks: none

---

## Validation summary

- Every review finding maps to a story except **S5** (explicitly accepted as-documented; revisit on auth-scope change).
- Dependency DAG: DIST-007 → DIST-020 ← DIST-013; DIST-014 → DIST-022; all others independent. Soft ordering within `imagePalette.ts`: DIST-009 → DIST-016 → DIST-015.
- All stories sized ≤ ~1 day except DIST-013 (Large — expected-spec authoring dominates; kept whole because the three layered fixes only make sense shipped together, since each alone still leaves the lane untested).
