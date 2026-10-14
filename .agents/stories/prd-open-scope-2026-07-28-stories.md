# Stories — Distill PRD open scope (2026-07-28)

**Source PRD**: `.agents/PRDs/PRD.md` (refreshed 2026-07-28)
**Companion plan**: `.agents/plans/from-claude-to-gemini-plan.md` (source of truth for Phase 5)
**Last Updated**: 2026-10-14

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

## Status

All 14 stories are done: each issue is closed as completed and each pull request is merged into `main`. No issue or pull request of this file is still open. DIST-047 has no `**GitHub**` line and no ID in its issue title; it is matched to #94 by its title.

| Story | Issue | Pull request | Phase | Status | Acceptance criteria ticked |
| --- | --- | --- | --- | --- | --- |
| DIST-034 Gemini `callModel` seam | #68 | #78 | 5 | done | 3 of 7 |
| DIST-035 Interpret on `callModel` | #69 | #79 | 5 | done | 4 of 7 |
| DIST-036 Stage 7 on `callModel` | #70 | #80 | 5 | done | 6 of 7 |
| DIST-037 Vision lane on `callModel` | #71 | #81 | 5 | done | 5 of 7 |
| DIST-038 Drop Anthropic SDK | #72 | #82 | 5 | done | 6 of 8 |
| DIST-039 Live AI-lane verification | #73 | #83 | 5 | done | 5 of 7 |
| DIST-040 AI failure vs no key | #74 | #84 | 5 | done | 4 of 5 |
| DIST-044 SSRF redirect hardening | #88 | #91 | 5 | done | 3 of 4 |
| DIST-045 Action labels + key hint | #89 | #92 | 5 | done | 3 of 5 |
| DIST-046 CI workflow | #90 | #93 | 5 | done | 4 of 4 |
| DIST-041 Motion lane | #75 | #85 | 6 | done | 7 of 7 |
| DIST-042 `emitTailwindTheme` | #76 | #86 | 6 | done | 7 of 8 |
| DIST-043 Cross-origin states | #77 | #87 | 6 | done | 6 of 6 |
| DIST-047 OpenRouter support | #94 | #95 | 5 | done | 5 of 5 |

The criteria were checked on 2026-10-14 against the code at `4291324`, with offline `npm run typecheck`, `npm run lint` and `npm run eval` runs (all passed); the product was not run and no model was called. A criterion that only a live run can show rests on the validation sections of the implementation reports in `.agents/reports/`, where the code still holds the behaviour. Most unticked criteria name the native Gemini path (`@google/genai`, `GEMINI_API_KEY`, `thinkingLevel`), which #199 removed on purpose; the AI lane now runs over OpenRouter only. A ticked box means the code satisfies the criterion now, an unticked box carries a note with what differs, and an As Built section records where the result differs from the text or where it lives. Plans are in `.agents/plans/completed/`, reviews in `.agents/reviews/`.

### Open Items Without a Story

**Open GitHub issues that no story names**

- #156 [TODO-1] Handle inaccessible URLs, bot-blocks, and view-obscuring overlays gracefully
- #158 [TODO-3] Investigate secure local distribution and sharing models (Docker / BYOK)
- #166 [TODO-1] Spike: bypass or detect view-obscuring overlays, cookie walls, and paywalls before capture

# Phase 5 — AI lane migration (Claude → Gemini)

## [DIST-034] Rebuild `lib/aiLane.ts` on `@google/genai` with a `callModel` primitive

**Type**: Technical
**GitHub Label**: technical
**Priority**: High
**Complexity**: Medium
**Phase**: 5 — AI lane migration
**Labels**: `technical`, `infra`
**PRD trace**: §4 Planned bullets 1–2, §12 Phase 5 scope bullet 1
**Status**: done — issue closed, PR #78 merged. 4 criteria are not met.

### Description

As a maintainer, I want the single AI provider seam rebuilt on the Gemini SDK with a `callModel`
primitive, so that all three AI lanes can migrate without any of them importing an SDK or re-inlining
JSON extraction.

### Acceptance Criteria

- [ ] Given `@google/genai` ^2.13.0 is added as a dependency (`@anthropic-ai/sdk` stays installed for now), when `npm run typecheck` runs, then it passes with no call-site changes yet.
  - *Not met:* the native Gemini path was removed in #199; `package.json` carries no model SDK, neither `@google/genai` nor `@anthropic-ai/sdk`.
- [ ] Given `lib/aiLane.ts`, when it is inspected, then `AI_MODEL === "gemini-2.5-flash"` (with optional `process.env.GEMINI_MODEL` fallback) and `aiLaneAvailable()` returns `Boolean(process.env.GEMINI_API_KEY)`.
  - *Not met:* the native Gemini path was removed in #199. `aiLaneAvailable()` returns `Boolean(process.env.OPENROUTER_API_KEY)`, and the model is `OPENROUTER_MODEL` with the default `google/gemini-3.5-flash`; there is no `AI_MODEL` constant and no `GEMINI_MODEL`.
- [ ] Given `callModel(opts)` is exported, when it is called, then it accepts `{ images?, system?, user, jsonSchema?, maxOutputTokens, thinkingLevel? }` and returns `string | null`, constructing exactly one module-level `GoogleGenAI` client (lazily) rather than one per retry.
  - *Not met:* `ModelCall` takes `{ images?, system?, user, jsonSchema?, maxOutputTokens, temperature?, seed? }` with no `thinkingLevel`, and `callModel` sends one `fetch` per call; there is no `GoogleGenAI` client.
