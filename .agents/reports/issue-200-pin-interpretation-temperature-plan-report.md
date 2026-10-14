# Implementation Report

**Plan**: `.agents/plans/completed/issue-200-pin-interpretation-temperature-plan.md`
**Branch**: `feature/issue-200-pin-interpretation-temperature`
**Status**: COMPLETE

## Summary

The interpretation request sent no `temperature`, so the routed model (`google/gemini-2.5-flash` over OpenRouter) sampled at its default (1.0 on Gemini) and worded the same reading differently on each run, which failed the `npm run eval:ai` word-level Jaccard floors. `ModelCall` now has an optional `temperature`, which `callModel` sends only when a lane sets it (conditional spread, like `jsonSchema`). The interpretation lane sets it through `TEMPERATURE = 0` in `lib/interpret.ts`. The structure lanes send byte-identical requests as before. `RUNS`, `ADJECTIVE_JACCARD_FLOOR` and `ARCHETYPE_JACCARD_FLOOR` are unchanged. `eval/stability.ts` names the pin and its cause, and `docs/architecture/orchestration.md` no longer says the request carries only `max_tokens`.

The temperature value is 0, the plan's proposed default (Open Question resolved by the invoking request).

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 0 | Apply the prototype patch (`git apply --check`, then `git apply`) | `lib/aiLane.ts`, `lib/interpret.ts` | PASS |
| 1 | Reproduction probe: red on `e7f8d9a`, green on the patched tree, then deleted | `scratch/temperature-probe.mts` (scratch) | PASS |
| 2 | Record the pin and its reason (#200) in the doc comment; floors unchanged | `eval/stability.ts` | PASS |
| 3 | Correct the orchestration write-up (optional `temperature`, interpretation sends `0`, structure lanes none) | `docs/architecture/orchestration.md` | PASS |
| 4 | Live acceptance: 5 consecutive `npm run eval:ai` passes | none (live) | PASS |
| 5 | Full gate | none | PASS |

## Validation Results

| Check | Result | Command / environment |
|-------|--------|-----------------------|
| Reproduction | PASS | `npx tsx scratch/temperature-probe.mts` — host, Node v22.23.1. Red on a detached worktree of `e7f8d9a` (exit 1, `FAIL interpretation request sends temperature 0`), run before the patch was applied; green on the patched tree (exit 0, three `ok` lines) |
| Type check | PASS | `npm run typecheck` (and the `npm run check` step) — host |
| Lint | PASS | `npm run lint` (and the `npm run check` step) — host |
| Build | PASS | `npm run check` build step — host; no `verify.sh` instance (`.verify/current.env` absent) |
| Tests (eval) | PASS (3 of 3 required fixtures at 100%) | `npm run check` eval step — host. `clean-light`, `dark-mode`, `adversarial-shell` combined 100%; `stripe`, `linear`, `vercel` skipped (optional) |
| E2E 1: offline probe | PASS | as Reproduction |
| E2E 2: 5 consecutive live `eval:ai` runs | PASS (5 of 5) | `( set -a; . ./.env.local; set +a; npm run eval:ai )` ×5 with key redaction — host, `OPENROUTER_MODEL=google/gemini-2.5-flash`. Each run: exit 0, three `✓` site lines, `✓ AI lane stable`; zero `AI Interpretation lane failed` lines across all 5 |
| E2E 3: full gate | PASS | `test ! -e .verify/current.env && npm run check` — exit 0 |

Live `eval:ai` scores (adjectives / archetype; floors 0.5 / 0.3):

| Run | clean-light | dark-mode | adversarial-shell |
|-----|-------------|-----------|-------------------|
| 1 | 0.89 / 0.41 | 0.56 / 0.67 | 0.78 / 0.67 |
| 2 | 0.61 / 0.75 | 0.71 / 1.00 | 0.51 / 0.58 |
| 3 | 1.00 / 1.00 | 0.57 / 0.44 | 0.63 / 0.67 |
| 4 | 1.00 / 1.00 | 0.58 / 1.00 | 0.89 / 0.52 |
| 5 | 0.62 / 0.75 | 0.81 / 1.00 | 1.00 / 1.00 |

Lowest across the 5 runs: adjectives 0.51 (`adversarial-shell`, run 2), archetype 0.41 (`clean-light`, run 1). These margins are narrower than the planning measurements (0.79 / 0.63 over 2 runs): temperature 0 on Gemini is near-deterministic, not exact. The acceptance criterion is met, but the adjective margin of 0.01 on one site-run means an occasional future dip below 0.5 is plausible. A follow-up could tighten the prompt's adjective vocabulary if that happens; the floors were not touched.

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/aiLane.ts` | UPDATE | +7/-0 |
| `lib/interpret.ts` | UPDATE | +7/-0 |
| `eval/stability.ts` | UPDATE | +6/-0 |
| `docs/architecture/orchestration.md` | UPDATE | +1/-1 |

## Deviations from Plan

- The probe script was kept in the session scratchpad and copied into the base worktree and into `scratch/` of the repository for each run; `scratch/` was deleted after the green run (`test ! -e scratch` passes). Same commands and outcomes as the plan.
- The full gate (`npm run check`) ran concurrently with the first live `eval:ai` run. They share no output (`eval:ai` does not use `.next/`), so the results are independent.
- Observed, not a deviation: the live margins (lowest 0.51 / 0.41) were narrower than the plan's measured 0.79 / 0.63. Recorded above.

## Tests Written

No unit-test framework in this project (per `AGENTS.md`). The change was exercised by:

| Test | Test Cases |
|------|------------|
| Offline probe `scratch/temperature-probe.mts` (scratch, deleted) | `interpret` returns a value; the interpretation request body has `temperature: 0`; a `callModel` call without `temperature` sends no `temperature` key |
| `npm run eval:ai` (live, 5 runs) | All three sites above both floors in every run, no interpretation failure |
| `npm run eval` (via `npm run check`) | Measured lane unchanged at 100% (does not call `interpret`) |

Not run live: the code-default model `google/gemini-3.5-flash` (OpenRouter lists `temperature` as supported for it; out of scope per the plan).
