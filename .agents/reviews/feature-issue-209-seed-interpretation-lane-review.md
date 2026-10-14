# Code Review: feature/issue-209-seed-interpretation-lane

**Scope**: branch `feature/issue-209-seed-interpretation-lane` against its merge base `3d5b129` (no commits yet; uncommitted changes to `lib/aiLane.ts`, `lib/interpret.ts`, `eval/stability.ts`, `docs/architecture/orchestration.md`), checked against issue #209. The uncommitted edits to `README.md`, `TECHSTACK.md`, `package.json` and `package-lock.json` belong to someone else and are not part of #209, so this review leaves them out.
**Recommendation**: APPROVE WITH NITS

## Summary

The change adds an optional `ModelCall.seed` to `lib/aiLane.ts`. When a lane sets it, `callModel` sends `seed` and the OpenRouter preference `provider: { order: ["google-ai-studio"] }`, with fallbacks allowed. Only the interpretation lane sets it (`SEED = 7`). Calls without a seed send the same request as before. This is the fix route the owner chose in [the planning comment](https://github.com/laanhema/distill-design-scraper/issues/209#issuecomment-6168030815). The code is small and correct, and the docs match it. Both live models passed again in this review. The one finding is a Low nit about a comment.

Acceptance criteria (criteria 1 and 2 as the owner's planning comment changed them):

| # | Criterion | Met? | Evidence |
|---|-----------|------|----------|
| 1 | The cause of the variance on `google/gemini-3.5-flash` is named | Met | The owner comment replaced the three candidate causes with the measured one: no `seed` was sent, and the calls were split between AI Studio and Vertex. The implementation comment on #209 names this cause and rules out the three candidates with probe data (C0–C15). |
| 2 | `eval:ai` passes 5 consecutive runs with `OPENROUTER_MODEL` unset | Met | The implementation report records 5/5 passes at 1.00 / 1.00. The run in this review also passed at 1.00 / 1.00 on all three sites. The fix route is the seed plus provider preference that the owner comment accepted. |
| 3 | 5 consecutive passes still hold with `OPENROUTER_MODEL=google/gemini-2.5-flash` | Met | The report records 5/5 passes. The run in this review passed: 1.00 / 1.00, 1.00 / 1.00, and 0.89 / 0.70 on `adversarial-shell`. |
| 4 | No threshold lowered | Met | `ADJECTIVE_JACCARD_FLOOR`, `ARCHETYPE_JACCARD_FLOOR` and `RUNS` in `eval/stability.ts` are not in the diff. |
| 5 | The notes in `eval/stability.ts` and `orchestration.md` are updated | Met | `eval/stability.ts:14-23` and `docs/architecture/orchestration.md:9` now describe the seed and the AI Studio preference. A grep finds no remaining "still fails" or "known gap of #209" text in `docs/`, `lib/`, `eval/`, `app/` or `AGENTS.md`. |

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions (Low)

- **L1** `lib/interpret.ts:48` — The comment "Any fixed value works; 7 is the value that was measured." claims more than was measured: the plan probed only `seed: 7` (C3, C12, C14, C15). **Why:** Someone who changes the seed later will trust the comment and may not run `npm run eval:ai`. That cuts against the repo's "measured, never faked" rule. **Fix:** Reword the comment to state only what was measured, for example "7 is the only value measured; after changing it, rerun `npm run eval:ai`."

**Noted, not a finding**:
- At temperature 0 with a fixed seed, `retryOnce` sends an identical request, so on AI Studio a reply that fails Zod would fail again on the retry. The plan's risk table marks this out of scope, and none of the 90 implementation calls or the 18 review calls showed it.
- During an AI Studio outage, OpenRouter falls back to Vertex, where the seed is not honoured. The plan marks this out of scope, and `eval/stability.ts:20-23` documents it.
- If OpenRouter renames the `google-ai-studio` slug, the preference stops applying without any error. Only a live run would catch it. The plan marks this out of scope.

## Validation Results

| Check | Status | Notes |
|-------|--------|-------|
| Build / Type Check | PASS | `npm run check` (CI's single command): typecheck, then `next build`. Run on the host with no `verify.sh` instance up. |
| Warnings | NONE | The `npm run check` log has no warning or error lines. |
| Lint | PASS | `eslint .` as a step of `npm run check`, on the host. |
| Tests | PASS | `npm run eval` as a step of `npm run check`: `clean-light`, `dark-mode` and `adversarial-shell` each scored 100% combined. `stripe`, `linear` and `vercel` were skipped because they are optional entries with no committed capture, so they are not counted as passes. The measured-lane eval does not exercise the AI lane (`forceHeuristicNaming`). Live AI lane: one `npm run eval:ai` run per model, with the key loaded from `.env.local`. Default model: exit 0, 1.00 / 1.00 on all three sites. `google/gemini-2.5-flash`: exit 0, with 1.00 / 1.00, 1.00 / 1.00 and 0.89 / 0.70. 18 live calls in total. |
| UI verification | N/A | No UI change: the change touches only the server-side model request and docs. |

## What's Good

- The provider preference lives inside `lib/aiLane.ts` and is tied to `seed`. The lane only asks for a seeded call, and the provider details stay in the one file that may talk to a model provider.
- Calls without a seed send the same request body as before, so the structure lanes do not change.
- Fallbacks stay allowed. An AI Studio outage costs only repeatability, not the whole interpretation lane, and the comments say so.
- Each probe changed a single variable (C0–C15), so the named cause is backed by data rather than a guess. The three causes the issue listed are each ruled out with numbers.

## Recommendation

The change can merge. If you want, fix L1 with `/fix-findings .agents/reviews/feature-issue-209-seed-interpretation-lane-review.md L1`. When committing, stage only the four #209 files and the `.agents/` plan, report and review files. Leave out `README.md`, `TECHSTACK.md`, `package.json` and `package-lock.json`.