- [ ] Given `jsonSchema` is supplied, when the request is built, then `config` carries both `responseMimeType: "application/json"` and `responseJsonSchema` (never `responseSchema`, and never both).
  - *Not met:* a `jsonSchema` is sent as a non-strict `response_format: { type: "json_schema" }` to OpenRouter, not as `responseMimeType`/`responseJsonSchema`.
- [x] Given `parseJsonLoose(text)` is exported, when passed clean JSON, a fenced/preambled JSON blob, or `null`, then it returns the parsed object, the parsed object, and `null` respectively.
- [x] Given `retryOnce`, when the migration lands, then its signature and behaviour are byte-identical to before — this story changes the provider, not the fallback policy.
- [x] Given `lib/aiLane.ts`'s docstring, when read, then it no longer says "every Claude-backed lane".

### Technical Notes

- Files: `lib/aiLane.ts`, `package.json`.
- Image parts are `{ inlineData: { mimeType, data } }` with raw base64; the `mediaType` comes from `lib/extract/imageMediaType.ts` (`ImageMediaType`) — do not re-declare MIME unions here.
- Response text is `response.text` (getter, `string | undefined`) — no content-block filtering, no `content[0]`.
- Gemini 3.x thinks by default and thinking tokens count against `maxOutputTokens`; set `thinkingConfig.thinkingLevel` explicitly or short budgets truncate before an answer exists.
- Pass `{ apiKey }` explicitly to `new GoogleGenAI(...)` even though it auto-reads the env var, so the gate and the client can't disagree.
- `parseJsonLoose` is the same "one shared matcher, not a third inline copy" rule that governs `roleMatch.ts` / `styleMatch.ts` (CLAUDE.md, PRD §2 principle 6).

### As Built

