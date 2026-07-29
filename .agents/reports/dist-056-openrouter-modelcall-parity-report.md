# Implementation Report

**Plan**: `.agents/plans/dist-056-openrouter-modelcall-parity-plan.md`
**Branch**: `feature/dist-056-openrouter-modelcall-parity`
**Status**: COMPLETE (see Deviations for one live-verification caveat)

## Summary

Closed the `ModelCall` contract gap between `lib/aiLane.ts`'s Gemini and OpenRouter paths (issue #104 / DIST-056):

- OpenRouter now sends a real, non-strict `response_format: json_schema` instead of a bare `json_object`, with an in-code explanation of why `strict: true` is intentionally omitted (`STRUCTURE_SCHEMA`'s dictionary-shaped `additionalProperties` fields aren't representable under strict mode).
- `thinkingLevel` remains a Gemini-only knob, but the gap is no longer silent: a one-time process-lifetime `console.warn` fires the first time a lane sends `thinkingLevel` over OpenRouter, and all three call sites (`interpret.ts`, `structureAI.ts`, `structureFromImage.ts`) now carry a comment noting the pin doesn't apply there.
- Restored the previously-specced-but-never-built `GEMINI_MODEL` env override, and aligned both providers' default model generation (`gemini-3.5-flash` / `google/gemini-3.5-flash`), each independently overridable.
- Fixed `eval/stability.ts`'s skip message, which named only `GEMINI_API_KEY` though the actual gate (`aiLaneAvailable()`) is provider-agnostic.
- Brought `README.md`, `CLAUDE.md`, and `.agents/PRDs/PRD.md` back into agreement with shipped behavior, closing the corresponding PRD checklist items (§4, §8, §9, §12 P2-1/P2-2, §14).

No provider branching leaked into call sites — `lib/aiLane.ts` remains the only file importing a provider SDK; call sites only gained comments.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Restore `GEMINI_MODEL` override; align default model generation | `lib/aiLane.ts` | Done |
| 2 | Real (non-strict) `json_schema` response format on OpenRouter | `lib/aiLane.ts` | Done |
| 3 | One-time `thinkingLevel`-ignored warning on OpenRouter | `lib/aiLane.ts` | Done |
| 4 | Comment the three `thinkingLevel` call sites as Gemini-only pins | `lib/interpret.ts`, `lib/extract/structure/structureAI.ts`, `lib/extract/structureFromImage.ts` | Done |
| 5 | Fix provider-specific skip message | `eval/stability.ts` | Done |
| 6 | Update README | `README.md` | Done |
| 7 | Update CLAUDE.md | `CLAUDE.md` | Done |
| 8 | Update PRD (§4, §8, §9, §12, §14) | `.agents/PRDs/PRD.md` | Done |
| 9 | Live verification | n/a (manual) | Done, with caveats — see Deviations |

## Validation Results

| Check | Result |
|-------|--------|
| `npm run typecheck` | ✅ Pass, no errors |
| `npm run lint` | ✅ Pass, no errors |
| `npm run eval` | ✅ Pass — `clean-light` 100%, `dark-mode` 100%, aggregate 100%. `eval/baseline.json` untouched (not modified by this plan; confirmed via `git status`) |
| Grep for dangling contradictions (`not feature-equivalent\|silently don't apply\|silently ignores`) | ✅ Only one hit, inside PRD.md's struck-through/closed historical text — no live contradiction remains |
| `npm run eval:ai` (Gemini-only) | ⚠️ Blocked externally — see Deviations |
| `npm run eval:ai` (OpenRouter-only) | ⚠️ Ran successfully (no crashes/parse failures) but did not consistently clear the Jaccard stability floor — confirmed pre-existing on `main`, not a regression. See Deviations |
| Direct `interpret()` round-trip over OpenRouter (scratch script, deleted after use) | ✅ Non-null result, Zod-validated, `identity.adjectives`/`imageMood` populated, no truncation at the 2048-token budget, one-time `thinkingLevel` warning fired correctly |

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `lib/aiLane.ts` | UPDATE | `GEMINI_MODEL` override, aligned OpenRouter default (`google/gemini-3.5-flash`), real `json_schema` response format, one-time `thinkingLevel` warning |
| `lib/interpret.ts` | UPDATE | Comment extension at `MAX_TOKENS`/`thinkingLevel: ThinkingLevel.MINIMAL` |
| `lib/extract/structure/structureAI.ts` | UPDATE | Comment at `thinkingLevel: ThinkingLevel.LOW` |
| `lib/extract/structureFromImage.ts` | UPDATE | Comment at `thinkingLevel: ThinkingLevel.MEDIUM` |
| `eval/stability.ts` | UPDATE | Skip message now names both env vars |
| `README.md` | UPDATE | `GEMINI_MODEL` documented, OpenRouter default aligned, accurate jsonSchema/thinkingLevel split replacing the old blanket "silently don't apply" line |
| `CLAUDE.md` | UPDATE | "Two providers, one seam" paragraph rewritten to match shipped behavior |
| `.agents/PRDs/PRD.md` | UPDATE | §4 regression + Out-of-Scope lines closed/settled, §8 stack row, §9 config table (`GEMINI_MODEL` row added, stale "undocumented" claims dropped), §12 Phase 7 P2-1/P2-2 closed, §14 risk row updated |

