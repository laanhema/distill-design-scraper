# Implementation Report

**Plan**: `.agents/plans/completed/issue-209-seed-interpretation-lane-plan.md`
**Branch**: `feature/issue-209-seed-interpretation-lane`
**Status**: COMPLETE

## Summary

The interpretation lane now sends a seed (`SEED = 7`, `lib/interpret.ts`) alongside its temperature 0 pin. `ModelCall` gained an optional `seed`. When a lane sets it, `callModel` (`lib/aiLane.ts`) sends `seed` plus the OpenRouter provider preference `provider: { order: ["google-ai-studio"] }`, with fallbacks still allowed. Lanes that set no seed, which today means the structure lanes, send requests byte-identical to before. The `eval/stability.ts` notes and failure hint, and the `docs/architecture/orchestration.md` paragraph, now describe the seed and the provider preference instead of the open #209 gap. The prompt, `RUNS`, both floors and `TEMPERATURE` are unchanged, as the owner decided on #209.

Named cause (first acceptance criterion): the interpretation request sent no `seed`, and OpenRouter split calls between Google AI Studio and Google Vertex. Gemini 3.5 Flash does not repeat a reply at temperature 0 without a seed, and of the two endpoints only AI Studio honours one. The plan's Evidence section has the measurements.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 0 | Reproduction red on `3d5b129`, then prototype patch applied (`git apply --check` clean) | `lib/aiLane.ts`, `lib/interpret.ts` | PASS |
| 1 | Stability check notes and failure hint (`check temperature/seed/prompt`) | `eval/stability.ts` | PASS |
| 2 | Orchestration write-up: seed + AI Studio preference replaces the "still fails its floors (#209)" sentence | `docs/architecture/orchestration.md` | PASS |
| 3 | Named cause recorded on #209 (folded into the implementation comment, as the plan allows) | GitHub #209 | PASS |
| 4 | Offline probe red on base, green after patch; `scratch/` deleted | `scratch/seed-probe.mts` (deleted) | PASS |
| 5 | Live: 5 consecutive `npm run eval:ai` passes per model | live | PASS |
| 6 | Full gate `npm run check` | none | PASS |

## Validation Results

| Check | Result | Command / environment |
|-------|--------|-----------------------|
| Type check | PASS | `npm run typecheck` (also step 1 of `npm run check`): host, Node v22 |
| Lint | PASS | `npm run lint` (also in `npm run check`): host |
| Build | PASS | `npm run check` (`next build`): host |
| Tests (measured-lane eval) | PASS: `clean-light`, `dark-mode`, `adversarial-shell` all 100% combined; `stripe`, `linear`, `vercel` skipped (optional) | `test ! -e .verify/current.env && npm run check`: host, exit 0, "✓ all gates passed" |
| Reproduction | PASS: red before the fix, green after it | `npx tsx scratch/seed-probe.mts` from the project root. On the unpatched tree (HEAD `3d5b129`), exit 1 with `FAIL interpretation request sends a numeric seed` and `FAIL interpretation request prefers google-ai-studio, fallbacks allowed`. After the patch, exit 0 with five `ok` lines |
| Live stability, default model (`OPENROUTER_MODEL=` → `google/gemini-3.5-flash`) | PASS, 5/5 consecutive | `set -a; . ./.env.local; set +a; OPENROUTER_MODEL= npm run eval:ai` |
| Live stability, `google/gemini-2.5-flash` | PASS, 5/5 consecutive | `set -a; . ./.env.local; set +a; OPENROUTER_MODEL=google/gemini-2.5-flash npm run eval:ai` |

### Live run record (adjectives / archetype Jaccard; floors 0.5 / 0.3)

Every run printed three `✓` site lines and `✓ AI lane stable`. No run printed an `AI Interpretation lane failed` line. There were no transient errors and no re-runs. 90 live calls in total.

| Model | Run | Exit | clean-light | dark-mode | adversarial-shell |
|-------|-----|------|-------------|-----------|-------------------|
| default (`google/gemini-3.5-flash`) | 1 | 0 | 1.00 / 1.00 | 1.00 / 1.00 | 1.00 / 1.00 |
| default | 2 | 0 | 1.00 / 1.00 | 1.00 / 1.00 | 1.00 / 1.00 |
| default | 3 | 0 | 1.00 / 1.00 | 1.00 / 1.00 | 1.00 / 1.00 |
| default | 4 | 0 | 1.00 / 1.00 | 1.00 / 1.00 | 1.00 / 1.00 |
| default | 5 | 0 | 1.00 / 1.00 | 1.00 / 1.00 | 1.00 / 1.00 |
| `google/gemini-2.5-flash` | 1 | 0 | 1.00 / 1.00 | 1.00 / 1.00 | 0.89 / 0.70 |
| `google/gemini-2.5-flash` | 2 | 0 | 1.00 / 1.00 | 1.00 / 1.00 | 0.89 / 0.70 |
| `google/gemini-2.5-flash` | 3 | 0 | 1.00 / 1.00 | 1.00 / 1.00 | 1.00 / 1.00 |
| `google/gemini-2.5-flash` | 4 | 0 | 1.00 / 1.00 | 1.00 / 1.00 | 0.89 / 0.70 |
| `google/gemini-2.5-flash` | 5 | 0 | 1.00 / 1.00 | 1.00 / 1.00 | 0.89 / 0.70 |

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/aiLane.ts` | UPDATE | +19/-0 |
| `lib/interpret.ts` | UPDATE | +6/-0 |
| `eval/stability.ts` | UPDATE | +12/-10 |
| `docs/architecture/orchestration.md` | UPDATE | +1/-1 |

## Deviations from Plan

- **Reproduction red run done in place, not in a detached worktree.** The branch was cut from `3d5b129` with no code changes yet, so I ran the probe in the repository before applying the patch. That tests the same code as the plan's `git worktree add --detach … 3d5b129` step without needing the worktree.
- **Task 3 folded into the implementation comment.** The plan allows this. The named cause and the configurations table are in the single implementation comment on #209, not in a separate comment.
- **Working tree holds changes outside this task.** `TECHSTACK.md` was already modified before the run (a tracked change, carried onto the feature branch because the invoking request said to create/use a branch). During the run, `README.md`, `package.json` (version `0.1.2` → `0.6.0`, `author` added), `package-lock.json` and `TECHSTACK.md` were modified again by something outside this task (file mtimes 15:12–15:19, after the patch was applied). None of these belong to #209 and I did not touch them. Task 6's expectation that `git status` lists only the four files plus the plan files is therefore not literally met. Stage only the four files above when committing #209.

## Risks noted (out of scope, per plan)

- With temperature 0 and a fixed seed, `retryOnce` resends an identical request, so a reply that fails Zod would repeat on AI Studio and the repair retry adds nothing. This was not observed in any of the 90 calls. A retry with a different seed would be a separate change.
- If AI Studio is down, OpenRouter falls back to Vertex, where the seed does not hold. A failing `eval:ai` run then reflects provider availability, not a regression. The `eval/stability.ts` comment says this.

## Tests Written

The project has no unit-test framework. Per `AGENTS.md`, the change was exercised with a temporary scratch probe, deleted after use, plus the live `npm run eval:ai` gate. `npm run eval` does not exercise the AI lane.

| Test File | Test Cases |
|-----------|------------|
| `scratch/seed-probe.mts` (temporary, deleted) | interpret returns a value; interpretation request keeps temperature 0; sends a numeric seed; prefers `google-ai-studio` with fallbacks allowed; a call without a seed sends no `seed` and no `provider` key |
| `eval/stability.ts` (existing, live) | 10 runs, 5 per model, all passing |
