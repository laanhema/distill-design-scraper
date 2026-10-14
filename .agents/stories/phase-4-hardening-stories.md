# Stories — Phase 4: Hardening & Reach

> Generated 2026-07-23 from `.agents/PRDs/PRD.md` §12 Phase 4 (the only open phase; Phases 1–3 are delivered and verified). Each story references its PRD section for traceability.

Last Updated: 2026-10-14

---

## Status

All 6 stories are done: each issue (#2–#7) is closed as completed and each pull request is merged into `main`. No issue or pull request of this file is still open.

| Story | Issue | Pull request | Phase | Status | Acceptance criteria ticked |
| --- | --- | --- | --- | --- | --- |
| DIST-001 SSRF guard | #2 | #8 | 4 | done | 5 of 5 |
| DIST-002 Rate limiting | #3 | #9 | 4 | done | 4 of 4 |
| DIST-003 Deployment hardening docs | #4 | #10 | 4 | done | 3 of 3 |
| DIST-004 Tablet viewport | #5 | #11 | 4 | done | 4 of 5 |
| DIST-005 Motion spike | #6 | #12 | 4 | done | 4 of 4 |
| DIST-006 Tailwind theme spike | #7 | #40 | 4 | done | 4 of 4 |

The criteria were checked on 2026-10-14 against the code at `4291324` and an offline `npm run eval` run (all gates passed); the product was not run. The spike criteria rest on the write-ups in `.agents/reports/`. A ticked box means the code satisfies the criterion now, an unticked box carries a note with what is missing, and an As Built section records where the result differs from the text or where it lives. Plans are in `.agents/plans/completed/`, implementation reports in `.agents/reports/`, reviews in `.agents/reviews/`.

### Open Items Without a Story

**Open GitHub issues that no story names**

- #156 [TODO-1] Handle inaccessible URLs, bot-blocks, and view-obscuring overlays gracefully
- #158 [TODO-3] Investigate secure local distribution and sharing models (Docker / BYOK)
- #166 [TODO-1] Spike: bypass or detect view-obscuring overlays, cookie walls, and paywalls before capture

## [DIST-001] Built-in SSRF guard for URL analysis

**Type**: Technical
**GitHub Label**: technical
**Priority**: High
**Complexity**: Medium
**Phase**: Phase 4 — Hardening & reach
**Labels**: `backend`, `security`, `api`
**Status**: done — issue closed, PR #8 merged

### Description

As a deployer of a public Distill instance, I want the analyzer to refuse navigation to private, loopback, and link-local network targets, so that the open `POST /api/analyze` endpoint cannot be used to probe my internal network via the headless browser.

### Acceptance Criteria

- [x] Given a URL resolving to a private/reserved range (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`, `fc00::/7`), when it is submitted to `/api/analyze`, then the request is rejected with a 4xx and a clear error message before any browser navigation occurs.
- [x] Given a non-http(s) scheme (`file:`, `ftp:`, `chrome:`, `data:`), when submitted, then the request is rejected with a 4xx.
- [x] Given a hostname that DNS-resolves to a blocked IP (rebinding-style), when submitted, then it is rejected — validation happens against the resolved address, not just the literal hostname.
- [x] Given a normal public URL, when submitted, then behavior is unchanged and `npm run eval` still passes (the guard lives at the ingestion seam, not in `extractFromCapture`).
- [x] Given a deployer who wants to allow an internal target (e.g. staging), when they set a documented env-var allowlist, then those hosts bypass the guard.

### Technical Notes

- Guard belongs at the single URL→Capture seam (`lib/ingest.ts`) and/or request validation in `app/api/analyze/route.ts` — never inside the measured lane (`extractFromCapture` must stay offline-replayable, per CLAUDE.md).
- Validate post-DNS-resolution (`dns.lookup`) to cover rebinding; consider also blocking cross-origin redirects into private ranges via Playwright route interception.
- Zod-reject invalid schemes at the route so errors surface as 4xx per PRD §10.
- PRD refs: §9 (out-of-scope note being closed), §12 Phase 4, §14 SSRF risk row.

### As Built

- `assertSafeUrl` in `lib/security/ssrfGuard.ts` runs at the top of `renderUrl` (`lib/ingest.ts`), before Chromium launches; it DNS-resolves the host, checks every resolved address, rejects any scheme but `http:`/`https:`, and fails closed on an unresolvable host.
- `app/api/analyze/route.ts` maps `UnsafeUrlError` to a 400 with its message; schemes are rejected in the guard, not by Zod at the route.
- `SSRF_ALLOWLIST_HOSTS` takes comma-separated exact hostnames; redirect targets are checked too (DIST-044, DIST-049).

### Dependencies

- Blocked by: —
- Blocks: DIST-003 (docs should describe the shipped guard)

---

## [DIST-002] Basic rate limiting on `/api/analyze`

**Type**: Technical
**GitHub Label**: technical
**Priority**: High
**Complexity**: Small
**Phase**: Phase 4 — Hardening & reach
**Labels**: `backend`, `security`, `api`
**Status**: done — issue closed, PR #9 merged

### Description

As a deployer of a public Distill instance, I want simple per-client rate limiting on the analyze endpoint, so that a single client cannot exhaust the server with expensive Chromium renders.

### Acceptance Criteria

- [x] Given a client exceeding the configured request rate, when it calls `POST /api/analyze`, then it receives `429 Too Many Requests` with a `Retry-After` header.
- [x] Given cached responses, when a request is served from cache, then it either doesn't count against the limit or counts at reduced weight (cache hits are cheap; renders are the resource being protected).
- [x] Given no configuration, when the server starts, then a sane default limit applies and can be tuned (or disabled for local dev) via env var.
- [x] Given the limiter is active, when `npm run eval` runs, then it is unaffected (evals never touch the API route).

### Technical Notes

- In-memory token-bucket keyed by client IP is sufficient for MVP (no persistent storage in scope per PRD §9); note the multi-instance caveat in a code comment.
- Implement in `app/api/analyze/route.ts` or a small `lib/` helper; keep zero new schema surface.
- PRD refs: §9, §12 Phase 4, §14.

### As Built

- `lib/security/rateLimiter.ts` is a per-process token bucket: `DEFAULT_MAX_REQUESTS = 20` per `DEFAULT_WINDOW_MS = 60_000`, `DEFAULT_MAX_BUCKETS = 50_000`, tuned by `RATE_LIMIT_MAX_REQUESTS`/`RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX_BUCKETS` and switched off with `RATE_LIMIT_DISABLED`.
- The check runs after the cache lookup, so a cache hit costs nothing; the client id is the first `x-forwarded-for` entry, then `x-real-ip`.

### Dependencies

- Blocked by: —
- Blocks: DIST-003

---

## [DIST-003] Deployment hardening guidance (SSRF sandboxing + limits)

**Type**: Technical
**GitHub Label**: technical
**Priority**: Medium
**Complexity**: Small
**Phase**: Phase 4 — Hardening & reach
**Labels**: `docs`, `security`, `deployment`
**Status**: done — issue closed, PR #10 merged

### Description

As a deployer, I want documented guidance on network-sandboxing the headless browser and fronting the API with auth/limits, so that I can run Distill publicly without relying on defaults alone.

### Acceptance Criteria

- [x] Given the README (or a `docs/deployment.md`), when a deployer reads it, then it explains the SSRF risk model, the built-in guard (DIST-001) and its allowlist env var, and the rate-limit env vars (DIST-002).
- [x] Given the Docker deployment path, when following the docs, then an example of network-restricting the container (e.g. egress firewall / no access to link-local metadata endpoints) is provided.
- [x] Given PRD §9's "out of scope" security list, when docs land, then §9 is updated to reflect what Phase 4 actually shipped.

### Technical Notes

- Pure docs change + PRD touch-up; no extraction code involved, no eval impact.
- PRD refs: §9, §12 Phase 4, §14.

### As Built

- The SSRF risk model and the guard are in the README hardening guide; the rate-limit env vars are not in the README but in `docs/architecture/security.md`, which the guide links.
- The README's "Layer 2: network-restrict the container" holds the `DOCKER-USER` `iptables` example; it was dropped in `a3dd6ef` and restored on 2026-10-14.

### Dependencies

- Blocked by: DIST-001, DIST-002
- Blocks: —

---

## [DIST-004] Tablet viewport (768px) in the responsive diff

**Type**: Enhancement
**GitHub Label**: enhancement
**Priority**: Medium
**Complexity**: Large
**Phase**: Phase 4 — Hardening & reach
**Labels**: `backend`, `extraction`, `eval`
**Status**: done — issue closed, PR #11 merged. 1 criterion is not met.

### Description

As an agency builder, I want the structure report's responsive deltas to include a tablet breakpoint (768px) alongside mobile (390×844), so that I can plan a rebuild across all three canonical widths from one artifact.

### Acceptance Criteria

- [x] Given a URL analysis, when ingestion runs, then a 768px harvest is captured as an additional entry in `responsiveHarvests` (best-effort: failure logs a warning and the entry is simply absent).
- [x] Given a site whose layout shifts at tablet width, when the structure report emits, then per-component deltas name the viewport they belong to (e.g. `768px: 3col → 2col`, `390px: → 1col`) without ambiguity.
- [x] Given a site with no layout change at 768px, when the report emits, then no tablet delta is fabricated (absence over invention — "measured, never faked").
- [x] Given old committed captures without the tablet harvest, when `npm run eval` replays them, then extraction treats the missing entry as "nothing observed" and does not error.
- [ ] Given the capture shape now includes a new harvest, when the change lands, then `eval/corpus/*/capture.json` is refreshed via `npm run eval:capture` and `eval/baseline.json` via `UPDATE_BASELINE=1 npm run eval` — in the same PR, per the fixture policy.
  - *Not met:* PR #11 refreshed `eval/corpus/clean-light/capture.json` and `eval/corpus/dark-mode/capture.json`, but did not touch `eval/baseline.json`.

### Technical Notes

- Add `{ width: 768, height: 1024 }` to `RESPONSIVE_VIEWPORTS` in `lib/ingest.ts`; the responsive-diff stage (`lib/extract/structure/responsive.ts`) already iterates harvests, but verify emit copy distinguishes multiple secondary viewports (today only 390px exists, so labels may be hard-coded).
- Check whether `applyMobileTypeSizes` (`sizePxMobile`) should stay 390-only or gain a tablet counterpart — if the latter, it's a new optional schema field with its own conditional `render*` in `lib/emit.ts`.
- This is the one sanctioned capture-shape change: corpus refresh + baseline in the same PR (this happened before with `responsiveHarvests`/`darkCapture`).
- Verify against a synthetic local-server fixture first (CLAUDE.md "Manually verifying extraction changes").
- PRD refs: §4 out-of-scope (being closed), §12 Phase 4, §14 fixture-policy risk row.

### As Built

- `RESPONSIVE_VIEWPORTS` in `lib/ingest.ts` holds 390×844 and 768×1024, narrowest first; each harvest is best-effort.
- `responsive.ts` diffs each secondary harvest against the primary tree by structural position, and `buildResponsiveSectionText` renders each delta as `` 768px `…` → 390px `…` ``.
- `sizePxMobile` stays 390-only; there is no tablet type-size field.

### Dependencies

- Blocked by: —
- Blocks: —

---

## [DIST-005] Spike — motion/transition token extraction

**Type**: Spike
**GitHub Label**: spike
**Priority**: Low
**Complexity**: Medium
**Phase**: Phase 4 — Hardening & reach
**Labels**: `extraction`, `research`
**Status**: done — issue closed, PR #12 merged

### Description

As a maintainer, I want a time-boxed investigation into extracting motion tokens (transition durations, easings, keyframe animations) from the rendered page, so that we can decide whether a `motion` lane fits the "measured, never faked" contract before committing to it.

### Acceptance Criteria

- [x] Given the spike concludes, when its write-up lands (e.g. `.agents/reports/motion-spike.md`), then it answers: what can be *measured* (computed `transition-*`/`animation-*` styles, CSSOM `@keyframes`) vs. what would require inference — with a prototype or code pointers as evidence.
- [x] Given a proposed schema shape, when documented, then it follows the optional-lane contract: optional top-level field, own `provenance`, conditional `render*`, absence for motion-less sites.
- [x] Given the capture question, when answered, then the write-up states whether motion data fits the existing `StyleDump` walk (no second walk — single-walk is load-bearing) or needs a new capture field (⇒ corpus-refresh implications, ideally batched with DIST-004's refresh).
- [x] Given the findings, when the spike closes, then a go/no-go recommendation with estimated follow-up stories is recorded.

### Technical Notes

- Likely harvest point: extend the `page.evaluate` callback in `lib/extract/styleDump.ts` (self-contained, no imports) with `transitionProperty/Duration/TimingFunction` — cheap, same walk. `@keyframes` need CSSOM iteration like the existing `states` harvest (cross-origin sheets skipped silently).
- Aggregation would mirror `tokens.ts` (frequency-ranked durations/easings, modal per element class).
- Time-box: 1–2 days; output is a report, not merged extraction code.
- PRD refs: §4 out-of-scope, §12 Phase 4, §13.

### As Built

- The write-up is `.agents/reports/motion-spike.md` (GO, with a follow-up story breakdown); the lane shipped as DIST-041 (`lib/extract/motion.ts`) on the existing style-dump walk.

### Dependencies

- Blocked by: —
- Blocks: —

---

## [DIST-006] Spike — report-to-code: starter Tailwind theme / CSS from frontmatter

**Type**: Spike
**GitHub Label**: spike
**Priority**: Medium
**Complexity**: Medium
**Phase**: Phase 4 — Hardening & reach
**Labels**: `codegen`, `research`, `frontend`
**Status**: done — issue closed, PR #40 merged

### Description

As a frontend developer, I want a generated starter Tailwind theme (or plain CSS custom-property file) derived from the design report's frontmatter, so that adopting an extracted design system is a file drop instead of manual transcription.

### Acceptance Criteria

- [x] Given a design report's YAML frontmatter, when the prototype generator runs, then it emits a valid Tailwind (v4 `@theme`) and/or `:root` CSS file whose every value traces 1:1 to an existing frontmatter field — zero invented values, mirroring the CSS-variables-block precedent.
- [x] Given an unmeasured lane (e.g. no `paletteDark`, no `states`), when generating, then the corresponding output section is omitted, not defaulted.
- [x] Given the spike concludes, when its write-up lands, then it recommends the delivery surface (new report tab? download button? separate emit function in `lib/emit.ts`?) and whether this stays a derived view (no schema change) or needs one.
- [x] Given the prototype output, when dropped into a fresh Tailwind project, then it builds without errors (spot-check, documented in the write-up).

### Technical Notes

- Strong precedent: `renderCssVariables` in `lib/emit.ts` — a derived block that adds no schema surface and traces 1:1 to frontmatter. The Tailwind emitter should follow the same rule.
- Input is the Zod-validated report object (`lib/schema.ts`), not re-parsed markdown.
- Purely additive/derived ⇒ no eval-corpus impact; `npm run eval` must pass untouched.
- Time-box: 1–2 days; deliverable is prototype + recommendation, with follow-up stories if "go".
- PRD refs: §4 out-of-scope, §12 Phase 4, §13 code-generation.

### As Built

- The write-up is `.agents/reports/tailwind-theme-spike-report.md` (GO, a download button with `@theme` only), with a recorded build in a fresh Tailwind 4.3.3 project.
- It shipped as `emitTailwindTheme` (DIST-042), which now lives in `lib/emitTailwind.ts` rather than `lib/emit.ts`, so the client bundle does not pull in `js-yaml`.

### Dependencies

- Blocked by: —
- Blocks: —

---

## Validation summary

- **Coverage:** all four unchecked Phase 4 PRD items map to stories (SSRF line → DIST-001 + DIST-003; rate limiting → DIST-002; tablet viewport → DIST-004; motion spike → DIST-005; report-to-code spike → DIST-006). No other PRD requirements are open.
- **Dependency DAG:** DIST-001 → DIST-003 ← DIST-002; all others independent. No cycles.
- **Sizing:** each story ≤ ~2 days; DIST-004 is largest due to the mandated same-PR corpus refresh but is not further divisible (the fixture policy forbids splitting the capture change from the refresh).
- **Ordering:** High-priority hardening first (001, 002), then docs (003), then reach (004), then spikes (006, 005).