## Deviations from Plan

1. **Gemini-only live verification (Task 9, AC #6, first half) — externally blocked, not a code defect.** Running `npm run eval:ai` with only `GEMINI_API_KEY` active hit the Gemini free-tier daily quota: `429 RESOURCE_EXHAUSTED — Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.5-flash`. This is unrelated to any code change in this plan (no Gemini-path request-building logic changed except the `GEMINI_MODEL` override, which is a one-line env-var read). The failure surfaced correctly through the existing `retryOnce`/`warnAiFailure` path (429 classified correctly, retried once, then `stability.ts` printed `(no captures with a live interpretation to score)` rather than crashing) — proving the existing degrade-gracefully contract still holds. **Not re-run**: the quota is a 24h window; re-run `OPENROUTER_API_KEY= npm run eval:ai` once the daily Gemini quota resets to get a live pass/fail reading.

2. **OpenRouter-side Jaccard stability floor (Task 9, AC #6, second half) — inconsistent, but confirmed pre-existing on `main`, not a regression.** Running `npm run eval:ai` with only `OPENROUTER_API_KEY` active (`google/gemini-2.5-flash`, matching the locally-configured `OPENROUTER_MODEL` override) produced inconsistent results across repeated runs — sometimes clearing the 0.5/0.3 Jaccard floors, sometimes not (observed adjective Jaccard as low as 0.19–0.39 on `dark-mode`, and once 0.25 on `clean-light`). To rule out a regression from this plan's `json_schema` change, I stashed all changes, checked out the unmodified `main` code, and ran the identical OpenRouter-only stability check twice: on unmodified `main`, `clean-light` also failed once (0.49/0.24, just under floor) and `dark-mode` was silently skipped both times (its `interpret()` call returned `null` on at least one of the 3 runs — a pre-existing flake). This establishes the instability predates DIST-056 and is a property of the routed model's response variance for this creative-description task over OpenRouter, not something this plan's `json_schema`/`thinkingLevel` changes caused. I also confirmed the **new** default model (`google/gemini-3.5-flash`, no `OPENROUTER_MODEL` override) is genuinely routable on OpenRouter (verified via a raw-fetch scratch script) and that the real 2048-token production budget does **not** truncate on it (verified via a direct `interpret()` call — populated, Zod-validated result, no truncation) — so AC #3 (the specific truncation concern) is satisfied even though the separate Jaccard-consistency metric is flaky on both old and new model strings. **Recommendation, not applied**: this pre-existing `eval:ai` OpenRouter flakiness is arguably worth its own follow-up issue (e.g. pinning `temperature: 0` for the interpretation lane, or loosening the floor for OpenRouter-routed models specifically) — out of scope for DIST-056, which is about contract parity, not about improving stability of an already-existing metric.

3. **Substitute verification used in place of a second, unblocked Gemini-only run**: since the Gemini path's request-building logic is unchanged except for the additive `GEMINI_MODEL` read, and typecheck/lint/eval (offline, using the Gemini-shaped code path indirectly via `extractFromCapture`, which never calls the network) all pass, the Gemini-side risk surface here is minimal. The narrower, more load-bearing verification — that the *new* OpenRouter-path code (real `json_schema`, one-time `thinkingLevel` warning, new default model) works end-to-end — was directly exercised via scratch scripts (deleted after use, per `CLAUDE.md`'s convention) and the `eval:ai` OpenRouter runs above.

No other deviations. All 9 tasks were implemented exactly as specced; file/line references in the plan matched the actual codebase at time of implementation.

## Tests Written

No unit test framework exists in this repo (per `CLAUDE.md`); `npm run eval` is the correctness gate for extraction logic (unaffected by this plan — no `lib/extract/**` files touched) and `npm run eval:ai` is the existing opt-in AI-lane stability check (exercised live per Task 9, see Validation Results / Deviations above). Three scratch verification scripts were written and deleted after use:

| Scratch script (deleted) | Purpose |
|---|---|
| `test-model-default.ts` | Initial `callModel` smoke test against the new OpenRouter default with an artificially tiny `max_tokens: 20` — returned `null`, prompting the raw-fetch follow-up below |
| `test-model-raw.ts` | Raw fetch to OpenRouter confirming `google/gemini-3.5-flash` is routable and returns `finish_reason: "length"` at `max_tokens: 20` (reasoning tokens alone consumed the tiny budget — expected given Gemini 3.5 thinks by default and `thinkingLevel` doesn't apply over OpenRouter) |
| `test-interpret-new-default.ts` | Full `interpret()` round-trip at the real 2048-token production budget against the new default model — non-null, Zod-validated, populated `identity`/`imageMood`, no truncation |

## GitHub Issue

Issue #104 (owner `laanhema`, repo `distill-design-scraper`) — comment added summarizing the implementation, branch, and the two live-verification caveats above; issue left open per the `issue-flow`/`issue-flow-done` split (a later step handles PR + close).
