# Code Review: feature/todo-13-bring-ai-lane-json-schema-in-line-with-zod

**Scope**: branch `feature/todo-13-bring-ai-lane-json-schema-in-line-with-zod` against its merge base `e247fd7` on `main`, for GitHub issue #177. The branch has no commits; the whole change is uncommitted in the working tree.
**Recommendation**: NEEDS CHANGES

## Summary

The change replaces the hand-written `OUTPUT_SCHEMA` literal in `lib/interpret.ts` with `z.toJSONSchema(aiResponseSchema)`, and updates two comments in `lib/schema.ts` and one paragraph of `docs/architecture/orchestration.md`. The code is correct and small, the CI gate passes, and an offline check of the request body shows that both provider branches now send every bound of the Zod gate. No code defect was found. The one High finding is an acceptance criterion with no passing run: `npm run eval:ai` on Gemini. Nothing but a live re-run is needed to close it.

Files reviewed in full: `lib/interpret.ts`, `lib/schema.ts` (the two changed comments and `aiResponseSchema`), `docs/architecture/orchestration.md`, `lib/aiLane.ts` (the caller of the schema), `eval/stability.ts`, and the untracked plan and implementation report. `.agents/issues/todo-issues.md` is modified in the tree, predates the branch, and was left out of the review.

### Acceptance criteria of #177

| Criterion | Result | Evidence |
|-----------|--------|----------|
| The sent schema states the bounds of `aiResponseSchema` | MET, verified in this review | Offline probe with `fetch` stubbed: the request bodies of the OpenRouter branch and of the Gemini branch both carry `minItems: 3` / `maxItems: 6` on the adjectives, `minLength: 1` on archetype and description, and `minItems: 1` on hero and texture |
| `npm run eval:ai` passes with a key on Gemini | NOT MET, and not verifiable in this review (H1) | No passing run exists. This review made no live provider call |
| The request is accepted over OpenRouter | MET by the implementer's log; not re-run in this review | `openrouter-accept.log` (written 01:43:31, after the last edit of `lib/interpret.ts` at 01:42:03): HTTP 200, `google/gemini-2.5-flash`, reply passed Zod |
| `npm run check` passes | MET, verified in this review | Exit 0; eval 100% on all three fixtures |

## Issues Found

### Critical

None

### High Priority

