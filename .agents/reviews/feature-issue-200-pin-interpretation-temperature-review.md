# Code Review: feature/issue-200-pin-interpretation-temperature

**Scope**: branch `feature/issue-200-pin-interpretation-temperature` against its merge base `e7f8d9a` with `main` (no commits, uncommitted changes to 4 files), checked against issue #200
**Recommendation**: APPROVE WITH NITS

## Summary

The change adds an optional `ModelCall.temperature` that `callModel` sends only when a lane sets it, and pins the interpretation lane to `TEMPERATURE = 0`. `eval/stability.ts` and `docs/architecture/orchestration.md` record the pin. `RUNS` and both floors are unchanged. The code is small and correct, and it follows the conditional-spread pattern of `jsonSchema`. An offline probe confirms the request bodies: the interpretation request carries `temperature: 0`, and a call without the field sends no `temperature` key, so the structure lanes send the same bytes as before. All 4 files and the untracked plan, prototype patch, and implementation report were read in full.

The fix holds on the configured model `google/gemini-2.5-flash`. On the code-default model `google/gemini-3.5-flash`, which the plan did not run live, the check still failed in 2 of 2 runs with the pin in place (M1).

Acceptance criteria:

- **The cause is named: met.** The issue comment and the doc comment at `eval/stability.ts:14-18` name the missing `temperature` (the routed model sampled at its default). The plan's hypothesis table rules out the floors (H2), the prompt (H3), and a reasoning cap (H4) for the configured model. On the code-default model, the evidence for this cause does not hold (M1).
- **`npm run eval:ai` passes 5 consecutive runs with the configured model: met.** The implementation comment (posted 2026-10-14T11:16Z, after the code files were last changed at 11:03Z) gives 5 passing runs on `google/gemini-2.5-flash`. This review ran a sixth independently: exit 0, with `clean-light` 0.71 / 0.81, `dark-mode` 0.60 / 0.67, and `adversarial-shell` 1.00 / 1.00, and no `lane failed` line.
- **No threshold is lowered: met.** `RUNS = 3`, `ADJECTIVE_JACCARD_FLOOR = 0.5`, and `ARCHETYPE_JACCARD_FLOOR = 0.3` are unchanged (`eval/stability.ts:28-30`).

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority

- **M1** `eval/stability.ts:17` — The new doc comment says that a failure "first means the pin was lost or the routed model ignores it", and `docs/architecture/orchestration.md:9` says that the pin makes `npm run eval:ai` measure "a stable reading". This review measured both claims as false on the code-default model `google/gemini-3.5-flash`. **Why:** The plan did not run the default model live (Risks: "Out of scope: note in the report") and relied only on its OpenRouter listing as a model that supports `temperature`. With the pin in place and `OPENROUTER_MODEL` unset, `npm run eval:ai` exited 1 twice: `dark-mode` 0.52 / 0.28 in the first run, and `clean-light` 0.43 / 0.30 and `dark-mode` 0.78 / 0.15 in the second. The base commit `e7f8d9a` on the same model also exited 1 (`dark-mode` 0.51 / 0.18, `adversarial-shell` 0.16 / 0.26). On this model, the pin is present and the check still fails, so the comment sends the next maintainer to look for a lost pin that is not lost. Google also advises keeping Gemini 3 models at their default temperature of 1.0, so `0` may be the wrong value for that family. **Fix:** In `eval/stability.ts:14-18` and `docs/architecture/orchestration.md:9`, say that the pin was measured stable on `google/gemini-2.5-flash` and that the code default `google/gemini-3.5-flash` still fails the floors at temperature 0. Open a follow-up issue for the default model, covering a tighter prompt or a reasoning cap, or a per-model temperature. Do not lower the floors.

### Suggestions (Low)

- **L1** `eval/stability.ts:16` — "these floors failed on 4 of 4 runs that way" leaves out the recorded pass of 2026-10-14 02:33 (#177) that issue #200 itself cites. **Why:** A reader takes "4 of 4" to mean every measured run, which overstates the evidence. **Fix:** Write "failed on the last 4 runs on `main`", as the plan words it.

**Noted, not a finding**:

- The structure lanes still sample at the provider default. The plan scoped this out, and no stability check measures those lanes.
- `eval:ai` exits 0 when every interpretation fails, because it skips each such site. The plan flagged this as a separate change.
- At temperature 0, `retryOnce` sends the same request again, so a Zod-failing reply may repeat and the repair retry may add little. This was not observed: there were no `lane failed` lines across the 6 configured-model runs or the 3 default-model runs of this review.

## Validation Results

| Check | Status | Notes |
|-------|--------|-------|
| Build / Type Check | PASS | `npm run check` (typecheck → lint → build → eval, the CI command) on the host, exit 0. No `verify.sh` instance (`.verify/current.env` absent) |
| Warnings | NONE | No warning lines in the `npm run check` output |
| Lint | PASS | The `eslint .` step of `npm run check` |
| Tests | PASS | The `npm run eval` step of `npm run check`: `clean-light`, `dark-mode`, and `adversarial-shell` at combined 100%. `stripe`, `linear`, and `vercel` were skipped (optional, no capture). The eval never calls `interpret`, so it does not exercise this change. Other checks: (1) an offline probe from the scratchpad (stubbed `fetch`, the plan's script) gave 3 of 3 `ok`, exit 0. (2) A live `npm run eval:ai` on the configured `google/gemini-2.5-flash` passed. (3) A live `npm run eval:ai` on the default `google/gemini-3.5-flash` failed 2 of 2 runs on the branch and 1 of 1 on base `e7f8d9a` (see M1) |
| UI verification | N/A | No UI change |

## What's Good

- The field is optional and is spread in only when set, so the structure lanes send the same request bytes as before. The probe confirms this.
- `TEMPERATURE` is a named lane constant with a comment that explains it, which matches `MAX_TOKENS`.
- The fix comes from evidence: a reproduction on HEAD, a hypothesis table, and an offline probe that fails on base and passes on the branch. The floors stay unchanged, as the issue requires.
- The orchestration write-up's stale "carries only `max_tokens`" sentence was corrected in the same change.

## Recommendation

Fix M1 and L1, which are documentation changes plus a follow-up issue for the code-default model, then proceed to the PR. No code change is required for the configured model.
