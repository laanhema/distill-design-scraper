# Implementation Report

**Plan**: `.agents/plans/completed/todo-13-bring-ai-lane-json-schema-in-line-with-zod-plan.md`
**Branch**: `feature/todo-13-bring-ai-lane-json-schema-in-line-with-zod`
**Status**: COMPLETE

One check is PENDING and is not counted as passed: `npm run eval:ai` on the pinned Gemini model could not run, because `gemini-3.5-flash` answered every request with HTTP 503 for the 21 minutes of this run. It must be re-run before the issue's second acceptance criterion is ticked (see Validation Results and Deviations).

## Summary

`OUTPUT_SCHEMA` in `lib/interpret.ts` was a hand-written JSON Schema copy of `aiResponseSchema` that stated none of Zod's bounds. It is now `z.toJSONSchema(aiResponseSchema)`, so the schema that the interpretation lane sends to the provider is generated from the schema that gates the reply (`lib/interpret.ts`, `requestOnce`), and the two cannot drift. The sent schema now states `minItems: 3` and `maxItems: 6` on `identity.adjectives`, `minLength: 1` on `archetype` and `description`, `minItems: 1` on `imageMood.hero` and `.texture`, and the `^#[0-9a-fA-F]{6}$` pattern on the hex. It keeps the seven-role enum, `additionalProperties: false`, and the same three `required` fields as before. Two keywords are new besides the bounds: a top-level `$schema` and `default: []` on `roleRefinements`.

No keyword had to be stripped. OpenRouter accepted the generated schema, and the native Gemini API accepted it on a substitute model. `STRUCTURE_SCHEMA` (`lib/extract/structure/structureAI.ts`) was left as it is: the issue's criteria name the interpretation lane only, and that copy is in sync.

GitHub issue: #177 (finding M7 of `.agents/reviews/codebase-analysis-review.md:27`).

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Generate `OUTPUT_SCHEMA` from `aiResponseSchema` | `lib/interpret.ts` | PASS |
| 2 | Correct the two comments | `lib/schema.ts` | PASS |
| 3 | Say in the orchestration write-up where the sent schema comes from | `docs/architecture/orchestration.md` | PASS |
| 4 | Run the offline check and the two live checks, then delete the scratch files | `scratch/sent-schema-probe.mts`, `scratch/openrouter-accept-probe.mts` (scratch, deleted) | PASS for the offline check and the OpenRouter check; PENDING for the Gemini check |

## Validation Results

| Check | Result | Command / environment |
|-------|--------|-----------------------|
| Type check | PASS | `npm run typecheck` (also step 1 of `npm run check`) — host, Node v22.23.1 |
| Lint | PASS | `npm run lint` (also step 2 of `npm run check`) — host |
| Build | PASS | `next build` as step 3 of `npm run check` — host |
| Tests (eval gate) | PASS (3 fixtures at 100%, aggregate 100%, "all gates passed", same as the baseline on `main` at `e247fd7`) | `npm run eval` as step 4 of `npm run check` — host |
| Full CI gate | PASS (exit 0) | `npm run check` — host, no `verify.sh` instance running, scratch files moved out of the repo first |
| E2E 1: the request body states the bounds (offline) | PASS (8 checks `ok`, "all checks ok", exit 0; the same script exits 1 with 6 failed checks on `main`) | `npx tsx scratch/sent-schema-probe.mts` — host, `fetch` stubbed, no network, no real key |
| E2E 2: `npm run eval:ai` on Gemini, pinned model `gemini-3.5-flash` | PENDING — the provider answered 503 to every request; not a schema rejection | `( set -a; . ./.env.local; set +a; unset OPENROUTER_API_KEY OPENROUTER_MODEL; npm run eval:ai )` — host, live |
| E2E 2, substitute: the same command on the native Gemini API with `GEMINI_MODEL=gemini-3.5-flash-lite` | Schema accepted: PASS (9 of 9 requests accepted, 9 replies passed Zod, no `AI Interpretation lane failed` line). The script's stability gate: FAIL on this model (exit 1, 2 of 3 sites under the thresholds). The literal step was not met | the command above with `export GEMINI_MODEL=gemini-3.5-flash-lite` — host, live |
| E2E 3: one request accepted over OpenRouter | PASS (HTTP 200, reply passed Zod, "ACCEPTED", exit 0, no failure line) | `( set -a; . ./.env.local; set +a; npx tsx scratch/openrouter-accept-probe.mts )` — host, live, 1 call |
| E2E 4: full gate | PASS | `npm run check` — host |

### E2E 1 output (offline)

```
ok   the stubbed call returned an interpretation: true (expected true)
ok   one request was sent: 1 (expected 1)
ok   identity.adjectives minItems: 3 (expected 3)
ok   identity.adjectives maxItems: 6 (expected 6)
ok   identity.archetype minLength: 1 (expected 1)
ok   identity.description minLength: 1 (expected 1)
ok   imageMood.hero minItems: 1 (expected 1)
ok   imageMood.texture minItems: 1 (expected 1)
info roleRefinements hex pattern: "^#[0-9a-fA-F]{6}$"
info top-level keywords: $schema, type, properties, required, additionalProperties
info roleRefinements keywords: default, type, items

all checks ok
```

