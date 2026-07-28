# Stories — Distill PRD open scope (2026-07-28)

**Source PRD**: `.agents/PRDs/PRD.md` (refreshed 2026-07-28)
**Companion plan**: `.agents/plans/from-claude-to-gemini-plan.md` (source of truth for Phase 5)

The PRD was authored retroactively against a shipped codebase; Phases 1–4 are `[x]` delivered and
regression-gated. Only two blocks are genuinely open, and every story below traces to one of them:

- **Phase 5 — AI lane migration Claude → Gemini** (PRD §4 "Planned", §11 unchecked criteria, §12 Phase 5)
- **Phase 6 — spiked, GO'd, not yet built** (PRD §12 Phase 6)

Items under PRD §4 "Out of Scope (deferred)" deliberately get **no story** — they are declared out of
MVP scope, not backlog.

**Story IDs** continue the existing sequence (last shipped: `DIST-033`, issue #39).

## Created GitHub issues

All 10 filed in [`laanhema/distill-design-scraper`](https://github.com/laanhema/distill-design-scraper)
on 2026-07-28; no milestone (matching how DIST-001…DIST-033 were tracked). Technical notes are attached
as the first comment on each issue.

| Story | Issue | Title | Labels |
|---|---|---|---|
| DIST-034 | [#68](https://github.com/laanhema/distill-design-scraper/issues/68) | Rebuild `lib/aiLane.ts` on `@google/genai` with a `callModel` primitive | `technical`, `infra` |
| DIST-035 | [#69](https://github.com/laanhema/distill-design-scraper/issues/69) | Migrate `lib/interpret.ts` to `callModel` + native JSON mode | `technical` |
| DIST-036 | [#70](https://github.com/laanhema/distill-design-scraper/issues/70) | Migrate structure Stage 7 and delete the latent `temperature: 0.1` | `bug`, `structure-lane`, `technical` |
| DIST-037 | [#71](https://github.com/laanhema/distill-design-scraper/issues/71) | Migrate the vision structure lane; retire its media-type union | `bug`, `structure-lane`, `technical` |
| DIST-038 | [#72](https://github.com/laanhema/distill-design-scraper/issues/72) | Remove `@anthropic-ai/sdk`; sweep provider references | `technical`, `documentation`, `cleanup` |
| DIST-039 | [#73](https://github.com/laanhema/distill-design-scraper/issues/73) | First live end-to-end verification of all three AI lanes | `technical`, `eval`, `provenance` |
| DIST-040 | [#74](https://github.com/laanhema/distill-design-scraper/issues/74) | Make AI-lane failure distinguishable from "no key configured" | `enhancement`, `technical`, `provenance` |
| DIST-041 | [#75](https://github.com/laanhema/distill-design-scraper/issues/75) | Motion/transition token lane | `enhancement`, `extraction`, `tokens-lane`, `schema` |
| DIST-042 | [#76](https://github.com/laanhema/distill-design-scraper/issues/76) | `emitTailwindTheme(report)` + download button | `enhancement`, `emit`, `codegen`, `frontend` |
| DIST-043 | [#77](https://github.com/laanhema/distill-design-scraper/issues/77) | Cross-origin hover/focus state capture (Strategy A) | `enhancement`, `extraction`, `tokens-lane` |
| DIST-044 | [#88](https://github.com/laanhema/distill-design-scraper/issues/88) | SSRF redirect hardening on HTTP 301/302 redirects | `bug`, `security`, `ingestion` |
| DIST-045 | [#89](https://github.com/laanhema/distill-design-scraper/issues/89) | Dynamic contextual action labels & meta panel key hint in `app/page.tsx` | `enhancement`, `frontend`, `ui` |
| DIST-046 | [#90](https://github.com/laanhema/distill-design-scraper/issues/90) | Automated GitHub Actions CI workflow (`.github/workflows/ci.yml`) | `technical`, `infra`, `ci` |

---

## Ordering & dependency graph

```
Phase 5 (sequential — the seam lands first, call sites follow, cleanup last)

  DIST-034  aiLane.ts → Gemini seam
      ├──▶ DIST-035  interpret.ts
      ├──▶ DIST-036  structureAI.ts (Stage 7)
      ├──▶ DIST-037  structureFromImage.ts (vision)
      └──▶ DIST-040  AI-failure observability  (independent of 035–037)
                 │
   035+036+037 ──┴──▶ DIST-038  drop @anthropic-ai/sdk + doc sweep
                               └──▶ DIST-039  first live end-to-end verification

Audit & Infra Fixes (Phase 5 parallel)

  DIST-044  SSRF redirect hardening
  DIST-045  UI polish & meta key hint
  DIST-046  GitHub Actions CI workflow

Phase 6 (mutually independent; each has a completed GO spike)

  DIST-041  motion/transition lane
  DIST-042  emitTailwindTheme
  DIST-043  cross-origin state capture
```n lane
  DIST-042  emitTailwindTheme
  DIST-043  cross-origin state capture
```

**Why the SDK removal is its own late story (DIST-038):** removing `@anthropic-ai/sdk` from
`package.json` while any of the three call sites still `import Anthropic` breaks `npm run typecheck`.
Keeping the dependency installed through DIST-035–037 lets each call-site story merge independently
with lint + typecheck green.

---

# Phase 5 — AI lane migration (Claude → Gemini)

## [DIST-034] Rebuild `lib/aiLane.ts` on `@google/genai` with a `callModel` primitive

**Type**: Technical
**GitHub Label**: technical
**Priority**: High
**Complexity**: Medium
**Phase**: 5 — AI lane migration
**Labels**: `technical`, `infra`
**PRD trace**: §4 Planned bullets 1–2, §12 Phase 5 scope bullet 1

### Description

As a maintainer, I want the single AI provider seam rebuilt on the Gemini SDK with a `callModel`
primitive, so that all three AI lanes can migrate without any of them importing an SDK or re-inlining
JSON extraction.

### Acceptance Criteria

- [ ] Given `@google/genai` ^2.13.0 is added as a dependency (`@anthropic-ai/sdk` stays installed for now), when `npm run typecheck` runs, then it passes with no call-site changes yet.
- [ ] Given `lib/aiLane.ts`, when it is inspected, then `AI_MODEL === "gemini-2.5-flash"` (with optional `process.env.GEMINI_MODEL` fallback) and `aiLaneAvailable()` returns `Boolean(process.env.GEMINI_API_KEY)`.
- [ ] Given `callModel(opts)` is exported, when it is called, then it accepts `{ images?, system?, user, jsonSchema?, maxOutputTokens, thinkingLevel? }` and returns `string | null`, constructing exactly one module-level `GoogleGenAI` client (lazily) rather than one per retry.
- [ ] Given `jsonSchema` is supplied, when the request is built, then `config` carries both `responseMimeType: "application/json"` and `responseJsonSchema` (never `responseSchema`, and never both).
- [ ] Given `parseJsonLoose(text)` is exported, when passed clean JSON, a fenced/preambled JSON blob, or `null`, then it returns the parsed object, the parsed object, and `null` respectively.
- [ ] Given `retryOnce`, when the migration lands, then its signature and behaviour are byte-identical to before — this story changes the provider, not the fallback policy.
- [ ] Given `lib/aiLane.ts`'s docstring, when read, then it no longer says "every Claude-backed lane".

### Technical Notes

- Files: `lib/aiLane.ts`, `package.json`.
- Image parts are `{ inlineData: { mimeType, data } }` with raw base64; the `mediaType` comes from `lib/extract/imageMediaType.ts` (`ImageMediaType`) — do not re-declare MIME unions here.
- Response text is `response.text` (getter, `string | undefined`) — no content-block filtering, no `content[0]`.
- Gemini 3.x thinks by default and thinking tokens count against `maxOutputTokens`; set `thinkingConfig.thinkingLevel` explicitly or short budgets truncate before an answer exists.
- Pass `{ apiKey }` explicitly to `new GoogleGenAI(...)` even though it auto-reads the env var, so the gate and the client can't disagree.
- `parseJsonLoose` is the same "one shared matcher, not a third inline copy" rule that governs `roleMatch.ts` / `styleMatch.ts` (CLAUDE.md, PRD §2 principle 6).

### Dependencies

- Blocked by: —
- Blocks: DIST-035, DIST-036, DIST-037, DIST-040

---

## [DIST-035] Migrate `lib/interpret.ts` to `callModel` + native JSON mode

**Type**: Technical
**GitHub Label**: technical
**Priority**: High
**Complexity**: Small
**Phase**: 5 — AI lane migration
**Labels**: `technical`
**PRD trace**: §4 Planned bullet 3, §12 Phase 5 scope bullet 2

### Description

As a maintainer, I want the interpretation lane to call the shared `callModel` seam with native JSON
mode, so that identity/mood/color-role refinement no longer depends on the Anthropic SDK or a
brace-match regex.

### Acceptance Criteria

- [ ] Given `lib/interpret.ts`, when it is inspected, then it imports no SDK and `requestOnce` no longer takes a `client` parameter.
- [ ] Given `OUTPUT_SCHEMA`, `SYSTEM_PROMPT`, `groundingSummary`, `applyRoleRefinements`, and `MAX_INTERPRET_IMAGES`, when the migration lands, then they are unchanged — `OUTPUT_SCHEMA` passes through to `responseJsonSchema` verbatim.
- [ ] Given the token budget, when the migration lands, then `MAX_TOKENS` is raised from 1024 to 2048 with `thinkingLevel: MINIMAL`, and the stale `// No temperature knob on 4.8.` comment (`lib/interpret.ts:33`) is rewritten.
- [ ] Given a model response, when it is handled, then it goes `parseJsonLoose` → `aiResponseSchema.safeParse` — Zod remains the hard gate.
- [ ] Given `export { aiLaneAvailable };`, when the migration lands, then it is still exported (`eval/stability.ts` and `lib/analyze.ts` import it from here).
- [ ] Given the prompt-injection comment block, when the migration lands, then it is preserved verbatim — it is still accurate and load-bearing.
- [ ] Given `npm run lint && npm run typecheck && npm run eval`, when run, then all pass and `eval/baseline.json` is untouched.

### Technical Notes

- Files: `lib/interpret.ts`.
- Collapsed `requestOnce`: sniff media types → `callModel({ images, system: SYSTEM_PROMPT, user, jsonSchema: OUTPUT_SCHEMA, maxOutputTokens: MAX_TOKENS, thinkingLevel: MINIMAL })` → `parseJsonLoose` → `safeParse`.
- 1024 was sized for a non-thinking budget; thinking tokens now share it. `MINIMAL` is correct here — this lane is grounded on already-measured tokens, its job is explicitly not to reason hard.
- Do **not** touch `lib/analyze.ts`'s `enrichWithAI` merge semantics; AI output is merged *onto*, never *into*, measured fields.

### Dependencies

- Blocked by: DIST-034
- Blocks: DIST-038

---

## [DIST-036] Migrate structure Stage 7 to `callModel` and delete the latent `temperature: 0.1`

**Type**: Bug
**GitHub Label**: bug
**Priority**: High
**Complexity**: Medium
**Phase**: 5 — AI lane migration
**Labels**: `bug`, `structure-lane`, `technical`
**PRD trace**: §4 Planned bullets 3–4, §12 Phase 5 scope bullet 3, §14 risk "Graceful AI fallback hides real breakage"

### Description

As a maintainer, I want the AI structure-labelling stage migrated to `callModel` with its latent
`temperature: 0.1` removed, so that semantic naming can actually succeed instead of 400-ing twice and
silently falling back to heuristic names.

### Acceptance Criteria

- [ ] Given `lib/extract/structure/structureAI.ts:129`, when the migration lands, then `temperature: 0.1` is deleted — it is rejected with a 400 by current models, swallowed twice by `retryOnce`, and returns `null`.
- [ ] Given the file, when inspected, then it imports no SDK and `requestOnce` no longer takes a `client` parameter.
- [ ] Given a `STRUCTURE_SCHEMA` const, when compared to `aiStructureResponseSchema`, then it mirrors it — with `componentDefinitions` and `sectionDescriptions` (both `z.record`, open key sets) expressed as `{ type: "object", additionalProperties: { … } }`.
- [ ] Given response handling, when the migration lands, then `message.content[0]` + `text.match(/\{[\s\S]*\}/)` (`structureAI.ts:133-134`) are both replaced by `parseJsonLoose`.
- [ ] Given the token budget, when the migration lands, then `maxOutputTokens` is raised above 3000 (this lane emits one entry per tree node plus section descriptions, and thinking tokens now share the budget) with `thinkingLevel: LOW`.
- [ ] Given `forceHeuristicNaming`, when the migration lands, then the short-circuit still sits **ahead of** the `aiLaneAvailable()` check, and its comment no longer names the Anthropic client or `ANTHROPIC_API_KEY`.
- [ ] Given `GEMINI_API_KEY` is set in the environment, when `npm run eval` runs, then it makes zero network calls and the baseline is untouched.

### Technical Notes

- Files: `lib/extract/structure/structureAI.ts`.
- `callModel({ user: prompt, maxOutputTokens: >3000, jsonSchema: STRUCTURE_SCHEMA, thinkingLevel: LOW })` — no `system`, matching the current single-user-message shape.
- The `forceHeuristicNaming` ordering is the load-bearing invariant of this story: it is what keeps `npm run eval` offline and deterministic once a key exists in the dev environment (PRD §11, second unchecked criterion).
- Reading only `content[0]` was a latent bug independent of the provider — `parseJsonLoose` retires it.

### Dependencies

- Blocked by: DIST-034
- Blocks: DIST-038

---

## [DIST-037] Migrate the vision structure lane and retire its hand-written media-type union

**Type**: Bug
**GitHub Label**: bug
**Priority**: High
**Complexity**: Medium
**Phase**: 5 — AI lane migration
**Labels**: `bug`, `structure-lane`, `technical`
**PRD trace**: §4 Planned bullets 3–5, §12 Phase 5 scope bullet 4

### Description

As a maintainer, I want the vision structure-from-image lane migrated to `callModel` with its
`temperature: 0.1` and duplicate MIME-type union removed, so that image uploads in `structure` mode
produce an inferred skeleton instead of a `structureUnavailableReason`, and MIME types have exactly
one owner.

### Acceptance Criteria

- [ ] Given `lib/extract/structureFromImage.ts:101`, when the migration lands, then `temperature: 0.1` is deleted.
- [ ] Given the file, when inspected, then it imports no SDK, `requestOnce` no longer takes a `client` parameter, and the hand-written Anthropic media-type union is gone — `lib/extract/imageMediaType.ts` is the only owner of MIME types in the codebase.
- [ ] Given `text.match(/\{[\s\S]*\}/)` (`structureFromImage.ts:118`), when the migration lands, then it is replaced by `parseJsonLoose`, followed by `aiVisionStructureResponseSchema.safeParse`.
- [ ] Given the recursive `aiVisionNodeSchema` (via `z.lazy`), when a `$defs`/`$ref` JSON Schema is attempted, then it either works (legal — cyclic refs are permitted on non-required properties, and `children` is optional) or falls back to `responseMimeType: "application/json"` with no schema; **this must not block the story** — Zod is the real gate and the prompt already specifies the shape.
- [ ] Given the call, when the migration lands, then it uses `thinkingLevel: MEDIUM` — this is the lane most at risk moving off a frontier vision model.
- [ ] Given the file docstring, when read, then "gated entirely on `ANTHROPIC_API_KEY`" reads `GEMINI_API_KEY`.
- [ ] Given a produced skeleton, when emitted, then it is still stamped `fidelity: "inferred"` with no heuristic fallback path introduced.

### Technical Notes

- Files: `lib/extract/structureFromImage.ts`.
- `callModel({ images, system: SYSTEM_PROMPT, user: "Infer the layout skeleton…", maxOutputTokens: MAX_TOKENS, thinkingLevel: MEDIUM })`.
- Supported Gemini image MIME types (png, jpeg, webp, heic, heif) are a superset of what `imageMediaType.ts` emits, so no logic change is needed there — only the comment (DIST-038).
- Quality spot-check belongs to DIST-039; this story lands the code path.

### Dependencies

- Blocked by: DIST-034
- Blocks: DIST-038

---

## [DIST-038] Remove `@anthropic-ai/sdk` and sweep provider references out of docs and eval

**Type**: Technical
**GitHub Label**: technical
**Priority**: High
**Complexity**: Small
**Phase**: 5 — AI lane migration
**Labels**: `technical`, `documentation`, `cleanup`
**PRD trace**: §12 Phase 5 scope bullets 5–7, §9 config table

### Description

As a maintainer, I want the Anthropic dependency removed and every provider/key reference updated
across docs and eval scripts, so that the codebase names exactly one provider and a new contributor
is told to get a free Gemini key.

### Acceptance Criteria

- [ ] Given `package.json`, when the story lands, then `@anthropic-ai/sdk` is removed, `@google/genai` ^2.13.0 remains, `npm install` has been run, and `package-lock.json` is updated.
- [ ] Given `grep -rn "ANTHROPIC\|@anthropic-ai" --exclude-dir=node_modules .` (excluding historical `.agents/` artifacts), when run, then it returns no hits in `lib/`, `app/`, `eval/`, `README.md`, `CLAUDE.md`, or `package.json`.
- [ ] Given `README.md` (~lines 46, 62, 122), when read, then it says "Google Gemini API Key", uses `GEMINI_API_KEY=...` in the `.env.local` and `docker run -e` examples, and notes the key is free from https://aistudio.google.com/apikey with no credit card.
- [ ] Given `CLAUDE.md` (lines ~61 and ~80), when read, then "Every Claude-backed lane…" and "gated entirely on `ANTHROPIC_API_KEY`" are updated, and `callModel` is listed among the `lib/aiLane.ts` primitives the one-seam rule covers.
- [ ] Given `eval/stability.ts` (lines 16, 93) and `eval/run.ts` (lines 61-62), when read, then the skip message and comment name Gemini, not Anthropic.
- [ ] Given `lib/extract/imageMediaType.ts`, when read, then the comment names Gemini and **no logic changed** — the four returned values are already valid Gemini MIME types.
- [ ] Given `.agents/temp/AI-LANE-NOTES.md`, when the story lands, then it is deleted (gitignored scratch; stale advisory notes invite re-litigating settled decisions).
- [ ] Given `npm run lint && npm run typecheck && npm run eval`, when run, then all pass and `eval/baseline.json` is untouched.

### Technical Notes

- Files: `package.json`, `package-lock.json`, `README.md`, `CLAUDE.md`, `eval/stability.ts`, `eval/run.ts`, `lib/extract/imageMediaType.ts`, delete `.agents/temp/AI-LANE-NOTES.md`.
- **No `app/` changes** — the route and UI never reference a provider, model id, or key. If this story finds itself editing `app/`, something leaked across the seam.
- Also worth updating: PRD §8 tech-stack row and §9 config table, which still carry "Today / Phase 5" dual wording.
- Consider documenting the free-tier data-use caveat (PRD §9 "Data-handling note") in the README's hardening guide, since operators pick a tier at deploy time.

### Dependencies

- Blocked by: DIST-035, DIST-036, DIST-037
- Blocks: DIST-039

---

## [DIST-039] First live end-to-end verification of all three AI lanes

**Type**: Technical
**GitHub Label**: technical
**Priority**: High
**Complexity**: Medium
**Phase**: 5 — AI lane migration
**Labels**: `technical`, `eval`, `provenance`
**PRD trace**: §11 both unchecked functional requirements, §12 Phase 5 validation, §5 user stories 10–11

### Description

As a maintainer, I want the AI lane exercised live end-to-end for the first time in this project's
history, so that "the feature works" is verified rather than assumed — the graceful fallback has hidden
total breakage since day one.

### Acceptance Criteria

- [ ] Given `GEMINI_API_KEY` set in `.env.local` and a restarted dev server, when a real URL is analyzed in `both` mode, then the design report carries `identity` + `imageMood` at `provenance: ai`.
- [ ] Given the same run, when the structure report is read, then it shows `naming: "ai"` (not `"heuristic"`) and the page-sections digest carries per-section `description`s.
- [ ] Given an image uploaded in `structure` mode with a key set, when the response returns, then it carries a `fidelity: "inferred"` skeleton and **no** `structureUnavailableReason`.
- [ ] Given the server console during all of the above, when inspected, then it shows no `AI Structure Labeller failed` / `Vision structure inference failed` warnings — a silent heuristic fallback is precisely the failure mode this migration exists to end.
- [ ] Given `GEMINI_API_KEY` is set, when `npm run eval` runs, then it passes fully offline (zero network calls) with `eval/baseline.json` untouched, and `UPDATE_BASELINE=1` was **not** run.
- [ ] Given `npm run eval:ai`, when run, then it executes for the first time instead of printing the skip message, and meets its Jaccard stability floors (0.5 adjectives / 0.3 archetype).
- [ ] Given the vision-lane output, when spot-checked, then the inferred layout skeleton is qualitatively sound; any degradation is recorded in a report under `.agents/reports/` rather than silently accepted.

### Technical Notes

- The measured lane is provider-independent, so **any** eval score movement means something leaked across the measured/AI split — investigate, don't refresh the baseline.
- **Free-tier rate limits (~10 RPM) will bite before cost does.** A `both`-mode run fires two AI calls and sends up to four images; bursty manual testing will 429. `retryOnce` treats a 429 as a failure and falls back, so a rate-limited run looks *identical* to a quality regression. Check the console before concluding the model is bad; the response cache absorbs repeats.
- Free-tier prompts are used for Google product improvement — verify against public third-party sites, not sensitive properties (PRD §9 data-handling note).
- Deliverable: a short report in `.agents/reports/` recording what each lane actually produced, so the "never verified" gap closes with evidence.

### Dependencies

- Blocked by: DIST-038
- Blocks: —

---

## [DIST-040] Make AI-lane failure distinguishable from "no key configured"

**Type**: Enhancement
**GitHub Label**: enhancement
**Priority**: Medium
**Complexity**: Small
**Phase**: 5 — AI lane migration
**Labels**: `enhancement`, `technical`, `provenance`
**PRD trace**: §5 technical user story 11, §14 risk "Graceful AI fallback hides real breakage"

> **Scope note:** this story is derived from PRD §5 user story 11 and the §14 risk row, both of which
> tag the problem as Phase 5. It is **not** an explicit bullet in §12's Phase-5 scope list, where the
> stated mitigation is process-level ("console warnings must be checked, not assumed absent").
> Drop it if you'd rather keep Phase 5 a pure like-for-like migration.

### Description

As a maintainer, I want a lane that fails *with* a key configured to log differently from a lane that
was never enabled, so that a broken request parameter can't silently disable a feature for months
again.

### Acceptance Criteria

- [ ] Given no API key is configured, when an AI lane is skipped, then nothing is logged as an error — this is the documented, expected degrade path.
- [ ] Given a key **is** configured and a call fails both attempts, when the lane falls back, then exactly one clearly-worded warning is emitted naming the lane and the underlying error.
- [ ] Given a 429 (rate limit) versus a 400 (bad request), when either occurs, then the warning distinguishes them, so a free-tier throttle is not mistaken for a quality regression.
- [ ] Given the report contract, when this story lands, then no schema field is added or changed and no measured value is affected — this is observability only.
- [ ] Given `npm run eval`, when run, then it passes with the baseline untouched and stays silent (no key path, no new noise).

### Technical Notes

- Natural home is the `onError` hook `retryOnce` already exposes in `lib/aiLane.ts`, plus the existing call-site warnings (`AI Structure Labeller failed`, `Vision structure inference failed`).
- Keep it to server-side logging: the AI key and its failures are server-side concerns and must not reach the client (PRD §9).
- Resist growing this into a health endpoint or a UI surface — the PRD's failure mode is "invisible in the console", not "invisible in the product".

### Dependencies

- Blocked by: DIST-034
- Blocks: —

---

## [DIST-044] SSRF redirect hardening on HTTP 301/302 redirects

**Type**: Bug
**GitHub Label**: bug
**Priority**: High
**Complexity**: Medium
**Phase**: 5 — Audit & Hardening
**Labels**: `bug`, `security`, `ingestion`
**PRD trace**: §4 Planned (SSRF redirect hardening), §9 (security posture), §12 Phase 5 scope (`lib/ingest.ts`), CODEBASE_ANALYSIS.md §3.1 issue 2

### Description

As a deployer of a public Distill instance, I want Playwright to validate the resolved IP of all HTTP 301/302 redirect targets against `assertSafeUrl`, so that malicious URLs cannot bypass SSRF validation via redirects to internal/private network targets.

### Acceptance Criteria

- [ ] Given a target URL that issues an HTTP 301/302 redirect, when `renderUrl` processes the navigation in `lib/ingest.ts`, then the target redirect URL is intercepted and validated via `assertSafeUrl(targetUrl)`.
- [ ] Given a redirect pointing to a loopback (`127.0.0.1`, `::1`), RFC1918 private subnet, link-local, CGNAT, or reserved IP range, when encountered during render, then navigation is immediately aborted and an `UnsafeUrlError` is thrown before loading any redirect response body.
- [ ] Given a redirect to an allowlisted hostname in `SSRF_ALLOWLIST_HOSTS`, when encountered, then the redirect is permitted.
- [ ] Given `npm run eval`, when run, then offline eval captures pass unchanged.

### Technical Notes

- Intercept using Playwright's `page.on('response', ...)` or route handlers (`page.route('**/*', ...)`) in `lib/ingest.ts`.
- Perform IP validation on `response.headers()['location']` or request redirect targets before full response body load.
- Ensure no loopback or internal metadata endpoints (e.g. `http://169.254.169.254/`) can be read via redirect.

### Dependencies

- Blocked by: —
- Blocks: —

---

## [DIST-045] Dynamic contextual action labels & meta panel key hint in `app/page.tsx`

**Type**: Feature
**GitHub Label**: enhancement
**Priority**: Medium
**Complexity**: Small
**Phase**: 5 — UI Polish
**Labels**: `enhancement`, `frontend`, `ui`
**PRD trace**: §4 Planned (UI polish), §12 Phase 5 scope (`app/page.tsx`)

### Description

As a user of the Distill workbench, I want the "Copy" and "Download" button labels in `app/page.tsx` to dynamically adapt to whichever report tab is currently active (Design System vs Structure), and I want a clear setup hint for configuring `GEMINI_API_KEY` in the meta panel.

### Acceptance Criteria

- [ ] Given `activeTab === "design"`, when viewing the workbench action buttons, then the copy button reads `"Copy Design System .md"` and the download button reads `"Download Design System .md"`.
- [ ] Given `activeTab === "structure"`, when viewing the workbench action buttons, then the copy button reads `"Copy Structure .md"` and the download button reads `"Download Structure .md"`.
- [ ] Given line 162 in `app/page.tsx`, when inspected, then the legacy TODO comment is cleanly resolved.
- [ ] Given the meta header panel in the UI, when rendered, then a concise, non-intrusive setup hint for enabling optional AI enrichment via `GEMINI_API_KEY` is present.
- [ ] Given `npm run lint && npm run typecheck`, when run, then both pass with zero errors.

### Technical Notes

- Files: `app/page.tsx`.
- Keep button styling and tab behavior identical, changing only button label text based on active tab state.
- Meta panel key hint should mention free-tier keys at https://aistudio.google.com/apikey.

### Dependencies

- Blocked by: —
- Blocks: —

---

## [DIST-046] Automated GitHub Actions CI workflow (`.github/workflows/ci.yml`)

**Type**: Infra
**GitHub Label**: technical
**Priority**: High
**Complexity**: Small
**Phase**: 5 — CI/CD
**Labels**: `technical`, `infra`, `ci`
**PRD trace**: §4 Planned (Automated CI/CD), §12 Phase 5 scope (`.github/workflows/ci.yml`)

### Description

As a maintainer, I want a GitHub Actions CI workflow created at `.github/workflows/ci.yml` that runs type checking, linting, and offline eval regression tests on PRs and main pushes, so that breaking changes cannot land undetected.

### Acceptance Criteria

- [ ] Given `.github/workflows/ci.yml`, when created, then it triggers on `push` to `main` and `pull_request` targeting `main`.
- [ ] Given a workflow run, when executed on GitHub Actions, then Node.js 20 is configured, dependencies are installed cleanly (`npm ci`), Playwright Chromium browser binaries are installed (`npx playwright install --with-deps chromium`), and `npm run typecheck`, `npm run lint`, and `npm run eval` are executed in order.
- [ ] Given any failure in `typecheck`, `lint`, or `eval`, when executed in CI, then the job fails closed.
- [ ] Given `eval/baseline.json`, when verified in CI, then the offline eval harness enforces the floor without network calls.

### Technical Notes

- File: `.github/workflows/ci.yml`.
- Keep the workflow minimal and fast. Node caching (`actions/setup-node` with `cache: 'npm'`) is recommended.

### Dependencies

- Blocked by: —
- Blocks: —

---

# Phase 6 — Spiked, GO'd, not yet built

All three carry a completed spike report with evidence and a GO recommendation. Each is implementation
under the existing optional-lane contract (optional field + own `provenance` + conditional `render*`),
and each is independent of the others and of Phase 5.

## [DIST-041] Motion/transition token lane

**Type**: Feature
**GitHub Label**: enhancement
**Priority**: Medium
**Complexity**: Medium
**Phase**: 6 — spiked, GO'd
**Labels**: `enhancement`, `extraction`, `tokens-lane`, `schema`
**PRD trace**: §12 Phase 6 bullet 1 · Spike: `.agents/reports/motion-spike.md` (GO)

### Description

As a frontend developer, I want declared CSS transitions and animations extracted as a motion token
lane attributed per recipe element class, so that a rebuilt component moves like the original instead
of being statically correct but lifeless.

### Acceptance Criteria

- [ ] Given a page with declared `transition-*` / `animation-*` properties, when it is analyzed, then a motion lane is emitted with per-property `durationMs`, `timingFunction`, and `delayMs`, stamped `provenance: measured`.
- [ ] Given `transition: background-color .2s ease-in-out, transform .15s cubic-bezier(0.4, 0, 0.2, 1)`, when parsed, then both entries are recovered intact — a paren-depth-aware splitter is used, because naive `.split(",")` breaks on the internal commas in `cubic-bezier(…)`.
- [ ] Given `@keyframes` definitions, when collected, then they piggyback on the **existing** stylesheet iteration already used for `:hover`/`:focus` scanning — no second page pass, no new capture field beyond the dump record.
- [ ] Given a node whose only interesting property is motion, when the style dump records it, then it is not dropped — the record-skip gate in `lib/extract/styleDump.ts` gains exactly one new condition.
- [ ] Given a page with no declared motion, when it is analyzed, then the motion section is **omitted entirely** — no empty block, no defaulted durations.
- [ ] Given JS-driven motion (scroll-triggered, animation libraries), when it is not visible to computed-style reads, then this is documented as an honest, expected gap rather than worked around.
- [ ] Given `npm run eval`, when run, then it passes with the baseline untouched — the lane is additive and old committed captures simply don't populate it.

### Technical Notes

- Files: `lib/extract/styleDump.ts` (one skip condition), new `lib/extract/motion.ts`, `lib/schema.ts`, `lib/emit.ts` (`renderMotion` called only `if (report.motion)`).
- Declared transitions read cleanly off `getComputedStyle` — no `var()`-resolution workaround needed (unlike `states.ts`'s CSSOM rule-text reads).
- Attribution is *simpler* than `states.ts`: `recipes.ts`'s `classify()` never depends on color, so element-class attribution needs no palette round-trip.
- Verify against a synthetic fixture + local server per CLAUDE.md "Manually verifying extraction changes"; do **not** refresh eval captures to exercise this lane.

### Dependencies

- Blocked by: —
- Blocks: —

---

## [DIST-042] `emitTailwindTheme(report)` — a second derived view + download button

**Type**: Feature
**GitHub Label**: enhancement
**Priority**: Medium
**Complexity**: Medium
**Phase**: 6 — spiked, GO'd
**Labels**: `enhancement`, `emit`, `codegen`, `frontend`
**PRD trace**: §12 Phase 6 bullet 2 · Spike: `.agents/reports/tailwind-theme-spike-report.md` (GO)

### Description

As a frontend developer, I want a downloadable Tailwind v4 `@theme` file derived from the report
frontmatter, so that I can drop a measured design system straight into a new project instead of
hand-transcribing it.

### Acceptance Criteria

- [ ] Given a `Report`, when `emitTailwindTheme(report)` runs, then every emitted line traces 1:1 to an existing frontmatter field — **zero new schema surface, zero invented values**.
- [ ] Given `spacing.baseUnitPx`, when emitted, then it maps to `--spacing: <baseUnitPx>px` (**not** positional `--spacing-1..n`, which silently shadows Tailwind's numeric `p-1`/`p-2` utilities and produces a non-monotonic scale).
- [ ] Given `typography.scale[]`, when emitted, then each token uses the v4 sub-key syntax (`--text-<token>` plus `--text-<token>--line-height` / `--font-weight` / `--letter-spacing`) so one `text-h1` utility applies all four measured properties.
- [ ] Given `paletteDark` is present, when emitted, then a `@media (prefers-color-scheme: dark) { :root { --color-* } }` block is appended **after** the `@theme` block; given `paletteDark` is absent, then no dark block is emitted at all.
- [ ] Given a lane that was never measured (e.g. `elevation.shadows: []`), when emitted, then its section is absent — asserted, not eyeballed.
- [ ] Given the generated file, when built in a fresh Tailwind v4 project, then it compiles and `bg-primary`, `text-h1`, `rounded-1`, `p-4` appear in the output CSS with the measured values.
- [ ] Given the workbench UI, when a report is present, then a second download button offers the theme file alongside the existing Markdown download.
- [ ] Given `npm run eval`, when run, then it passes with the baseline untouched.

### Technical Notes

- Files: `lib/emit.ts` (new `emitTailwindTheme` export), `app/page.tsx` (second download button), possibly `app/api/analyze/route.ts` if the theme is returned rather than derived client-side.
- Tailwind `@theme` flavor **only** — the spike scoped surface (a); don't broaden to other frameworks.
- Header comment traces to `source.ref` + `source.capturedAt`, both existing frontmatter fields.
- Fields with no honest mapping are omitted, never defaulted — same contract as `renderCssVariables`.
- This is the MVP-scoped slice of PRD §4's out-of-scope "direct code generation"; component generation stays out.

### Dependencies

- Blocked by: —
- Blocks: —

---

## [DIST-043] Cross-origin hover/focus state capture (Strategy A)

**Type**: Enhancement
**GitHub Label**: enhancement
**Priority**: Medium
**Complexity**: Large
**Phase**: 6 — spiked, GO'd
**Labels**: `enhancement`, `extraction`, `tokens-lane`
**PRD trace**: §4 In-Scope states bullet, §7 States row, §12 Phase 6 bullet 3 · Spike: `.agents/reports/cross-origin-states-spike.md` (GO, Strategy A / variant a2)

### Description

As a design engineer, I want hover/focus deltas recovered from cross-origin stylesheets, so that sites
serving CSS from a CDN produce a real `## States` section instead of silently omitting the lane.

### Acceptance Criteria

- [ ] Given a page with a `<link>`ed cross-origin stylesheet that throws `SecurityError` on `.cssRules`, when it is analyzed, then the sheet is re-fetched via `context.request` and re-parsed, and the affected nodes come back with `states` populated.
- [ ] Given the recovered deltas, when compared to the same rules served same-origin, then they are identical — the declared values, not simulated or applied ones.
- [ ] Given the downstream pipeline, when this story lands, then `states.ts` aggregation, `lib/schema.ts`, the emit path, and the `capture.json` shape are all **byte-identical** — this widens coverage without changing semantics.
- [ ] Given a sheet that cannot be re-fetched (404, auth-walled, network error), when the fetch fails, then it is skipped best-effort and the affected nodes simply have no `states` — failure degrades to absence, never to a guess.
- [ ] Given a site with genuinely no hover/focus rules, when it is analyzed, then `## States` is still omitted entirely.
- [ ] Given `npm run eval`, when run, then it passes with the baseline untouched — no capture-shape change means no fixture refresh.

### Technical Notes

- Files: `lib/ingest.ts` (the `context.request` re-fetch belongs at the ingestion seam, alongside the other best-effort second passes), `lib/extract/styleDump.ts:401-409` (the silent-skip site).
- **Strategy A variant a2 (`context.request` re-fetch)** was chosen over route interception, CDP `CSS.forcePseudoState` (B), and CDP `getStyleSheetText` (C): it is the only candidate that widens coverage while leaving declared-never-simulated semantics and the capture shape unchanged.
- B is the documented fallback if *applied*-measurement semantics are ever wanted deliberately; C is a viable acquisition alternative if re-fetching proves unreliable against real CDNs. Record which was used if A is abandoned.
- The re-fetch is a network call made from the ingestion seam — confirm it does not create a new SSRF surface beyond what the rendered page already requests, and note the interaction with the README's egress-filtering guidance.
- Verify with the spike's two-origin local fixture pattern (page on one port, CORS-header-less CSS on another), driving Playwright directly per `eval/capture.ts`.

### Dependencies

- Blocked by: —
- Blocks: —

---

## Coverage check (PRD requirement → story)

| PRD item | Story |
|---|---|
| §4 Planned: replace SDK, `AI_MODEL`, `GEMINI_API_KEY` gate | DIST-034 |
| §4 Planned: `callModel` + shared `parseJsonLoose` | DIST-034 |
| §4 Planned: native JSON mode across all three lanes | DIST-035, DIST-036, DIST-037 |
| §4 Planned: delete latent `temperature: 0.1` (both sites) | DIST-036, DIST-037 |
| §4 Planned: retire hand-written media-type union | DIST-037 |
| §4 Planned / §11: first-ever live verification | DIST-039 |
| §11: eval stays offline with a key set | DIST-036 (invariant), DIST-039 (verified) |
| §12 P5: `imageMediaType.ts` comment rename | DIST-038 |
| §12 P5: deps + README/CLAUDE.md/eval doc sweep | DIST-038 |
| §12 P5: retire `.agents/temp/AI-LANE-NOTES.md` | DIST-038 |
| §5 story 11: AI failures visible, not indistinguishable | DIST-040 *(inferred — see scope note)* |
| §12 P6: motion/transition lane | DIST-041 |
| §12 P6: `emitTailwindTheme(report)` | DIST-042 |
| §12 P6: cross-origin state capture | DIST-043 |
| §4 Planned / §12 P5: SSRF redirect hardening (`lib/ingest.ts`) | DIST-044 |
| §4 Planned / §12 P5: UI polish & active tab labels (`app/page.tsx`) | DIST-045 |
| §4 Planned / §12 P5: Automated GitHub Actions CI workflow (`.github/workflows/ci.yml`) | DIST-046 |
| §4 Out of Scope (deferred), §13 Future Considerations | *no story — deliberately deferred* |

**Validation:** all Phase-1–4 PRD items are `[x]` delivered and already tracked by closed issues
#2–#39 (DIST-001 … DIST-033); no story duplicates them. The dependency graph is a DAG. Every story is
independently reviewable and mergeable with `npm run lint`, `npm run typecheck`, and `npm run eval`
green — the last of these with `eval/baseline.json` **untouched** in every Phase-5 story, since the
measured lane is provider-independent.

---

## [DIST-047] Add OpenRouter API support as an alternative vision AI model provider in `lib/aiLane.ts`

**Type**: Technical
**GitHub Label**: technical
**Priority**: Medium
**Complexity**: Medium
**Phase**: Phase 5: AI Lane Enhancements & Fallbacks
**Labels**: `technical`, `infra`

### Description

As a user or developer, I want `lib/aiLane.ts` to support OpenRouter API keys (`OPENROUTER_API_KEY`) as an alternative or fallback provider, so that AI vision analysis can run flexibly across multiple models (e.g. `google/gemini-2.5-flash`, `openai/gpt-4o-mini`, `anthropic/claude-3.5-sonnet`) without being blocked by Google AI Studio free-tier rate limits (429 Quota Exceeded).

### Acceptance Criteria

- [ ] Given `OPENROUTER_API_KEY` is set in environment variables, when `aiLaneAvailable()` is called, then it returns `true`.
- [ ] Given `callModel(opts)` is invoked with an `OPENROUTER_API_KEY` set, when making the API call, then it sends an OpenAI-compatible Chat Completions request to `https://openrouter.ai/api/v1/chat/completions` with base64 data-URL image parts, system instructions, and JSON response format options.
- [ ] Given `process.env.OPENROUTER_MODEL` is set, when `callModel` runs via OpenRouter, then it uses the specified model ID (defaulting to `google/gemini-2.5-flash`).
- [ ] Given neither `OPENROUTER_API_KEY` nor `GEMINI_API_KEY` is set, when `aiLaneAvailable()` is called, then it returns `false` and gracefully degrades without throwing unhandled exceptions.
- [ ] Given `npm run typecheck` and `npm run lint`, when run, then both pass with zero errors.

### Technical Notes

- Files to modify: `lib/aiLane.ts`
- Implement `callModel` branching based on `OPENROUTER_API_KEY` vs `GEMINI_API_KEY`.
- Format image inputs for OpenRouter as `{ type: "image_url", image_url: { url: "data:<mime>;base64,<data>" } }`.
- Ensure native JSON schema / JSON mode options match OpenRouter's `{ type: "json_object" }` or schema parameters.

### Dependencies

- Blocked by: None
- Blocks: None

