# Code Review: feature/todo-25-remove-native-gemini-provider-path

**Scope**: branch `feature/todo-25-remove-native-gemini-provider-path` against `main` at `00aaea0` (the branch tip equals `main`; all of the work is uncommitted in the working tree: 18 tracked files modified, 3 untracked files under `.agents/`). GitHub issue #199.
**Recommendation**: APPROVE WITH NITS

## Summary

The change removes the native Gemini provider path so that the AI lane runs over OpenRouter only: `callOpenRouterModel` becomes the exported `callModel`, `callGeminiModel`, `AI_MODEL`, the SDK client, `ModelCall.thinkingLevel` and its warning are deleted, `@google/genai` leaves `package.json` and the lockfile, and the messages, the comments, the verify skill and the docs name one provider. The code is a clean deletion: every file of the diff was read in full with its callers, the request that reaches OpenRouter is byte-identical to the one `main` sends, and the full gate passes. Two Low findings remain, both wording. No file was reviewed only lightly; the 1051-line prototype patch was checked by reverse-applying it against the tree (`git apply --check -R` passes, so the tree holds exactly what it wrote) instead of line by line.

Acceptance criteria of #199, read with the owner's decision of 2026-10-14 (issue comment of 00:33Z):

1. **`callModel` has one path; `callGeminiModel`, `AI_MODEL`, every read of `GEMINI_API_KEY` and `GEMINI_MODEL` gone; `@google/genai` out of `package.json` and the lockfile — MET.** `git grep` for `GEMINI_API_KEY|GEMINI_MODEL|callGeminiModel|AI_MODEL|thinkingLevel|ThinkingLevel|@google/genai|GoogleGenAI|aistudio` over `lib app eval scripts package.json package-lock.json .claude/skills/verify/scripts` prints nothing. The exports of `lib/aiLane.ts` are `aiLaneAvailable, callModel, parseJsonLoose, retryOnce, warnAiFailure`. The lockfile diff removes 37 package entries and flips 4 (`@types/node`, `debug`, `ms`, `undici-types`) to `"dev": true`; `npm ci --dry-run` on the two files exits 0; `node_modules/@google` is absent; the build output holds no reference to the SDK. An offline probe (review's own, `fetch` stubbed) shows that with only `GEMINI_API_KEY` set, `aiLaneAvailable()` is `false`, all three lanes return their no-key result and no request leaves the process.
2. **`ModelCall` has no `thinkingLevel`, the three callers pass none, the warning is gone — MET.** `lib/aiLane.ts:20-33`, `lib/interpret.ts:140-146`, `lib/extract/structure/structureAI.ts:163-167`, `lib/extract/structureFromImage.ts:93-98`. The probe logs 0 `thinkingLevel` warnings on the branch and 1 on `main`.
3. **The tooling and the docs name OpenRouter as the only provider — MET.** README (`:65-67`, `:77-82`, `:125`), `techstack.md` (`:18`, `:54-57`), `docs/architecture/orchestration.md:7-9`, the PRD's current-state lines (`:202`, `:214-215`, `:230`, `:426`, `:435-437`, `:457`; the 11 remaining mentions are records of past phases or struck records with a #199 note), the verify skill (`SKILL.md:28`, `features/analyze-images.md:11`, `scripts/verify.sh:77-79`), the skip message (`eval/stability.ts:93`) and the setup hint (`app/page.tsx:428-436`, seen in the running app, see UI verification).
4. **All three AI lanes still return a validated reply over OpenRouter — MET, as the owner's decision reads it.** The literal clause "`npm run eval:ai` passes" is not a condition of this issue (owner comment; the unstable check is #200, open). The three pieces of evidence that the decision names were checked: (a) the implementer's two `eval:ai` outputs in the report show all three sites scored and no `AI Interpretation lane failed` line (not re-run here: paid calls, forbidden for this review); (b) the request-body claim was reproduced independently: the bodies of the three lanes on the branch and on an export of `main` are byte-identical (`cmp`; 126607, 8996 and 124625 bytes; sha256 `fe2946a0…`, `58125332…`, `c9850b8b…`, the values of the plan); (c) the implementer's `VERIFY_AI=1` run `.verify/runs/20261014-032553-737248` was captured at 03:26, after the last code edit at 03:20, and shows `meta.aiOutcome: applied` with an `ai`-provenance identity for the URL, `naming: ai` in the URL's `structure.md`, `fidelity: inferred` in the images' `structure.md`, all checks `ok`, empty `console-errors.txt`, and no failure line in `next.log`.
5. **`npm run check` passes — MET.** Run for this review, exit 0.

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions (Low)

- **L1** `lib/interpret.ts:148` — the comment still says "Native JSON mode should return clean JSON", and native JSON mode was the removed Gemini path's `responseMimeType` + `responseJsonSchema` (the PRD calls it "Gemini path only" at `.agents/PRDs/PRD.md:79`). **Why:** the change rewrote the same term in `ModelCall.jsonSchema` (`lib/aiLane.ts:25`) but left it at the caller, so the comment describes a mechanism that no longer exists; the request now carries a non-strict `response_format: json_schema`, which the routed model may not honor. **Fix:** reword to "The `json_schema` response format should return clean JSON, but a fence or a refusal preamble is still possible".
- **L2** `.agents/PRDs/PRD.md:446` — the closure note is appended without a sentence break: "…rather than silently dropped **Closed 2026-10-14 (#199):** the native Gemini path…". **Why:** the cell reads as one run-on sentence, unlike the two other #199 notes (`:65`, `:102`), which follow a full stop. **Fix:** put a full stop after "silently dropped".

**Noted, not a finding**:

- A setup that has only `GEMINI_API_KEY` loses the AI lane with no migration message, and the README's free-key option goes away (owner approved in the issue's technical notes; #158 holds the open question). The user story at `.agents/PRDs/PRD.md:118` ("an AI lane I can actually turn on without a prepaid credit purchase", Phase 5) is therefore no longer met by the default configuration; it is a Phase 5 record and was left as written.
- No thinking cap is sent over OpenRouter, and none was sent before this change (plan decision; `lib/aiLane.ts:27-31` and `docs/architecture/orchestration.md:9` say so).
- The live checks ran against the host's `OPENROUTER_MODEL` (`google/gemini-2.5-flash` per the plan), not the default `google/gemini-3.5-flash` (plan's open question, default accepted). The probe confirms that an unset `OPENROUTER_MODEL` sends `google/gemini-3.5-flash`.
- Pre-existing and identical on `main`: an OpenRouter reply with HTTP 200 and an `error` body instead of `choices` makes `callModel` return `null` (`lib/aiLane.ts:133-134`), so the lane retries and falls back with no `failed` line (probe: 2 requests, 0 warnings). OpenRouter documents that shape for errors raised after the model started. It is outside this change, which sends and reads the same bytes as `main`; a follow-up issue would cover it.
- `.agents/design-system/distill-design-system/design-system/README.md:18` and `components/Alert/preview.html:9` still show `GEMINI_API_KEY`. They are a design-system reference bundle that the criterion does not list, and the preview's hint text already differed from the app on `main`.
- `.agents/issues/todo-issues.md` and the git-ignored `TODO.md` still list the task as open (`/update-issues` and `/update-todo` own them). The plan's metadata row cites the patch at its pre-move path, as the other plans in `completed/` do.
- `.env.local` still defines `GEMINI_API_KEY`; it is unused now (the report tells the owner).

