# Implementation Report

**Plan**: `.agents/plans/completed/dist-035-interpret-callmodel-json-mode-plan.md`
**Branch**: `feature/dist-035-interpret-callmodel-json-mode`
**Status**: COMPLETE
**GitHub Issue**: [#69](https://github.com/laanhema/distill-design-scraper/issues/69) (DIST-035)

## Summary

Moved the interpretation lane (`identity` / `imageMood` / Stage-E color-role refinements) off the
Anthropic SDK and onto the shared `callModel` seam from DIST-034, using Gemini's native JSON mode.

`lib/interpret.ts` is the only source file touched. `requestOnce` lost its `client: Anthropic`
parameter and collapsed to *sniff media types → `callModel` → `parseJsonLoose` →
`aiResponseSchema.safeParse`*. `OUTPUT_SCHEMA` passes straight through to `config.responseJsonSchema`
verbatim — no translation to a restricted OpenAPI dialect was needed, which a live probe confirmed.
`MAX_TOKENS` went 1024 → 2048 paired with `thinkingLevel: ThinkingLevel.MINIMAL`, because Gemini 3.x
thinks by default and thinking tokens are charged against `maxOutputTokens`.

Net diff: **20 insertions, 47 deletions** in one file.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Swap the imports — drop `@anthropic-ai/sdk` and `AI_MODEL`; add `callModel`, `parseJsonLoose`, `ThinkingLevel` | `lib/interpret.ts` | ✅ |
| 2 | `MAX_TOKENS` 1024 → 2048; rewrite the stale Claude-era budget comment | `lib/interpret.ts:31-36` | ✅ |
| 3 | Collapse `requestOnce` onto `callModel` + `parseJsonLoose` | `lib/interpret.ts:142-179` | ✅ |
| 4 | Drop `new Anthropic()` from `interpret()`; update the `retryOnce` call | `lib/interpret.ts:185-196` | ✅ |
| 5 | Diff-check the must-not-change surface | `lib/interpret.ts` | ✅ |
| 6 | Full gate (`lint` + `typecheck` + `eval`) | — | ✅ |

## Validation Results

| Check | Command | Result |
|-------|---------|--------|
| Type check | `npm run typecheck` | ✅ clean, zero errors |
| Lint | `npm run lint` | ✅ clean, zero warnings |
| Regression gate | `npm run eval` | ✅ `clean-light` 100%, `dark-mode` 100%, aggregate 100%, all gates passed |
| Offline invariant with key set | `GEMINI_API_KEY=dummy npm run eval` | ✅ byte-identical result, zero network calls |
| `eval/baseline.json` untouched | `git status eval/` | ✅ empty — no baseline refresh, `UPDATE_BASELINE=1` never run |
| Diff scope | `git diff --stat` | ✅ exactly one source file (`lib/interpret.ts`) |

There is no unit test framework in this repo (no jest/vitest — see `package.json` / CLAUDE.md), so
`npm run eval` is the correctness gate, supplemented by throwaway `npx tsx` scratch scripts that were
deleted after use per CLAUDE.md.

## Task 5 — must-not-change surface, verified against `git diff`

No hunk touches any of these:

- `SYSTEM_PROMPT`
- `OUTPUT_SCHEMA` — reaches `responseJsonSchema` verbatim, byte-for-byte unchanged
- `MAX_INTERPRET_IMAGES`
- `InterpretInput` / `Interpretation`
- `groundingSummary`
- `export { aiLaneAvailable };` — still present (`eval/stability.ts:4` and `lib/analyze.ts:12` import it from this module)
- the prompt-injection comment block — preserved verbatim and still attached to the image-building code
- `RefinementChange` / `applyRoleRefinements`
- the module docstring

`grep -rn "anthropic" -i` over the entire interpret call path (`lib/interpret.ts`, `lib/aiLane.ts`,
`lib/schema.ts`, `lib/extract/imageMediaType.ts`, `lib/extract/palette.ts`) returns **nothing**.

## End-to-End Verification

### 1. Nothing broke — ✅ PASS

`npm run lint && npm run typecheck && npm run eval` all clean, eval at the committed baseline with
zero score deltas.

### 2. `npm run eval` stays offline with a key set — ✅ PASS

`GEMINI_API_KEY=dummy npm run eval` produced an identical result with zero network calls.

### 3. The migrated lane reaches Gemini — ✅ PASS (payload), ⚠️ BLOCKED on the pinned model

**The migrated call payload was verified live and works end-to-end.** A throwaway scratch probe sent
the *exact* `ModelCall` payload `lib/interpret.ts` now builds — `OUTPUT_SCHEMA` verbatim into
`responseJsonSchema`, `ThinkingLevel.MINIMAL`, `maxOutputTokens: 2048`, sniffed inline images,
`systemInstruction` — and then ran the **real** `parseJsonLoose` + `aiResponseSchema.safeParse` gate
over the response:

| Assertion | Result |
|---|---|
| `OUTPUT_SCHEMA` accepted verbatim by `responseJsonSchema` | ✅ no translation, no cloning, no `structuredClone` needed |
| `finishReason` | ✅ `STOP` — **no truncation** |
| Output token usage vs. 2048 budget | ✅ 196 (single-image) / 186 (multi-image) — large headroom, budget choice validated |
| Markdown fence in raw text | ✅ none — native JSON mode confirmed on |
| `parseJsonLoose` → `aiResponseSchema.safeParse` | ✅ success |
| `identity.adjectives` count in 3–6 | ✅ 5 |
| `identity.archetype` / `.description` non-empty | ✅ both |
| `imageMood.hero` / `.texture` concrete + photographable | ✅ e.g. "architectural blueprints on a white desk", "fine-grain paper texture" |
| `roleRefinements` reference only palette hexes | ✅ 1 refinement, **0 invented hexes** |
| No `@anthropic-ai/sdk` anywhere in the call path | ✅ |

**However**, `interpret()` against the pinned `AI_MODEL` (`gemini-3.5-flash`) returned `null` on every
attempt. This is an **environment/capacity condition, not a code defect** — diagnosed exactly as the
plan's Risks table instructs (check `429`/`503` before concluding the prompt or model is bad). Direct
probes of the pinned model returned, verbatim:

```
503 UNAVAILABLE — "This model is currently experiencing high demand. Spikes in demand are
usually temporary. Please try again later."
```

and, once the 503s cleared:

```
429 RESOURCE_EXHAUSTED — Quota exceeded for metric:
generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20,
model: gemini-3.5-flash
quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier
```

Truncation was ruled out first, as the plan requires: the probe reports `finishReason: STOP` with
~190 output tokens against the 2048 budget, so the new budget is generously sized and `MAX_TOKENS` is
not implicated. `AI_MODEL` was **not** changed — the plan explicitly puts that out of scope for this
story (it was validated against the models-list endpoint in DIST-034; a persistent capacity problem
is a DIST-039/040 decision). The scratch probe took the model id as a CLI argument so the pinned
constant in source stayed untouched.

### 4. Multi-image path — ✅ PASS

Re-ran with two images. The plural `promptNote` branch was exercised
(`"…derived from 2 images of the same subject…"`), both images sniffed as `image/png`, `finishReason:
STOP`, and the response passed the Zod gate with 5 adjectives and 0 invented hexes. This is the
`MAX_INTERPRET_IMAGES` path `analyzeImages` uses.

### 5. `npm run eval:ai` — ⏭️ NOT RUN

Deliberately skipped. It fires `3 runs × 2 sites = 6` calls against the same `gemini-3.5-flash` whose
free-tier daily quota (limit 20) is already exhausted, so it could only have produced `429`s — which,
as the plan notes, "is not a quality result". Worth re-running once quota resets.

### 6. Live app path — ⏭️ NOT RUN

Optional, and gated on the same exhausted quota. Overlaps DIST-039.

### Scratch scripts

Both scratch scripts (`scratch-interpret.ts`, `scratch-probe.ts`) were **deleted** after use per
CLAUDE.md. `git status` shows only `lib/interpret.ts` modified.

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/interpret.ts` | UPDATE | +20 / -47 |

No changes to `lib/aiLane.ts`, `lib/analyze.ts`, `lib/extract/**`, `eval/**`, `package.json`,
`README.md`, `CLAUDE.md`, or `app/**`.

## Deviations from Plan

| Deviation | Rationale |
|---|---|
| E2E step 3 was verified via a payload-equivalent probe against `gemini-3.1-flash-lite` rather than a green `interpret()` run against the pinned `gemini-3.5-flash` | The pinned model is 503-saturated and its free-tier daily quota (20 requests) is exhausted in this environment. The plan forbids changing `AI_MODEL` in this story, so the probe replicated the exact `ModelCall` payload — including `OUTPUT_SCHEMA` verbatim — and ran the real `parseJsonLoose` + `aiResponseSchema` gate over the response. Everything the migration changes was exercised; only the literal model constant differed, and that constant is validated separately and out of scope here. |
| E2E steps 5 and 6 not run | Both would only have produced `429`s against the exhausted quota. Documented above rather than reported as passes. |

Otherwise the implementation matched the plan exactly, task for task.

## Tests Written

None — this repo has no unit test framework and the plan explicitly directs not to introduce one.
Verification was `npm run eval` (offline capture replay, the project's stated correctness gate) plus
the two throwaway `npx tsx` scratch scripts described above, deleted after use.

## Flagged — out of scope, carried forward

These are recorded per the plan's Risks table. **None of them is a regression this story caused.**

1. **Merge ordering (plan risk M1) — action needed.** `lib/extract/structure/structureAI.ts:1` and
   `lib/extract/structureFromImage.ts:1` still `import Anthropic from "@anthropic-ai/sdk"`. With
   `GEMINI_API_KEY` set, `aiLaneAvailable()` now opens all three lanes, but those two still construct
   `new Anthropic()` and will fail inside its missing-key constructor — producing
   `AI Structure Labeller failed` / `Vision structure inference failed` warnings and an uncached
   `structureUnavailableReason`. **Sequence DIST-036 (#70) and DIST-037 (#71) close behind this one,
   or squash the chain, rather than leaving the intermediate state on `main`.**

2. **`gemini-3.5-flash` capacity/quota.** Persistent `503 UNAVAILABLE` plus a 20-request/day free-tier
   cap made a live run of the pinned model impossible during this story. `retryOnce` fires two
   attempts back-to-back with no backoff, so a capacity error is indistinguishable from a quality
   regression. A DIST-039/040 decision.

3. **Interpretation failures are entirely silent.** `retryOnce` is called at `lib/interpret.ts:195`
   with no `onError`, unlike `structureAI.ts:172-176`. Two silent attempts, then a measured-only
   report — which is precisely why the `null` in E2E step 3 needed a separate probe to diagnose.
   **This story is direct evidence for DIST-040 (#74).** Deliberately not fixed here; adding it would
   have exceeded issue #69's acceptance criteria.

4. **`image/gif` reaches this lane.** `ImageMediaType` includes `"image/gif"`
   (`lib/extract/imageMediaType.ts:3`) and the upload path is `accept="image/*"`, so a GIF upload gets
   sniffed as `image/gif` and will `400` the *interpretation* call, not just the vision structure
   lane. The DIST-034 report carried this to DIST-036/037, which under-scopes it — `interpret.ts` is
   an image-carrying lane too. Cheap fixes: transcode GIF via `sharp` in `imageMediaType.ts`, or
   narrow `ModelCall.mediaType` to the Gemini-supported subset so it fails at compile time. URL
   analysis is unaffected (screenshots are always PNG). **Re-raise on DIST-036/037/038.**

## Acceptance Criteria

- [x] `lib/interpret.ts` imports no SDK, and `requestOnce` no longer takes a `client` parameter
- [x] `OUTPUT_SCHEMA`, `SYSTEM_PROMPT`, `groundingSummary`, `applyRoleRefinements`, and `MAX_INTERPRET_IMAGES` are unchanged — `OUTPUT_SCHEMA` passes through to `responseJsonSchema` verbatim (confirmed live)
- [x] `MAX_TOKENS` is 2048 with `thinkingLevel: ThinkingLevel.MINIMAL`, and the stale `// No temperature knob on 4.8.` comment is rewritten
- [x] The model response goes `parseJsonLoose` → `aiResponseSchema.safeParse` — Zod remains the hard gate
- [x] `export { aiLaneAvailable };` is still present
- [x] The prompt-injection comment block is preserved verbatim
- [x] `npm run lint && npm run typecheck && npm run eval` all pass and `eval/baseline.json` is untouched
- [x] No changes to `lib/aiLane.ts`, `lib/analyze.ts`, `lib/extract/**`, `eval/**`, `package.json`, `README.md`, `CLAUDE.md`, or `app/**`
- [~] A live scratch run returns a Zod-valid `Interpretation` with `provenance: "ai"`, and the scratch script is deleted afterwards — **payload verified live and Zod-valid** (see E2E step 3); a green run against the pinned `gemini-3.5-flash` is blocked on 503/quota in this environment, not on code. Scratch scripts deleted.