### E2E 2 (PENDING): the verbatim error on the pinned model

`npm run eval:ai` was run twice. Both runs printed six times, once for each of the two attempts on each of the three sites:

```
AI Interpretation lane failed (error, attempt 1): ApiError: {"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}
```

and ended with `(no captures with a live interpretation to score)` and exit 0. That exit code is not a pass: `eval/stability.ts:73` skips a site whose `interpret` call returns `null`.

The cause is the provider and not the schema. A control call with no JSON Schema at all (`callModel({ user, maxOutputTokens })`, text only, same key and model) failed with the same error, four times between 01:42 and 02:03 local time:

```
control call (no schema) failed: {"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}
```

### E2E 2, substitute: output on `gemini-3.5-flash-lite`

`GEMINI_MODEL` is the override that `callGeminiModel` already reads (`lib/aiLane.ts`), so no committed source changed for this run.

```
Distill AI-lane stability (§10) — 3 runs per site

  ✓ clean-light    adjectives 0.78  archetype 0.31
  ✗ dark-mode      adjectives 0.50  archetype 0.25
  ✗ adversarial-shell adjectives 0.43  archetype 0.39

  thresholds: adjectives ≥ 0.5, archetype ≥ 0.3

  ✗ AI lane unstable — check temperature/prompt
```

What this shows: Gemini's `responseJsonSchema` accepted the generated schema, with `$schema`, `default`, `pattern`, `minLength`, `minItems` and `maxItems`, on all 9 requests, and all 9 replies passed `aiResponseSchema` (a site is scored only when its three `interpret` calls return a value).

What it does not show: that the pinned `gemini-3.5-flash` accepts the schema, and that the lane is stable on it. The two `✗` lines are answers that varied between runs on a smaller model than the one the thresholds were set for. No control run of `main` was made on this model, so this run cannot say whether the variation has anything to do with the change.

### E2E 3 output (OpenRouter)

```
OpenRouter HTTP 200 OK
model: google/gemini-2.5-flash, provider: Google, finish_reason: stop
interpretation passed Zod: 6 adjectives, 3 hero, 4 texture, 0 role refinements

ACCEPTED
```

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/interpret.ts` | UPDATE | +13/-43 |
| `lib/schema.ts` | UPDATE (comments only) | +5/-2 |
| `docs/architecture/orchestration.md` | UPDATE | +1/-1 |

`eval/baseline.json`, `eval/corpus/*`, `lib/aiLane.ts`, `lib/extract/structure/structureAI.ts` and `AGENTS.md` are unchanged. `.agents/issues/todo-issues.md` was modified before this work began and was not touched.

## Deviations from Plan

1. **E2E step 2 was blocked by the provider and is PENDING.** Blocked: `npm run eval:ai` on the pinned `gemini-3.5-flash`. Error: the 503 `UNAVAILABLE` quoted above, also returned to a request with no schema. Substitute: the same command with `GEMINI_MODEL=gemini-3.5-flash-lite`, which covers "the native Gemini API accepts the generated keywords and the replies pass Zod" and does not cover the pinned model or its stability. To re-run once the model answers again, from the project root:
   `( set -a; . ./.env.local; set +a; unset OPENROUTER_API_KEY OPENROUTER_MODEL; npm run eval:ai )`
   It passes only with three `✓` lines, `✓ AI lane stable`, exit 0, and no `AI Interpretation lane failed` line.
2. **More live calls than the plan counted.** The plan counted 9 to 18 Gemini calls and 1 to 2 OpenRouter calls. Made: 12 Gemini requests that were refused with 503 (two `eval:ai` runs), 4 schema-free control calls (all 503), 1 model-list call, 9 Gemini calls on the substitute model, and 1 OpenRouter call.
3. **Two scratch scripts that the plan does not list**, both deleted: `scratch/gemini-control-probe.mts` (the schema-free control call) and `scratch/gemini-list-models.mts` (model names, to choose the substitute).
4. **The branch was created from a default branch with one modified tracked file.** The invoking request said to create the feature branch and to leave `.agents/issues/todo-issues.md` alone, so that change was carried onto the branch untouched instead of stopping.
5. **Nothing was committed or pushed**, by the project's git policy.

## Tests Written

| Test File | Test Cases |
|-----------|------------|
| None committed (the project has no test framework, `AGENTS.md`) | The change was exercised by two scratch scripts whose full text is in the plan: `sent-schema-probe.mts` (8 offline checks on the request body that `callModel` builds, red on `main`, green after the change) and `openrouter-accept-probe.mts` (one live request). The derivation itself needs no test: the sent schema is generated from the Zod schema, so a bound cannot be in one and missing from the other |