## Validation Results

| Check | Status | Notes |
|-------|--------|-------|
| Build / Type Check | PASS | `npm run check` (the command CI runs: typecheck → lint → build → eval), host, Node v22.23.1, npm 10.9.8, no verify instance up; `tsc --noEmit` clean, `next build` "Compiled successfully" |
| Warnings | NONE | `tsc`, `eslint .` and `next build` printed no warning in the `npm run check` log |
| Lint | PASS | `eslint .` as step 2 of `npm run check`, host |
| Tests | PASS | `npm run eval` as step 4 of `npm run check`: `clean-light`, `dark-mode`, `adversarial-shell` at 100% combined, `✓ all gates passed`, `eval/baseline.json` untouched. Skipped by design: `stripe`, `linear`, `vercel` (optional live entries with no committed capture). The eval passes `forceHeuristicNaming` and never calls `callModel`, so it does not exercise this change. `npm run eval:ai` was NOT run (9 paid live calls per run, excluded for this review; not a condition of #199 after the owner's decision, tracked in #200). The changed code was exercised by an offline probe in the scratchpad (stubbed `fetch`, run on the branch and on a `git archive main` export with a stub for the removed SDK, deleted afterwards): Gemini-only setup is a no-key setup, one request per lane to `https://openrouter.ai/api/v1/chat/completions`, top-level fields `model, messages, max_tokens[, response_format]`, bodies byte-identical to `main`. Also: `npm ci --dry-run --ignore-scripts --offline` on `package.json` + `package-lock.json` exits 0. `npm ls --all` reports `invalid: @img/sharp-wasm32@0.35.3` under `next`'s nested `sharp@0.34.5`; the lockfile diff does not touch those entries, so it is unrelated to this change |
| UI verification | PASS | `/verify`, AI lane off, run `20261014-033741-754114`, `head 00aaea0-dirty`, `doctor` all `ok`: `verify.sh drive analyze-url` (10 checks ok, 1280×900), `drive analyze-images` (15 checks ok, 1280×900), `drive tab-layout` (41 checks ok at 1280, 1024, 768 and 390 px, no horizontal overflow), then `verify.sh down`. Captures under `.verify/runs/20261014-033741-754114/evidence/`: `analyze-url-033753/02-result-preview.{png,aria.yaml}` (the hint reads `Set` / `code: OPENROUTER_API_KEY` / `in` / `code: .env.local` / `…Get an OpenRouter key at` / `link "openrouter.ai/keys"` → `https://openrouter.ai/keys`), `tab-layout-033803/11-tab-bar-390-preview.png` (the hint wraps to three lines inside its box at phone width, nothing truncated), `analyze-images-033800/03-result-preview.{png,aria.yaml}` and `response.json` (banner and `structureUnavailableReason`: `Structure inference for images requires an AI key — set OPENROUTER_API_KEY.`). All three `console-errors.txt` are empty. The image banner was captured at 1280 px only, since no scenario resizes the image flow; its text got shorter. `https://openrouter.ai/keys` answers 307 to OpenRouter's key page. The AI-on screens were not re-driven (paid calls); the implementer's run of 03:26 was checked instead, see criterion 4 |

## What's Good

- The removal is complete in one pass: one exported function instead of a dispatcher around a private one, no leftover flag, client or re-export, and no reference in the build output.
- The request bytes did not change, and the plan made that a checkable claim (per-lane sha256), which this review reproduced on both trees.
- The no-key behavior is consistent across the seam: `aiLaneAvailable()`, the route's caching gate (`app/api/analyze/route.ts:219`), the UI hint and the image banner all follow the one variable.
- The docs were rewritten for the current state while the PRD's delivery records were kept as history with dated #199 notes.
- The implementer reported the `eval:ai` step as not met instead of passing it, ran a control on `main`, and the gap has its own issue (#200).

## Recommendation

Mergeable as it stands. Fix L1 and L2 with `/fix-findings .agents/reviews/feature-todo-25-remove-native-gemini-provider-path-review.md` if wanted, then `/issue-flow-done 199`. Consider a follow-up issue for the HTTP-200 error body that `callModel` reads as an empty reply (pre-existing, see the notes).