- **H1** `lib/interpret.ts:63` — The acceptance criterion "`npm run eval:ai` passes with a key on Gemini" has no passing run. On the pinned `gemini-3.5-flash` every request was answered with HTTP 503 (the implementer's two logs), the only run that completed was on the substitute `gemini-3.5-flash-lite` and exited 1 on the stability gate (`dark-mode` 0.50 / 0.25 and `adversarial-shell` 0.43 / 0.39 against thresholds 0.5 / 0.3), and this review could not run it (the provider answers 503 and 429, and live calls were ruled out). **Why:** The generated schema newly carries `$schema`, `default`, `pattern` and `minLength`, and only a live call shows that the pinned model accepts them; a 400 would fail both attempts and drop `identity` and `imageMood` from every report on the default provider path. The failed substitute run also has no control run of `main`, so an effect of the tighter schema on stability is not ruled out. **Fix:** No code change. When the model answers again, run `( set -a; . ./.env.local; set +a; unset OPENROUTER_API_KEY OPENROUTER_MODEL; npm run eval:ai )` from the project root. It passes only with three `✓` lines, `✓ AI lane stable`, and no `AI Interpretation lane failed` line (the script exits 0 when every site is skipped, `eval/stability.ts:73`). If a `✗` line appears, run the same command on `main` in a throwaway worktree as the control before judging the change. If a 400 names a keyword, follow the rule of Task 4 in the plan.

### Medium Priority

- **M1** `lib/interpret.ts:54` — The comment says that the provider is told every bound and that only a real request shows whether a provider accepts a generated keyword, and `docs/architecture/orchestration.md:7` says that the two cannot drift, but the installed SDK documents which keywords Gemini's `responseJsonSchema` supports (`node_modules/@google/genai/dist/genai.d.ts:5054-5068`): `minItems` and `maxItems` are on that list, and `minLength`, `pattern`, `default` and `$schema` are not. **Why:** On the native Gemini path, the default one, the non-empty archetype and description bounds and the hex pattern are sent but are not documented as applied. So the failure that the issue describes (a reply that the provider accepts fails Zod, and after the retry the lane is dropped) stays possible for those three fields, and a reader of the comment would think it closed. The acceptance criterion itself ("states the bounds") is met. **Fix:** Add one sentence to the comment of `OUTPUT_SCHEMA` and to `orchestration.md:7`: Gemini documents the item counts (adjectives, hero, texture) as supported, and the `minLength` and `pattern` bounds are stated but outside its documented list, so Zod stays the only gate for them there.

### Suggestions (Low)

- **L1** `lib/interpret.ts:63` — The call relies on the default `io: "output"` of `z.toJSONSchema` to keep `roleRefinements` in `required`, and nothing in the code says so. **Why:** With `io: "input"` the top-level `required` becomes `["identity", "imageMood"]` (checked in this review), which is the one place where the sent schema and the Zod gate differ: Zod's `.default([])` accepts a reply without the field, and `SYSTEM_PROMPT` (`lib/interpret.ts:50`) tells the model that it may omit it. The decision is recorded only in the plan. **Fix:** Add a clause to the comment that the output mode is intended and that the sent schema is stricter than Zod for `roleRefinements`, or pass `{ io: "output" }` explicitly.

**Noted, not a finding**: `STRUCTURE_SCHEMA` (`lib/extract/structure/structureAI.ts:31`) is still a hand-written mirror; the issue's criteria name the interpretation lane only, and the technical notes call it in sync. The OpenRouter evidence is on the configured model `google/gemini-2.5-flash`, not on the default `google/gemini-3.5-flash` of `lib/aiLane.ts:89`; the criterion as worded is met. The prompt-versus-`required` mismatch of L1 exists on `main` too (the old literal also listed `roleRefinements` as required). `npm run eval` passes `forceHeuristicNaming` and never calls `interpret`, so the eval gate does not exercise the changed line.

## Validation Results

| Check | Status | Notes |
|-------|--------|-------|
| Build / Type Check | PASS | `npm run check` (the command CI runs): `tsc --noEmit` and `next build` (Next.js 15.5.20). Host, Node v22.23.1, no dev server running |
| Warnings | NONE | The full output of `npm run check` has no warning from `tsc`, `eslint` or `next build` |
| Lint | PASS | `eslint .` as step 2 of `npm run check`. Host |
| Tests | PASS | `npm run eval` as step 4 of `npm run check`: `clean-light`, `dark-mode` and `adversarial-shell` at 100%, aggregate 100%, "all gates passed". Skipped by design: `stripe`, `linear`, `vercel` (optional entries with no committed capture). The eval gate does not call `interpret`. Reviewer's offline probe (scratchpad script, `fetch` stubbed before the SDK loads, dummy keys, no network): 43 checks, all ok, on the request bodies of both provider branches and on the Zod gate with boundary replies. SKIPPED: `npm run eval:ai` (a live provider call; the provider answers 503 and 429, and live calls were ruled out for this review), see H1 |
| UI verification | N/A | No markup, style or client-side change |

## What's Good

- The fix removes the copy instead of patching it. A bound that is added to `aiResponseSchema` now reaches the provider without a second edit, and the role enum comes from the same schema.
- The generated schema keeps the shape of the old literal: the same three `required` fields, `additionalProperties: false` on all four objects, and the seven-role enum. The Gemini and OpenRouter request bodies carry the identical schema.
- A schema that `z.toJSONSchema` cannot represent would throw when `lib/interpret.ts` loads, and `lib/analyze.ts` imports it, so `npm run eval` and the build would both fail in CI instead of in production.
- The implementation report does not count the blocked Gemini run as passed, quotes the 503 verbatim, and points out that the script's exit code 0 is not a pass. Its line counts and its `file:line` citations hold.
- The comments in `lib/schema.ts` and the paragraph in `orchestration.md` were updated with the code, and `STRUCTURE_SCHEMA` is described accurately as still hand-written.

## Recommendation

Close H1 with the live re-run of `npm run eval:ai` on the pinned Gemini model; no code change is expected. M1 and L1 are comment and documentation edits and can go in the same pass with `/fix-findings`.
