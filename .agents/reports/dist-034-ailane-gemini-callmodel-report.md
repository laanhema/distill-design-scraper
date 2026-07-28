# Implementation Report

**Plan**: `.agents/plans/completed/dist-034-ailane-gemini-callmodel-plan.md`
**Branch**: `feature/dist-034-ailane-gemini-callmodel`
**GitHub Issue**: #68 (DIST-034)
**Status**: COMPLETE

## Summary

Rebuilt the single AI provider seam (`lib/aiLane.ts`) on the Google Gemini SDK (`@google/genai@2.13.0`), adding two new shared primitives:

- **`callModel(opts)`** — one model round-trip (images + system + user + optional native JSON mode), backed by exactly one lazily-constructed module-level `GoogleGenAI` client. Errors deliberately propagate; `null` is returned only for "call succeeded but produced no usable text".
- **`parseJsonLoose(text)`** — `JSON.parse` → outermost-brace-match → `null`, the one shared JSON extractor so no lane re-inlines a brace regex.

`ThinkingLevel` is re-exported so DIST-035/036/037 need no SDK import — preserving the "`lib/aiLane.ts` is the only file that imports a provider SDK" invariant. `retryOnce` was carried over byte-for-byte: this story changes the *provider*, not the fallback policy.

`@anthropic-ai/sdk` remains installed and all three call sites remain on Claude, so the story lands with **zero behavioural change** — the seam is built ahead of its consumers.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Add `@google/genai` `^2.13.0`; keep `@anthropic-ai/sdk`; `npm install` | `package.json`, `package-lock.json` | ✅ |
| 2 | Rewrite module docstring; `AI_MODEL = "gemini-3.5-flash"`; `aiLaneAvailable()` → `GEMINI_API_KEY` | `lib/aiLane.ts` | ✅ |
| 3 | Lazy module-level client + `ModelCall` + `callModel` + `ThinkingLevel` re-export | `lib/aiLane.ts` | ✅ |
| 4 | Add `parseJsonLoose` | `lib/aiLane.ts` | ✅ |
| 5 | Verify `retryOnce` byte-identical | `lib/aiLane.ts` | ✅ |
| 6 | Full gate (lint + typecheck + eval, baseline untouched) | — | ✅ |

## Validation Results