- `lib/aiLane.ts` is the one provider seam: `aiLaneAvailable`, `callModel`, `parseJsonLoose`, `retryOnce` and `warnAiFailure`; the provider is OpenRouter's `/chat/completions` over plain `fetch` (#199).
- `callModel` throws on a missing key, a non-2xx status and an HTTP 200 body holding an `error` object (#207), so each failure reaches `retryOnce`'s `onError`.
- A lane may set `temperature` and `seed`; a seeded call prefers the `google-ai-studio` provider with fallbacks allowed (#209).

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
**Status**: done — issue closed, PR #79 merged. 3 criteria are not met.

### Description

As a maintainer, I want the interpretation lane to call the shared `callModel` seam with native JSON
mode, so that identity/mood/color-role refinement no longer depends on the Anthropic SDK or a
brace-match regex.

### Acceptance Criteria

- [x] Given `lib/interpret.ts`, when it is inspected, then it imports no SDK and `requestOnce` no longer takes a `client` parameter.
- [ ] Given `OUTPUT_SCHEMA`, `SYSTEM_PROMPT`, `groundingSummary`, `applyRoleRefinements`, and `MAX_INTERPRET_IMAGES`, when the migration lands, then they are unchanged — `OUTPUT_SCHEMA` passes through to `responseJsonSchema` verbatim.
  - *Not met:* `OUTPUT_SCHEMA` is no longer a hand-written constant: it is generated with `z.toJSONSchema(aiResponseSchema)` (#177).
- [ ] Given the token budget, when the migration lands, then `MAX_TOKENS` is raised from 1024 to 2048 with `thinkingLevel: MINIMAL`, and the stale `// No temperature knob on 4.8.` comment (`lib/interpret.ts:33`) is rewritten.
  - *Not met:* `MAX_TOKENS` is `2048` and the stale comment is gone, but the native Gemini path was removed in #199 and `thinkingLevel` with it; the lane sends `temperature: 0` and `seed: 7` instead (#200, #209).
- [x] Given a model response, when it is handled, then it goes `parseJsonLoose` → `aiResponseSchema.safeParse` — Zod remains the hard gate.
- [x] Given `export { aiLaneAvailable };`, when the migration lands, then it is still exported (`eval/stability.ts` and `lib/analyze.ts` import it from here).
- [ ] Given the prompt-injection comment block, when the migration lands, then it is preserved verbatim — it is still accurate and load-bearing.
  - *Not met:* the prompt-injection comment is still there with the same content, but not verbatim: the issue reference and some wording changed in the comment pruning of #212.
- [x] Given `npm run lint && npm run typecheck && npm run eval`, when run, then all pass and `eval/baseline.json` is untouched.

### Technical Notes

- Files: `lib/interpret.ts`.
- Collapsed `requestOnce`: sniff media types → `callModel({ images, system: SYSTEM_PROMPT, user, jsonSchema: OUTPUT_SCHEMA, maxOutputTokens: MAX_TOKENS, thinkingLevel: MINIMAL })` → `parseJsonLoose` → `safeParse`.
- 1024 was sized for a non-thinking budget; thinking tokens now share it. `MINIMAL` is correct here — this lane is grounded on already-measured tokens, its job is explicitly not to reason hard.
- Do **not** touch `lib/analyze.ts`'s `enrichWithAI` merge semantics; AI output is merged *onto*, never *into*, measured fields.

### As Built

- `requestOnce` in `lib/interpret.ts` calls `callModel` with `jsonSchema: OUTPUT_SCHEMA`, `maxOutputTokens: MAX_TOKENS`, `temperature: TEMPERATURE` (0) and `seed: SEED` (7), then `parseJsonLoose` → `aiResponseSchema.safeParse`.
- `MAX_INTERPRET_IMAGES` is still 4.

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
**Status**: done — issue closed, PR #80 merged. 1 criterion is not met.

### Description

As a maintainer, I want the AI structure-labelling stage migrated to `callModel` with its latent
`temperature: 0.1` removed, so that semantic naming can actually succeed instead of 400-ing twice and
silently falling back to heuristic names.

### Acceptance Criteria

- [x] Given `lib/extract/structure/structureAI.ts:129`, when the migration lands, then `temperature: 0.1` is deleted — it is rejected with a 400 by current models, swallowed twice by `retryOnce`, and returns `null`.
- [x] Given the file, when inspected, then it imports no SDK and `requestOnce` no longer takes a `client` parameter.
- [x] Given a `STRUCTURE_SCHEMA` const, when compared to `aiStructureResponseSchema`, then it mirrors it — with `componentDefinitions` and `sectionDescriptions` (both `z.record`, open key sets) expressed as `{ type: "object", additionalProperties: { … } }`.
- [x] Given response handling, when the migration lands, then `message.content[0]` + `text.match(/\{[\s\S]*\}/)` (`structureAI.ts:133-134`) are both replaced by `parseJsonLoose`.
- [ ] Given the token budget, when the migration lands, then `maxOutputTokens` is raised above 3000 (this lane emits one entry per tree node plus section descriptions, and thinking tokens now share the budget) with `thinkingLevel: LOW`.
  - *Not met:* `maxOutputTokens` is `4000`, but the native Gemini path was removed in #199, so no `thinkingLevel` is sent.
- [x] Given `forceHeuristicNaming`, when the migration lands, then the short-circuit still sits **ahead of** the `aiLaneAvailable()` check, and its comment no longer names the Anthropic client or `ANTHROPIC_API_KEY`.
- [x] Given `GEMINI_API_KEY` is set in the environment, when `npm run eval` runs, then it makes zero network calls and the baseline is untouched.

### Technical Notes

- Files: `lib/extract/structure/structureAI.ts`.
- `callModel({ user: prompt, maxOutputTokens: >3000, jsonSchema: STRUCTURE_SCHEMA, thinkingLevel: LOW })` — no `system`, matching the current single-user-message shape.
- The `forceHeuristicNaming` ordering is the load-bearing invariant of this story: it is what keeps `npm run eval` offline and deterministic once a key exists in the dev environment (PRD §11, second unchecked criterion).
- Reading only `content[0]` was a latent bug independent of the provider — `parseJsonLoose` retires it.

### As Built

- `requestOnce` in `structureAI.ts` sends `jsonSchema: STRUCTURE_SCHEMA` and `maxOutputTokens: 4000`, with no temperature and no seed.
- `STRUCTURE_SCHEMA` is still a hand-written mirror of `aiStructureResponseSchema`, kept non-strict because its dictionary fields use `additionalProperties`.
- The eval stays offline because `forceHeuristicNaming` is checked before `aiLaneAvailable()`; the key it guards against is now `OPENROUTER_API_KEY`, since `GEMINI_API_KEY` is not read at all.

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
**Status**: done — issue closed, PR #81 merged. 2 criteria are not met.

### Description

As a maintainer, I want the vision structure-from-image lane migrated to `callModel` with its
`temperature: 0.1` and duplicate MIME-type union removed, so that image uploads in `structure` mode
produce an inferred skeleton instead of a `structureUnavailableReason`, and MIME types have exactly
one owner.

### Acceptance Criteria

- [x] Given `lib/extract/structureFromImage.ts:101`, when the migration lands, then `temperature: 0.1` is deleted.
- [x] Given the file, when inspected, then it imports no SDK, `requestOnce` no longer takes a `client` parameter, and the hand-written Anthropic media-type union is gone — `lib/extract/imageMediaType.ts` is the only owner of MIME types in the codebase.
- [x] Given `text.match(/\{[\s\S]*\}/)` (`structureFromImage.ts:118`), when the migration lands, then it is replaced by `parseJsonLoose`, followed by `aiVisionStructureResponseSchema.safeParse`.
- [ ] Given the recursive `aiVisionNodeSchema` (via `z.lazy`), when a `$defs`/`$ref` JSON Schema is attempted, then it either works (legal — cyclic refs are permitted on non-required properties, and `children` is optional) or falls back to `responseMimeType: "application/json"` with no schema; **this must not block the story** — Zod is the real gate and the prompt already specifies the shape.
  - *Not met:* the vision call sends neither a JSON Schema nor a JSON mode: `requestOnce` in `structureFromImage.ts` passes no `jsonSchema`, so no `response_format` goes out, and the prompt plus `aiVisionStructureResponseSchema` are the only shape control.
- [ ] Given the call, when the migration lands, then it uses `thinkingLevel: MEDIUM` — this is the lane most at risk moving off a frontier vision model.
  - *Not met:* the native Gemini path was removed in #199, so no `thinkingLevel` is sent; the call sets `maxOutputTokens: MAX_TOKENS` (4096) only.
- [x] Given the file docstring, when read, then "gated entirely on `ANTHROPIC_API_KEY`" reads `GEMINI_API_KEY`.
- [x] Given a produced skeleton, when emitted, then it is still stamped `fidelity: "inferred"` with no heuristic fallback path introduced.

### Technical Notes

- Files: `lib/extract/structureFromImage.ts`.
- `callModel({ images, system: SYSTEM_PROMPT, user: "Infer the layout skeleton…", maxOutputTokens: MAX_TOKENS, thinkingLevel: MEDIUM })`.
- Supported Gemini image MIME types (png, jpeg, webp, heic, heif) are a superset of what `imageMediaType.ts` emits, so no logic change is needed there — only the comment (DIST-038).
- Quality spot-check belongs to DIST-039; this story lands the code path.

### As Built

- `structureFromImages` sends at most `MAX_STRUCTURE_IMAGES = 4` images, each typed by `detectImageMediaType` from `lib/extract/imageMediaType.ts`.
- The file docstring names no key; the gate is `aiLaneAvailable()`, which reads `OPENROUTER_API_KEY`.
- Each image's pixel size, measured with `sharp`, is reported as the viewport rather than a fabricated one.

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
**Status**: done — issue closed, PR #82 merged. 2 criteria are not met.

### Description

As a maintainer, I want the Anthropic dependency removed and every provider/key reference updated
across docs and eval scripts, so that the codebase names exactly one provider and a new contributor
is told to get a free Gemini key.

### Acceptance Criteria

- [ ] Given `package.json`, when the story lands, then `@anthropic-ai/sdk` is removed, `@google/genai` ^2.13.0 remains, `npm install` has been run, and `package-lock.json` is updated.
  - *Not met:* `@anthropic-ai/sdk` is gone, but the native Gemini path was removed in #199 and `@google/genai` with it; no model SDK remains.
- [x] Given `grep -rn "ANTHROPIC\|@anthropic-ai" --exclude-dir=node_modules .` (excluding historical `.agents/` artifacts), when run, then it returns no hits in `lib/`, `app/`, `eval/`, `README.md`, `CLAUDE.md`, or `package.json`.
- [ ] Given `README.md` (~lines 46, 62, 122), when read, then it says "Google Gemini API Key", uses `GEMINI_API_KEY=...` in the `.env.local` and `docker run -e` examples, and notes the key is free from https://aistudio.google.com/apikey with no credit card.
  - *Not met:* the README names `OPENROUTER_API_KEY` (and the optional `OPENROUTER_MODEL`) in its `.env.local` and `docker run -e` examples, not a Gemini key, since #199.
- [x] Given `CLAUDE.md` (lines ~61 and ~80), when read, then "Every Claude-backed lane…" and "gated entirely on `ANTHROPIC_API_KEY`" are updated, and `callModel` is listed among the `lib/aiLane.ts` primitives the one-seam rule covers.
- [x] Given `eval/stability.ts` (lines 16, 93) and `eval/run.ts` (lines 61-62), when read, then the skip message and comment name Gemini, not Anthropic.
- [x] Given `lib/extract/imageMediaType.ts`, when read, then the comment names Gemini and **no logic changed** — the four returned values are already valid Gemini MIME types.
- [x] Given `.agents/temp/AI-LANE-NOTES.md`, when the story lands, then it is deleted (gitignored scratch; stale advisory notes invite re-litigating settled decisions).
- [x] Given `npm run lint && npm run typecheck && npm run eval`, when run, then all pass and `eval/baseline.json` is untouched.

### Technical Notes

- Files: `package.json`, `package-lock.json`, `README.md`, `CLAUDE.md`, `eval/stability.ts`, `eval/run.ts`, `lib/extract/imageMediaType.ts`, delete `.agents/temp/AI-LANE-NOTES.md`.
- **No `app/` changes** — the route and UI never reference a provider, model id, or key. If this story finds itself editing `app/`, something leaked across the seam.
- Also worth updating: PRD §8 tech-stack row and §9 config table, which still carry "Today / Phase 5" dual wording.
- Consider documenting the free-tier data-use caveat (PRD §9 "Data-handling note") in the README's hardening guide, since operators pick a tier at deploy time.

### As Built

- The rules moved to `AGENTS.md` (`CLAUDE.md` is a pointer), and `docs/architecture/orchestration.md` lists `callModel` among the `lib/aiLane.ts` primitives.
- `eval/stability.ts` and `eval/run.ts` name `OPENROUTER_API_KEY`, and the `imageMediaType.ts` comment names "the vision model" rather than a provider; no Anthropic reference remains in `lib/`, `app/`, `eval/`, the README, the rules or `package.json`.

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
**Status**: done — issue closed, PR #83 merged. 2 criteria are only partly verified.

### Description

As a maintainer, I want the AI lane exercised live end-to-end for the first time in this project's
history, so that "the feature works" is verified rather than assumed — the graceful fallback has hidden
total breakage since day one.

### Acceptance Criteria

- [x] Given `GEMINI_API_KEY` set in `.env.local` and a restarted dev server, when a real URL is analyzed in `both` mode, then the design report carries `identity` + `imageMood` at `provenance: ai`.
- [ ] Given the same run, when the structure report is read, then it shows `naming: "ai"` (not `"heuristic"`) and the page-sections digest carries per-section `description`s.
  - *Partly verified:* the live `VERIFY_AI=1` run of 2026-10-14 recorded in `.agents/reports/todo-25-remove-native-gemini-provider-path-plan-report.md` shows `naming:    ai`, but neither that run nor the DIST-039 report records per-section `description`s.
- [x] Given an image uploaded in `structure` mode with a key set, when the response returns, then it carries a `fidelity: "inferred"` skeleton and **no** `structureUnavailableReason`.
- [x] Given the server console during all of the above, when inspected, then it shows no `AI Structure Labeller failed` / `Vision structure inference failed` warnings — a silent heuristic fallback is precisely the failure mode this migration exists to end.
- [x] Given `GEMINI_API_KEY` is set, when `npm run eval` runs, then it passes fully offline (zero network calls) with `eval/baseline.json` untouched, and `UPDATE_BASELINE=1` was **not** run.
- [x] Given `npm run eval:ai`, when run, then it executes for the first time instead of printing the skip message, and meets its Jaccard stability floors (0.5 adjectives / 0.3 archetype).
- [ ] Given the vision-lane output, when spot-checked, then the inferred layout skeleton is qualitatively sound; any degradation is recorded in a report under `.agents/reports/` rather than silently accepted.
  - *Partly verified:* `.agents/reports/dist-039-e2e-ai-verification-report.md` states that all three lanes were verified live but records no inferred skeleton and no quality spot-check.

### Technical Notes

- The measured lane is provider-independent, so **any** eval score movement means something leaked across the measured/AI split — investigate, don't refresh the baseline.
- **Free-tier rate limits (~10 RPM) will bite before cost does.** A `both`-mode run fires two AI calls and sends up to four images; bursty manual testing will 429. `retryOnce` treats a 429 as a failure and falls back, so a rate-limited run looks *identical* to a quality regression. Check the console before concluding the model is bad; the response cache absorbs repeats.
- Free-tier prompts are used for Google product improvement — verify against public third-party sites, not sensitive properties (PRD §9 data-handling note).
- Deliverable: a short report in `.agents/reports/` recording what each lane actually produced, so the "never verified" gap closes with evidence.

### As Built

- The DIST-039 report records only check results; the per-lane evidence on the current code is the `VERIFY_AI=1` run of 2026-10-14 over OpenRouter (#199), where `meta.aiOutcome` was `applied` for a URL and for images, the image structure was `fidelity: inferred`, and `next.log` held no failure line.
- The key is `OPENROUTER_API_KEY`, not `GEMINI_API_KEY`.
- `npm run eval:ai` met its floors (0.5 / 0.3) in 5 of 5 runs on the default model after the lane was seeded (#209), recorded in `.agents/reports/issue-209-seed-interpretation-lane-plan-report.md`.

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
**Status**: done — issue closed, PR #84 merged. 1 criterion is not met.

> **Scope note:** this story is derived from PRD §5 user story 11 and the §14 risk row, both of which
> tag the problem as Phase 5. It is **not** an explicit bullet in §12's Phase-5 scope list, where the
> stated mitigation is process-level ("console warnings must be checked, not assumed absent").
> Drop it if you'd rather keep Phase 5 a pure like-for-like migration.

### Description

As a maintainer, I want a lane that fails *with* a key configured to log differently from a lane that
was never enabled, so that a broken request parameter can't silently disable a feature for months
again.

### Acceptance Criteria

- [x] Given no API key is configured, when an AI lane is skipped, then nothing is logged as an error — this is the documented, expected degrade path.
- [ ] Given a key **is** configured and a call fails both attempts, when the lane falls back, then exactly one clearly-worded warning is emitted naming the lane and the underlying error.
  - *Not met:* `warnAiFailure` runs from `retryOnce`'s `onError` once per failed attempt, so a call that throws on both attempts logs two warnings (`… failed (…, attempt 1)` and `attempt 2`).
- [x] Given a 429 (rate limit) versus a 400 (bad request), when either occurs, then the warning distinguishes them, so a free-tier throttle is not mistaken for a quality regression.
- [x] Given the report contract, when this story lands, then no schema field is added or changed and no measured value is affected — this is observability only.
- [x] Given `npm run eval`, when run, then it passes with the baseline untouched and stays silent (no key path, no new noise).

### Technical Notes

- Natural home is the `onError` hook `retryOnce` already exposes in `lib/aiLane.ts`, plus the existing call-site warnings (`AI Structure Labeller failed`, `Vision structure inference failed`).
- Keep it to server-side logging: the AI key and its failures are server-side concerns and must not reach the client (PRD §9).
- Resist growing this into a health endpoint or a UI surface — the PRD's failure mode is "invisible in the console", not "invisible in the product".

### As Built

- `warnAiFailure` in `lib/aiLane.ts` classifies a failure as `429 Rate Limit / Quota Exceeded`, `400 Bad Request` or `error` and logs the lane name, the class and the attempt.
- The outcome also reaches the client as `meta.aiOutcome` (`applied` / `no-key` / `failed` / `not-requested`, #172), added by a later story.

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
**Status**: done — issue closed, PR #91 merged. 1 criterion is not met.

### Description

As a deployer of a public Distill instance, I want Playwright to validate the resolved IP of all HTTP 301/302 redirect targets against `assertSafeUrl`, so that malicious URLs cannot bypass SSRF validation via redirects to internal/private network targets.

### Acceptance Criteria

- [x] Given a target URL that issues an HTTP 301/302 redirect, when `renderUrl` processes the navigation in `lib/ingest.ts`, then the target redirect URL is intercepted and validated via `assertSafeUrl(targetUrl)`.
- [ ] Given a redirect pointing to a loopback (`127.0.0.1`, `::1`), RFC1918 private subnet, link-local, CGNAT, or reserved IP range, when encountered during render, then navigation is immediately aborted and an `UnsafeUrlError` is thrown before loading any redirect response body.
  - *Not met:* Chromium has already sent the request to the redirect target when the 30x response event fires; the handler then closes the page and the render throws the `UnsafeUrlError`, so the result never reaches the client, but the internal request is made. `page.route()` cannot block it, since it fires only for the first URL of a redirect chain.
- [x] Given a redirect to an allowlisted hostname in `SSRF_ALLOWLIST_HOSTS`, when encountered, then the redirect is permitted.
- [x] Given `npm run eval`, when run, then offline eval captures pass unchanged.

### Technical Notes

- Intercept using Playwright's `page.on('response', ...)` or route handlers (`page.route('**/*', ...)`) in `lib/ingest.ts`.
- Perform IP validation on `response.headers()['location']` or request redirect targets before full response body load.
- Ensure no loopback or internal metadata endpoints (e.g. `http://169.254.169.254/`) can be read via redirect.

### As Built

- The guard is the `page.on("response")` handler in `renderUrl` (`lib/ingest.ts`): it validates every 30x `Location` with `assertSafeUrl`, and every validation is awaited with `Promise.allSettled` before the render counts as safe (DIST-049).
- DNS rebinding stays a residual gap, since Chromium re-resolves at connect time.

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
**Status**: done — issue closed, PR #92 merged. 2 criteria are not met.

### Description

As a user of the Distill workbench, I want the "Copy" and "Download" button labels in `app/page.tsx` to dynamically adapt to whichever report tab is currently active (Design System vs Structure), and I want a clear setup hint for configuring `GEMINI_API_KEY` in the meta panel.

### Acceptance Criteria

- [ ] Given `activeTab === "design"`, when viewing the workbench action buttons, then the copy button reads `"Copy Design System .md"` and the download button reads `"Download Design System .md"`.
  - *Not met:* the workbench has no copy button (removed in #160); outside the structure tab the download button reads `Download Design System .md`, and the tab values are `preview`/`tokens`/`structure`, not `design`.
- [ ] Given `activeTab === "structure"`, when viewing the workbench action buttons, then the copy button reads `"Copy Structure .md"` and the download button reads `"Download Structure .md"`.
  - *Not met:* there is no copy button (#160), and on the structure tab the download button reads `Download Layout Structure .md`, not `Download Structure .md`.
- [x] Given line 162 in `app/page.tsx`, when inspected, then the legacy TODO comment is cleanly resolved.
- [x] Given the meta header panel in the UI, when rendered, then a concise, non-intrusive setup hint for enabling optional AI enrichment via `GEMINI_API_KEY` is present.
- [x] Given `npm run lint && npm run typecheck`, when run, then both pass with zero errors.

### Technical Notes

- Files: `app/page.tsx`.
- Keep button styling and tab behavior identical, changing only button label text based on active tab state.
- Meta panel key hint should mention free-tier keys at https://aistudio.google.com/apikey.

### As Built

- The setup hint shows when `meta.aiOutcome` is `no-key` and names `OPENROUTER_API_KEY` and `.env.local`, with a link to https://openrouter.ai/keys, not a Gemini key.
- A third button downloads the Tailwind theme (`Download Tailwind @theme`).

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
**Status**: done — issue closed, PR #93 merged

### Description

As a maintainer, I want a GitHub Actions CI workflow created at `.github/workflows/ci.yml` that runs type checking, linting, and offline eval regression tests on PRs and main pushes, so that breaking changes cannot land undetected.

### Acceptance Criteria

- [x] Given `.github/workflows/ci.yml`, when created, then it triggers on `push` to `main` and `pull_request` targeting `main`.
- [x] Given a workflow run, when executed on GitHub Actions, then Node.js 20 is configured, dependencies are installed cleanly (`npm ci`), Playwright Chromium browser binaries are installed (`npx playwright install --with-deps chromium`), and `npm run typecheck`, `npm run lint`, and `npm run eval` are executed in order.
- [x] Given any failure in `typecheck`, `lint`, or `eval`, when executed in CI, then the job fails closed.
- [x] Given `eval/baseline.json`, when verified in CI, then the offline eval harness enforces the floor without network calls.

### Technical Notes

- File: `.github/workflows/ci.yml`.
- Keep the workflow minimal and fast. Node caching (`actions/setup-node` with `cache: 'npm'`) is recommended.

### As Built

- `.github/workflows/ci.yml` runs on Node 20 with `cache: 'npm'`, then `npm ci`, `npx playwright install --with-deps chromium` and one `npm run check` step: typecheck → lint → build → eval, chained with `&&` so the first failure fails the job (the build step came with DIST-058).

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
**Status**: done — issue closed, PR #85 merged

### Description

As a frontend developer, I want declared CSS transitions and animations extracted as a motion token
lane attributed per recipe element class, so that a rebuilt component moves like the original instead
of being statically correct but lifeless.

### Acceptance Criteria

- [x] Given a page with declared `transition-*` / `animation-*` properties, when it is analyzed, then a motion lane is emitted with per-property `durationMs`, `timingFunction`, and `delayMs`, stamped `provenance: measured`.
- [x] Given `transition: background-color .2s ease-in-out, transform .15s cubic-bezier(0.4, 0, 0.2, 1)`, when parsed, then both entries are recovered intact — a paren-depth-aware splitter is used, because naive `.split(",")` breaks on the internal commas in `cubic-bezier(…)`.
- [x] Given `@keyframes` definitions, when collected, then they piggyback on the **existing** stylesheet iteration already used for `:hover`/`:focus` scanning — no second page pass, no new capture field beyond the dump record.
- [x] Given a node whose only interesting property is motion, when the style dump records it, then it is not dropped — the record-skip gate in `lib/extract/styleDump.ts` gains exactly one new condition.
- [x] Given a page with no declared motion, when it is analyzed, then the motion section is **omitted entirely** — no empty block, no defaulted durations.
- [x] Given JS-driven motion (scroll-triggered, animation libraries), when it is not visible to computed-style reads, then this is documented as an honest, expected gap rather than worked around.
- [x] Given `npm run eval`, when run, then it passes with the baseline untouched — the lane is additive and old committed captures simply don't populate it.

### Technical Notes

- Files: `lib/extract/styleDump.ts` (one skip condition), new `lib/extract/motion.ts`, `lib/schema.ts`, `lib/emit.ts` (`renderMotion` called only `if (report.motion)`).
- Declared transitions read cleanly off `getComputedStyle` — no `var()`-resolution workaround needed (unlike `states.ts`'s CSSOM rule-text reads).
- Attribution is *simpler* than `states.ts`: `recipes.ts`'s `classify()` never depends on color, so element-class attribution needs no palette round-trip.
- Verify against a synthetic fixture + local server per CLAUDE.md "Manually verifying extraction changes"; do **not** refresh eval captures to exercise this lane.

### As Built

- The parser and the `hasMotion` record-skip condition live in `lib/extract/styleDump.ts`; `lib/extract/motion.ts` attributes entries per recipe element class through `recipes.ts`'s `classify`, dedupes them and keeps only referenced `@keyframes`.
- `delayMs` is emitted only when non-zero.
- The JS-driven-motion gap is documented in the PRD (§7 Motion tokens row) and in `.agents/reports/motion-spike.md`, not in code.
- Cross-origin `@keyframes` are recovered too, through the refetch pass of DIST-043.

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
**Status**: done — issue closed, PR #86 merged. 1 criterion is only partly verified.

### Description

As a frontend developer, I want a downloadable Tailwind v4 `@theme` file derived from the report
frontmatter, so that I can drop a measured design system straight into a new project instead of
hand-transcribing it.

### Acceptance Criteria

- [x] Given a `Report`, when `emitTailwindTheme(report)` runs, then every emitted line traces 1:1 to an existing frontmatter field — **zero new schema surface, zero invented values**.
- [x] Given `spacing.baseUnitPx`, when emitted, then it maps to `--spacing: <baseUnitPx>px` (**not** positional `--spacing-1..n`, which silently shadows Tailwind's numeric `p-1`/`p-2` utilities and produces a non-monotonic scale).
- [x] Given `typography.scale[]`, when emitted, then each token uses the v4 sub-key syntax (`--text-<token>` plus `--text-<token>--line-height` / `--font-weight` / `--letter-spacing`) so one `text-h1` utility applies all four measured properties.
- [x] Given `paletteDark` is present, when emitted, then a `@media (prefers-color-scheme: dark) { :root { --color-* } }` block is appended **after** the `@theme` block; given `paletteDark` is absent, then no dark block is emitted at all.
- [x] Given a lane that was never measured (e.g. `elevation.shadows: []`), when emitted, then its section is absent — asserted, not eyeballed.
- [ ] Given the generated file, when built in a fresh Tailwind v4 project, then it compiles and `bg-primary`, `text-h1`, `rounded-1`, `p-4` appear in the output CSS with the measured values.
  - *Partly verified:* the fresh-project build is recorded only for the spike prototype in `.agents/reports/tailwind-theme-spike-report.md` (Tailwind 4.3.3, exit 0); `.agents/reports/dist-042-tailwind-theme-report.md` records no build of the shipped `emitTailwindTheme` output.
- [x] Given the workbench UI, when a report is present, then a second download button offers the theme file alongside the existing Markdown download.
- [x] Given `npm run eval`, when run, then it passes with the baseline untouched.

### Technical Notes

- Files: `lib/emit.ts` (new `emitTailwindTheme` export), `app/page.tsx` (second download button), possibly `app/api/analyze/route.ts` if the theme is returned rather than derived client-side.
- Tailwind `@theme` flavor **only** — the spike scoped surface (a); don't broaden to other frameworks.
- Header comment traces to `source.ref` + `source.capturedAt`, both existing frontmatter fields.
- Fields with no honest mapping are omitted, never defaulted — same contract as `renderCssVariables`.
- This is the MVP-scoped slice of PRD §4's out-of-scope "direct code generation"; component generation stays out.

### As Built

- `emitTailwindTheme` lives in `lib/emitTailwind.ts`, not `lib/emit.ts`, so the client bundle does not pull in `js-yaml` (DIST-071); the workbench calls it client-side.
- Radius maps to positional `--radius-1..n` and shadows to `--shadow-<name>`; the dark block is emitted only when `paletteDark` has colors and carries only `--color-*` lines.

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
**Status**: done — issue closed, PR #87 merged

### Description

As a design engineer, I want hover/focus deltas recovered from cross-origin stylesheets, so that sites
serving CSS from a CDN produce a real `## States` section instead of silently omitting the lane.

### Acceptance Criteria

- [x] Given a page with a `<link>`ed cross-origin stylesheet that throws `SecurityError` on `.cssRules`, when it is analyzed, then the sheet is re-fetched via `context.request` and re-parsed, and the affected nodes come back with `states` populated.
- [x] Given the recovered deltas, when compared to the same rules served same-origin, then they are identical — the declared values, not simulated or applied ones.
- [x] Given the downstream pipeline, when this story lands, then `states.ts` aggregation, `lib/schema.ts`, the emit path, and the `capture.json` shape are all **byte-identical** — this widens coverage without changing semantics.
- [x] Given a sheet that cannot be re-fetched (404, auth-walled, network error), when the fetch fails, then it is skipped best-effort and the affected nodes simply have no `states` — failure degrades to absence, never to a guess.
- [x] Given a site with genuinely no hover/focus rules, when it is analyzed, then `## States` is still omitted entirely.
- [x] Given `npm run eval`, when run, then it passes with the baseline untouched — no capture-shape change means no fixture refresh.

### Technical Notes

- Files: `lib/ingest.ts` (the `context.request` re-fetch belongs at the ingestion seam, alongside the other best-effort second passes), `lib/extract/styleDump.ts:401-409` (the silent-skip site).
- **Strategy A variant a2 (`context.request` re-fetch)** was chosen over route interception, CDP `CSS.forcePseudoState` (B), and CDP `getStyleSheetText` (C): it is the only candidate that widens coverage while leaving declared-never-simulated semantics and the capture shape unchanged.
- B is the documented fallback if *applied*-measurement semantics are ever wanted deliberately; C is a viable acquisition alternative if re-fetching proves unreliable against real CDNs. Record which was used if A is abandoned.
- The re-fetch is a network call made from the ingestion seam — confirm it does not create a new SSRF surface beyond what the rendered page already requests, and note the interaction with the README's egress-filtering guidance.
- Verify with the spike's two-origin local fixture pattern (page on one port, CORS-header-less CSS on another), driving Playwright directly per `eval/capture.ts`.

### As Built

- The refetch lives in `lib/extract/styleDump.ts`, not `lib/ingest.ts`: `fetchCrossOriginSheet` requests every cross-origin sheet at once through `page.context().request.get`, each under `CROSS_ORIGIN_SHEET_TIMEOUT_MS` (5 s), and applies the texts in stylesheet order (#176).
- A `CrossOriginSheetCache` created per capture is shared by the light and dark dumps; a failed or timed-out sheet is skipped, and a timeout logs one `console.warn` per analysis (#197).
- `verify.sh drive cross-origin` checks the pass end to end against a second origin with a stalled sheet (#196); CI does not run it.

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
**Status**: done — issue closed, PR #95 merged

### Description

As a user or developer, I want `lib/aiLane.ts` to support OpenRouter API keys (`OPENROUTER_API_KEY`) as an alternative or fallback provider, so that AI vision analysis can run flexibly across multiple models (e.g. `google/gemini-2.5-flash`, `openai/gpt-4o-mini`, `anthropic/claude-3.5-sonnet`) without being blocked by Google AI Studio free-tier rate limits (429 Quota Exceeded).

### Acceptance Criteria

- [x] Given `OPENROUTER_API_KEY` is set in environment variables, when `aiLaneAvailable()` is called, then it returns `true`.
- [x] Given `callModel(opts)` is invoked with an `OPENROUTER_API_KEY` set, when making the API call, then it sends an OpenAI-compatible Chat Completions request to `https://openrouter.ai/api/v1/chat/completions` with base64 data-URL image parts, system instructions, and JSON response format options.
- [x] Given `process.env.OPENROUTER_MODEL` is set, when `callModel` runs via OpenRouter, then it uses the specified model ID (defaulting to `google/gemini-2.5-flash`).
- [x] Given neither `OPENROUTER_API_KEY` nor `GEMINI_API_KEY` is set, when `aiLaneAvailable()` is called, then it returns `false` and gracefully degrades without throwing unhandled exceptions.
- [x] Given `npm run typecheck` and `npm run lint`, when run, then both pass with zero errors.

### Technical Notes

- Files to modify: `lib/aiLane.ts`
- Implement `callModel` branching based on `OPENROUTER_API_KEY` vs `GEMINI_API_KEY`.
- Format image inputs for OpenRouter as `{ type: "image_url", image_url: { url: "data:<mime>;base64,<data>" } }`.
- Ensure native JSON schema / JSON mode options match OpenRouter's `{ type: "json_object" }` or schema parameters.

### As Built

- The GitHub issue is #94, whose title has no story ID.
- OpenRouter is now the only provider (#199): the default `OPENROUTER_MODEL` is `google/gemini-3.5-flash`, not `google/gemini-2.5-flash`, and `GEMINI_API_KEY` is not read, so `aiLaneAvailable()` is false whenever `OPENROUTER_API_KEY` is unset.
- A `jsonSchema` is sent as non-strict `response_format: json_schema`, not `json_object`.

### Dependencies

- Blocked by: None
- Blocks: None

