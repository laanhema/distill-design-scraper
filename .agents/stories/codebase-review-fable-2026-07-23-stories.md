# Stories — Codebase Review Remediation (Fable, 2026-07-23)

Source: `.agents/temp/codebase-review-fable-2026-07-23.md` (full-codebase review).
Stories are ordered by the review's **Fix priority order**. IDs continue the `DIST-` sequence
from `phase-4-hardening-stories.md` (last used: DIST-006).

Note: review finding **S5** (rate-limiter identity spoofable when direct-exposed) is
deliberately **not** a story — the review accepts the documented trusted-proxy MVP posture
and asks only to revisit if auth scope changes.

---

## [DIST-007] Hash full image payloads in the analyze cache key

**Type**: Bug
**GitHub Label**: bug
**Priority**: High
**Complexity**: Small
**Phase**: 1 (review fix-priority #1)
**Labels**: `security`, `api`
**Review ref**: S1

### Description

As an image-upload user, I want the response cache keyed on my complete image payloads, so that another user's visually similar upload can never collide with mine and hand them my cached report (including my screenshot previews).

### Acceptance Criteria

- [ ] Given two different images sharing the first 100 base64 chars (identical PNG signature/IHDR prefix), when each is analyzed, then they produce distinct cache keys and distinct responses.
- [ ] Given the same image uploaded twice, when the second request arrives within TTL, then the cached response is still returned (caching behavior preserved).
- [ ] Given the fix, when reading `app/api/analyze/route.ts`, then no `.slice(0, 100)` (or any prefix truncation) feeds the hash — full payloads are hashed.
- [ ] `npm run typecheck` and `npm run eval` pass unchanged.

### Technical Notes

- `app/api/analyze/route.ts:67` — replace `images.map((img) => img.data.slice(0, 100))` with full `img.data` into the SHA-256 input. Hashing a few MB is trivial next to a Chromium render.
- CLAUDE.md already claims full payloads are hashed — after this fix the docs become true (see DIST-020).

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

### Description

As a deployer, I want `docker build` to succeed and the container to launch Chromium reliably, so that the documented container deployment path actually works.

### Acceptance Criteria

- [ ] Given the repo at HEAD, when running `docker build .`, then the build completes (the `COPY --from=base /app/public ./public` failure is gone — line removed or `public/` added).
- [ ] Given the built image, when the container starts and analyzes a URL, then Playwright finds a matching browser (base image tag pinned to the installed Playwright version, e.g. `mcr.microsoft.com/playwright/node:v1.61.1-jammy` matching `package.json`).
- [ ] Given the runner stage, when the app boots, then `next.config.mjs` is present in the image.
- [ ] Given the runner stage, when inspecting the running container, then it runs as a non-root user (`USER pwuser` or equivalent) and headless Chromium still launches.

### Technical Notes

- `Dockerfile` — four distinct problems; fix all in one pass since they're all in the same short file.
- Pinning: keep the image tag and the `playwright` version in `package.json` in lockstep; add a comment in the Dockerfile stating the invariant.
- Verify with an actual `docker build` + smoke run, not just inspection.

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

### Description

As a report consumer, I want image-input palettes to only claim roles with real evidence, so that `success`/`warning`/`danger`/`on-primary` swatches stamped `provenance: "measured"` are never invented from arbitrary leftover clusters.

### Acceptance Criteria

- [ ] Given an uploaded image with no plausible semantic-state colors, when the report is generated, then `success`/`warning`/`danger`/`on-primary` are omitted from the palette (not filled from leftover clusters, not duplicated from `clusters[0]`).
- [ ] Given the fill loop in `imagePalette.ts`, when reading the code, then it iterates at most `muted`/`border` (per its own comment) — or omits unfilled roles entirely.
- [ ] Given an omitted role, when the Markdown body renders, then the corresponding lines are absent rather than empty (existing optional-field contract).
- [ ] `npm run eval` passes unchanged (image lane isn't in the eval corpus, but the gate must not regress).

### Technical Notes

- `lib/extract/imagePalette.ts:197-209` — restrict the "fill remaining required roles" loop; the review recommends omitting unfilled roles outright as the better option.
- This is a direct "measured, never faked" violation — the project's core invariant (CLAUDE.md).
- Coordinate with DIST-015/DIST-016, which touch the same file.

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

### Description

As a report consumer, I want spacing and radius sections to appear only when actually measured, so that hardcoded default scales (`[4, 8, 16, 24, 32, 48, 64]`, `["4px","8px","16px","9999px"]`) are never emitted with `provenance: "measured"`.

### Acceptance Criteria

- [ ] Given a capture with no observable spacing values, when the report is built, then the `spacing` field is absent from frontmatter and the body section is not rendered.
- [ ] Given a capture with no observable radius values, when the report is built, then the `radius` field is likewise absent.
- [ ] Given a normal capture (eval corpus), when `npm run eval` runs, then scores are unchanged — real measurements still flow through.
- [ ] `npm run typecheck` passes with `extractSpacing`/`extractRadius` returning optional values plumbed through `extractTokens` → `buildReport`.

### Technical Notes

- `lib/extract/tokens.ts:96` (spacing default) and `:143` (radius default) — return `undefined` instead.
- `buildReport` already handles optional lanes; the `render*` functions in `lib/emit.ts` are already conditional — this should be plumbing only.

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

### Description

As an operator, I want the response cache bounded like the rate limiter already is, so that never-again-requested entries holding multi-MB base64 screenshots cannot grow the heap without limit.

### Acceptance Criteria

- [ ] Given more insertions than the entry cap, when a new entry is added, then the least-recently-used entry is evicted and total entries never exceed the cap.
- [ ] Given expired entries that are never re-read, when the periodic sweep runs, then they are removed without requiring a read.
- [ ] Given normal cache hits within TTL, when the same key is requested, then behavior is unchanged (hit returns cached response, refreshes recency).
- [ ] Cache limits are named constants with a brief comment, mirroring the `RATE_LIMIT_MAX_BUCKETS` pattern.

### Technical Notes

- `lib/cache.ts` — model the fix on `lib/security/rateLimiter.ts`, which was already bounded against exactly this class of bug (cap + sweep).
- A `Map` gives insertion-order iteration; delete+re-set on read gives cheap LRU recency.

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

### Description

As an operator, I want oversized request bodies rejected before any processing, so that attacker-controlled buffers never reach `sharp` or the palette pipeline unchecked.

### Acceptance Criteria

- [ ] Given a request body over the limit, when it hits `/api/analyze`, then the route responds 413 (or equivalent 4xx) without invoking `sharp` or Playwright.
- [ ] Given a legitimate 6-image upload within the limit, when analyzed, then behavior is unchanged.
- [ ] The limit is a named constant sized from `MAX_IMAGES` × a sane per-image ceiling, with a comment stating the rationale.

### Technical Notes

- `app/api/analyze/route.ts` — check `Content-Length` and/or measure the parsed payload before decoding; Next.js route handlers don't apply the old `bodyParser` size config, so enforce explicitly.
- Complements DIST-015 (CPU exhaustion) — this bounds input size, that bounds per-pixel work.

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

### Description

As a maintainer, I want `npm run eval` to actually exercise and score the structure lane offline, so that structure-extraction regressions are caught by the gate instead of silently scoring a constant 1.0 on a lane that never runs.

### Acceptance Criteria

- [ ] Given `npm run eval:capture`, when captures are re-taken, then each `eval/corpus/<slug>/capture.json` contains `rawHarvestNode` (copied through in `eval/capture.ts`), and the refreshed captures are committed.
- [ ] Given hand-authored expected structure specs per corpus site, when `npm run eval` runs, then `scoreStructure` receives an `expected` spec and produces a real (non-constant) score that feeds the site gate.
- [ ] Given `ANTHROPIC_API_KEY` set in the environment, when `npm run eval` runs, then **no network call is made** — the structure pipeline's AI naming stage is forced to the heuristic fallback in the eval path, and repeated runs are deterministic.
- [ ] Given a deliberate structure-extractor break (manual spot check), when `npm run eval` runs, then the score drops below baseline and the gate fails.
- [ ] `eval/baseline.json` refreshed deliberately via `UPDATE_BASELINE=1 npm run eval` once scores are real.

### Technical Notes

- Three layered fixes: `eval/capture.ts:44-58` (copy `rawHarvestNode` into the written capture), `eval/run.ts:57-66` (pass expected spec), `eval/scoreStructure.ts:23-30` (stop returning 1.0 with no spec — score against it).
- AI-off switch: `extractStructureFromCapture` → Stage 7 labeller; add an explicit option (or env guard in the eval runner) forcing the heuristic path — don't rely on unsetting the key in the environment.
- This is the one sanctioned reason to touch committed `capture.json` files: the capture *shape* changes (per CLAUDE.md, same precedent as `responsiveHarvests`/`darkCapture`).
- Authoring expected specs for both corpus sites is the bulk of the work — budget accordingly.

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

### Description

As a contributor, I want `npm run lint` to run to completion without prompting, so that the lint gate mandated by CLAUDE.md and the git policy is actually usable locally and in CI.

### Acceptance Criteria

- [ ] Given a fresh checkout, when running `npm run lint` non-interactively, then it completes with a pass/fail result and no interactive prompt.
- [ ] Given the current codebase, when lint runs, then it passes (fix or explicitly disable rules that fire on existing code — no drive-by refactors).
- [ ] The config uses Next's recommended preset (`next/core-web-vitals` or the flat-config equivalent), and the deprecated `next lint` wrapper is migrated per its own deprecation warning if straightforward.

### Technical Notes

- No ESLint config exists anywhere in the repo — `next lint` drops into its setup wizard.
- Next 15 deprecates `next lint`; prefer invoking `eslint` directly with `eslint-config-next` in a flat config, keeping the `npm run lint` script name stable.

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

### Description

As an operator, I want image quantization to run in bounded time regardless of image content, so that a photographic or gradient-noise upload cannot pin a CPU core for the whole 60s route budget.

### Acceptance Criteria

- [ ] Given a worst-case noise/gradient image (every pixel distinct), when `quantizeImage` runs, then work is bounded by the fixed bucket count (e.g. 4-bit/channel histogram = 4096 buckets), not by an unbounded growing cluster list.
- [ ] Given the existing eval-adjacent behavior, when a normal screenshot is quantized, then the resulting role assignment is materially unchanged (spot-check palettes on 2–3 real screenshots before/after).
- [ ] Given 6 max-size images in one request, when analyzed, then quantization completes in a small fraction of the route timeout.

### Technical Notes

- `lib/extract/imagePalette.ts:57-72` — coarse-bucket first (as `palette.ts`'s `farBuckets` already does), then ΔE-merge the bucket centroids. The reference pattern is in the same repo: `lib/extract/palette.ts` uses squared-Lab distance against a small fixed set.
- Same file as DIST-009/DIST-016 — sequence these to avoid conflicts (suggested order: 009 → 016 → 015, or land 015 last since it rewrites the function the others touch).

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

### Description

As an image-upload user, I want a fully transparent or unparseable image to produce an honest error or empty palette, so that a single bad upload doesn't 502 the whole request with an unhandled TypeError.

### Acceptance Criteria

- [ ] Given a fully transparent PNG, when analyzed, then the route returns a clean, actionable 4xx/valid-report response — no unhandled `TypeError` on `bgCluster.hex`, no 502.
- [ ] Given a mixed upload (one degenerate image + valid images), when analyzed, then the valid images still produce a palette (degenerate one skipped or reported).
- [ ] The empty-cluster guard omits palette fields rather than inventing them (provenance contract).

### Technical Notes

- `lib/extract/imagePalette.ts:111` — `clusters[0]` is undefined when quantization yields nothing; guard before use.
- If DIST-015 lands first its rewrite must include this guard; whichever ships first closes the crash.

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

### Description

As a multi-image user, I want previews, filenames, and remove buttons to always refer to the same file, so that out-of-order `FileReader` completions can't send wrong names to the API or delete the wrong image.

### Acceptance Criteria

- [ ] Given several files selected at once (varying sizes so read-completion order differs from selection order), when previews render, then each preview, its displayed name, and its `removeImage` target refer to the same underlying file.
- [ ] Given the fix, when reading `page.tsx`, then file and preview live in one state entry (`{file, preview}[]`) or reads are strictly sequential — no parallel-index pairing across two arrays.
- [ ] Given a new analysis that returns no structure report, when results render, then the active tab resets away from `"structure"` (no empty pane; "Copy .md" never copies `""`).

### Technical Notes

- `app/page.tsx:58-70` (`handleFilesSelect`); pairing consumed at `:100`, `:143`, and in `removeImage`.
- The single-state-array approach also simplifies `removeImage` to one splice.

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

### Description

As a URL-analysis user, I want a transient structure-lane failure to not be cached, so that I'm not served `structureReport: null` for the full 10-minute TTL after a one-off exception.

### Acceptance Criteria

- [ ] Given a URL analysis where structure was requested but threw, when the response is produced, then `setCache` is skipped (mirroring the image path's existing behavior).
- [ ] Given a URL analysis where structure succeeded (or wasn't requested), when the response is produced, then caching behaves exactly as today.
- [ ] Given a retry after a transient failure, when the same URL is re-analyzed, then a fresh attempt runs instead of returning the cached null.

### Technical Notes

- `app/api/analyze/route.ts:139-170` — the image path already implements this (comment cites review finding #3); copy that condition to the URL path.

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

### Description

As an operator, I want the SSRF guard to cover hex-form IPv4-mapped IPv6 addresses and remaining private/special ranges, and the threat model to name DNS rebinding explicitly, so that the guard's documented coverage matches its actual coverage.

### Acceptance Criteria

- [ ] Given `http://[::ffff:7f00:1]/` (hex-form IPv4-mapped loopback), when `assertSafeUrl` checks it, then it is rejected like `::ffff:127.0.0.1`.
- [ ] Given targets in `100.64.0.0/10` (CGNAT) and multicast/reserved space, when checked, then they are rejected.
- [ ] Given the README threat model, when reading Layer 2, then it explicitly states the TOCTOU/DNS-rebinding limitation (guard resolves via `dns.lookup`; Chromium resolves again) and that egress firewalling is the real mitigation.
- [ ] Existing allowed public URLs still pass (no over-blocking regression).

### Technical Notes

- `lib/security/ssrfGuard.ts:88` — `extractIpv4Mapped` only matches the dotted-quad form; normalize hex-form `::ffff:xxxx:xxxx` to IPv4 before the range checks.
- Keep the guard's fail-closed posture (the review flags it as worth preserving).

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

### Description

As a contributor, I want the README and CLAUDE.md to describe what the code actually does, so that agents and humans stop planning work against false claims.

### Acceptance Criteria

- [ ] README no longer claims image input is "Palette & Mood only" (`structureFromImages` exists and the UI advertises it); the internal contradiction between README lines 28 and 35 is resolved.
- [ ] README no longer promises UI mode toggles or forced-cache-refresh controls unless they exist (`page.tsx` hardcodes `mode: "both"`, never sends `forceRefresh`) — either document reality or note them as planned.
- [ ] README no longer claims APCA contrast or Container Query detection (code is WCAG-only, never inspects container queries).
- [ ] CLAUDE.md's cache-key claim matches the DIST-007 fix, and its "eval replays structure extraction offline" claim matches the DIST-013 fix.

### Technical Notes

- Purely doc edits; do this after DIST-007 and DIST-013 land so the docs describe fixed behavior instead of choosing which wrong state to document.

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

### Description

As an operator, I want raw internal error messages kept out of client responses and known prompt-injection surfaces documented in code, so that internal details don't leak and future maintainers don't unknowingly widen the injection blast radius.

### Acceptance Criteria

- [ ] Given a render-path failure, when the route responds, then the client receives a generic message while the raw `err.message` goes to server logs only (`route.ts:177`).
- [ ] Given `lib/extract/structure/structureAI.ts`, when reading it, then a code comment states that page-controlled text flows into the labelling prompt and that Zod/schema constraints bound the impact to mislabeled report content.
- [ ] The equivalent note exists where page pixels enter vision calls.

### Technical Notes

- The review found no XSS path (markdown in `<pre>`, schema-validated hexes, no `dangerouslySetInnerHTML`) — this story is hardening + documentation, not a live vulnerability.

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

### Description

As a maintainer, I want the reviewed minor drifts fixed in one sweep, so that comments match behavior and known footguns are removed before they mislead the next change.

### Acceptance Criteria

- [ ] `lib/extract/structure/repetition.ts:77-80` — `isNearMatch` behavior and comment agree (either compare child tags as promised or fix the comment), and `matchedVariance`/`varianceNote` tagging matches intent.
- [ ] `lib/interpret.ts` `OUTPUT_SCHEMA` and the Zod mirror (`aiResponseSchema` via `colorRoleSchema`) accept the same role set (7 vs 11 drift resolved, one source of truth).
- [ ] `route.ts:37` `stripDataUrlPrefix` handles `data:image/svg+xml;base64,` (the `+` in the MIME type).
- [ ] `lib/aiLane.ts`'s shared-retry claim is true: `structureAI.ts` uses `retryOnce` (or the claim is corrected).
- [ ] `lib/extract/structure/harvester.ts:90` — the `[..., "svg"].includes(tag) && tag !== "svg"` contradiction is resolved, and `harvestDomTree` gets a node cap mirroring `styleDump`'s `NODE_CAP = 5000` (bounds JSON payload on pathological DOMs).
- [ ] `lib/extract/structureFromImage.ts:131` — module-level mutable `idCounter` replaced with per-invocation state.
- [ ] `npm run eval`, `npm run typecheck`, `npm run lint` all pass.

### Technical Notes

- The harvester node cap is the one item here with security weight (unbounded payload); if this story slips, extract that item into DIST-011/DIST-012's phase instead.
- The repetition.ts fix may shift `varianceNote` output — watch the eval score and only accept intended changes.

### Dependencies

- Blocked by: DIST-014 (lint must be runnable for the final AC)
- Blocks: none

---

## Validation summary

- Every review finding maps to a story except **S5** (explicitly accepted as-documented; revisit on auth-scope change).
- Dependency DAG: DIST-007 → DIST-020 ← DIST-013; DIST-014 → DIST-022; all others independent. Soft ordering within `imagePalette.ts`: DIST-009 → DIST-016 → DIST-015.
- All stories sized ≤ ~1 day except DIST-013 (Large — expected-spec authoring dominates; kept whole because the three layered fixes only make sense shipped together, since each alone still leaves the lane untested).