| Check | Command | Result |
|-------|---------|--------|
| Typecheck (dep only, no source changes — AC #1) | `npm run typecheck` | ✅ clean |
| Typecheck (final) | `npm run typecheck` | ✅ clean, exit 0 |
| Lint | `npm run lint` | ✅ clean, exit 0 |
| Regression gate | `npm run eval` | ✅ `clean-light` 100%, `dark-mode` 100%, aggregate 100%, "all gates passed" — `eval/baseline.json` **untouched**, `UPDATE_BASELINE` never set |
| Offline-with-key gate (AC #11) | `GEMINI_API_KEY=dummy npm run eval` | ✅ identical scores, zero network calls |
| Out-of-scope files unchanged | `git status --short` | ✅ only `lib/aiLane.ts`, `package.json`, `package-lock.json` modified |

There is no unit test framework in this repo (confirmed in `package.json` / CLAUDE.md); per the plan, `npm run eval` is the correctness gate and behavioural verification of the new primitive was done with a throwaway `npx tsx` scratch script, since deleted.

## End-to-End Verification

**1. Nothing broke** — ✅ `npm run lint && npm run typecheck && npm run eval` all clean, no score deltas.

**2. `npm run eval` stays offline with a Gemini key present** — ✅ `GEMINI_API_KEY=dummy npm run eval` produced identical output. `runStructureAILabeller`'s `forceHeuristicNaming` short-circuit fires before `aiLaneAvailable()`, and the interpretation lane isn't invoked by `eval/run.ts`.

**3. Live Gemini call** — ✅ all four scenarios verified via a throwaway `scratch-ailane.ts` run as `node --env-file=.env.local --import tsx ./scratch-ailane.ts` from the project root:

| Scenario | Result |
|---|---|
| text-only, no schema | Returned `"PONG"` |
| text-only + `jsonSchema` + `ThinkingLevel.MINIMAL` | Returned `{"name": "Ocean Breeze", "mood": "Serene"}` — **no markdown fence** in the raw text, proving native JSON mode via `responseMimeType` + `responseJsonSchema` is on and the schema dialect was accepted (no `400` on `response_json_schema`) |
| one image (base64 PNG from `eval/corpus/clean-light/capture.json`) + system prompt | Returned a plausible description of the screenshot's white background, top nav, headline and card grid — proving `inlineData` (raw base64, no data-URL prefix) and `systemInstruction` are wired correctly |
| `parseJsonLoose` edge cases | fenced → `{a:1}`; clean → `{b:2}`; `null` → `null`; blank → `null`; garbage → `null` |

**Caveat on which model served the live check** (see Deviations): the three network scenarios were executed against `gemini-3.5-flash-lite`, a sibling on the same API surface, because `gemini-3.5-flash` returned a persistent `503 UNAVAILABLE` ("This model is currently experiencing high demand") across 10+ attempts spread over ~15 minutes. The wiring under test (`inlineData`, `systemInstruction`, `responseJsonSchema`, `thinkingConfig`, `response.text`) is model-independent and is now proven end-to-end.

`AI_MODEL = "gemini-3.5-flash"` was independently confirmed to be a **valid, existing model id** by listing the account's available models:

```
GET https://generativelanguage.googleapis.com/v1beta/models
→ gemini-3.5-flash present: true
```

Per the plan's risk table, only a `404` / "model not found" warrants correcting the constant. A `503` is transient capacity pressure (the same class as the plan's documented `429`), so `AI_MODEL` was left at the planned value.

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/aiLane.ts` | UPDATE | +117 / -6 |
| `package.json` | UPDATE | +1 |
| `package-lock.json` | UPDATE | regenerated by `npm install` (38 packages added) |

Scratch script `scratch-ailane.ts` was created for E2E step 3 and deleted afterwards, per CLAUDE.md.

## Acceptance Criteria

| AC | Status |
|---|---|
| `@google/genai` ^2.13.0 in `dependencies`; `@anthropic-ai/sdk` still present; typecheck passes with no call-site changes | ✅ |
| `AI_MODEL === "gemini-3.5-flash"`; `aiLaneAvailable()` → `Boolean(process.env.GEMINI_API_KEY)` | ✅ |
| `callModel(opts)` exported with the specified signature; exactly one lazily-constructed module-level client | ✅ |
| `jsonSchema` set ⇒ both `responseMimeType: "application/json"` and `responseJsonSchema`; never `responseSchema`, never both | ✅ (single conditional spread; `responseSchema` appears nowhere in the file) |
| `parseJsonLoose` exported; clean/fenced JSON → object, `null` → `null` | ✅ (live-verified) |
| `retryOnce` byte-identical | ✅ (block extracted from `HEAD` and from the working tree, `diff` reported no differences) |
| Docstring no longer says "every Claude-backed lane" | ✅ (now "every AI-backed lane") |
| `ThinkingLevel` re-exported | ✅ |
| `npm run lint` and `npm run typecheck` clean | ✅ |
| `npm run eval` passes against unmodified `eval/baseline.json` | ✅ |
| `GEMINI_API_KEY=dummy npm run eval` still passes offline | ✅ |
| No changes to `lib/interpret.ts`, `structureAI.ts`, `structureFromImage.ts`, `imageMediaType.ts`, `README.md`, `CLAUDE.md`, `eval/**`, `app/**` | ✅ |

## Deviations from Plan

1. **Live E2E network calls were served by `gemini-3.5-flash-lite`, not `gemini-3.5-flash`.** `gemini-3.5-flash` returned `503 UNAVAILABLE` on every attempt (10+ over ~15 minutes). Rather than skip the strongly-recommended live check, `AI_MODEL` was temporarily swapped to the sibling `gemini-3.5-flash-lite` to prove the `callModel` wiring, then reverted. The committed constant is `gemini-3.5-flash` exactly as the plan specifies, and its validity was confirmed via the models-list endpoint. No code deviation — only which model answered the probe.

2. **`503` added to the plan's expected-failure vocabulary.** The plan enumerated `404` / `429` / `400`. The observed failure was `503 UNAVAILABLE` (capacity), which reads like the `429` case: not a code bug, do not change the constant.

## Carried-Forward Flags (not fixed here, per plan scope)

- **`image/gif` in `ImageMediaType`.** `lib/extract/imageMediaType.ts:3` can emit `"image/gif"`, which Gemini does not accept — a GIF upload would `400` the vision lane. Explicitly out of scope for DIST-034 (the plan's risk table says flag, don't fix). Raise on **DIST-036/037** (the image-carrying lanes); the cheap fixes are transcoding GIF via `sharp` or narrowing the union.
- **`gemini-3.5-flash` capacity.** If `503`s persist when DIST-035/036/037 start making real calls, revisit the model choice or add backoff — `retryOnce`'s two attempts fire back-to-back with no delay, which is the wrong shape for a capacity error.
- **Free-tier rate limits (~10 RPM)** will bite before cost does; DIST-035/036/037 fire two AI calls and up to four images per `both`-mode analysis.

## Tests Written

No unit test framework exists in this repo and the plan explicitly forbids introducing one. Coverage was provided by:

| Gate | Cases |
|------|-------|
| `npm run eval` (offline capture replay) | `clean-light`, `dark-mode` — both at 100%, baseline untouched |
| `GEMINI_API_KEY=dummy npm run eval` | offline short-circuit holds with a key present |
| Throwaway `scratch-ailane.ts` (deleted) | `callModel` text-only; `callModel` + native JSON mode + `ThinkingLevel.MINIMAL`; `callModel` + image `inlineData` + `systemInstruction`; `parseJsonLoose` × 5 (clean, fenced, `null`, blank, garbage) |
