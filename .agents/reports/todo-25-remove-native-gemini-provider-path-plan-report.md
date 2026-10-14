# Implementation Report

**Plan**: `.agents/plans/completed/todo-25-remove-native-gemini-provider-path-plan.md`
**Branch**: `feature/todo-25-remove-native-gemini-provider-path`
**Status**: COMPLETE (one plan step not met as written: the stability gate of `npm run eval:ai`. It fails the same way on unchanged `main`; see Validation Results and Deviations)

## Summary

The AI lane has one provider path, OpenRouter (GitHub issue #199). The prototype patch of the plan was applied unchanged. It removes `callGeminiModel`, `AI_MODEL`, the SDK client, the `thinkingLevel` field of `ModelCall` and its once-per-process warning, every read of `GEMINI_API_KEY` and `GEMINI_MODEL`, and the `@google/genai` dependency with its 36 transitive packages. `callOpenRouterModel` is now the exported `callModel`. The README, `techstack.md`, `docs/architecture/orchestration.md`, the PRD's current-state lines and the verify skill's Markdown were then brought in line by hand (Tasks 2 to 6).

The request that reaches OpenRouter did not change: the sha256 of each lane's request body equals the value measured on `main`.

Nothing was committed or pushed. The work is uncommitted on the branch.

For the owner: `.env.local` was not edited. Its `GEMINI_API_KEY` line is now unused and can be deleted.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 0 | Apply the prototype patch (`git apply --check`, then `git apply`) | 12 files of the patch | PASS |
| 1 | Sync `node_modules` with the patched lockfile (`npm install`: 37 packages removed, lockfile byte-identical afterwards) | `node_modules/` | PASS |
| 2 | Name OpenRouter as the only provider | `README.md` | PASS |
| 3 | Correct the tech-stack write-up | `techstack.md` | PASS |
| 4 | Correct the orchestration write-up | `docs/architecture/orchestration.md` | PASS |
| 5 | Bring the PRD's current-state lines in line | `.agents/PRDs/PRD.md` | PASS |
| 6 | Correct the verify skill's Markdown | `.claude/skills/verify/SKILL.md`, `.claude/skills/verify/features/analyze-images.md` | PASS |
| 7 | Offline probe and leftover-reference greps, scratch file deleted | `scratch/openrouter-only-probe.mts` (deleted) | PASS |
| 8 | Live checks, then the full gate | `.verify/` (git-ignored) | PASS, except the stability gate of `npm run eval:ai` (not met as written; see below) |

## Validation Results

| Check | Result | Command / environment |
|-------|--------|-----------------------|
| Type check | PASS | `npm run typecheck` (also as step 1 of `npm run check`) — host, Node v22 |
| Lint | PASS | `npm run lint` (also as step 2 of `npm run check`) — host |
| Build | PASS | step 3 of `npm run check` — host; `.next/server` and `.next/static` hold no reference to `google/genai` |
| Tests (eval gate) | PASS (3 fixtures at 100%, `✓ all gates passed`, baseline untouched) | `npm run check` — host, no verify instance up |
| E2E 1: offline probe | PASS (26 checks `ok`, exit 0; the three request-body hashes equal those of `main`) | `npx tsx scratch/openrouter-only-probe.mts` — host, no network |
| E2E 2: leftover-reference greps | PASS (code grep: 0 lines; docs grep: 1 line, the "is not read" sentence; PRD grep: 11 lines, all records of past work; `sdk removed`) | the four commands of the plan's step 2 — host |
| E2E 3: `npm run eval:ai`, as written | FAIL — not met as written (exit 1 on both runs; the plan allows one re-run). Fails the same way on unchanged `main`, so the change did not cause it | `( set -a; . ./.env.local; set +a; npm run eval:ai 2>&1 \| sed "s/${OPENROUTER_API_KEY}/<redacted>/g"; exit "${PIPESTATUS[0]}" )` — host, live, the host's `OPENROUTER_MODEL` |
| E2E 3, variant: validated interpretation replies over OpenRouter | PASS (substitute for the step above, which was not met: 18 of 18 `interpret` calls returned a Zod-validated reply, no `AI Interpretation lane failed` line, no `thinkingLevel` line) | same command, read for replies and failure lines instead of for the stability thresholds |
| E2E 4: app, AI lane off (`GEMINI_API_KEY` alone is no key) | PASS (`doctor` all `ok`, `ai-lane off`; both scenarios `all checks passed`) | `$V up && $V doctor`, `$V drive analyze-url`, `$V drive analyze-images`, `$V down` — host, run `20261014-032513-735294`, `head 00aaea0-dirty` |
| E2E 5: app, AI lane on (all three lanes over OpenRouter) | PASS (`doctor` all `ok`, `ai-lane on`; `meta.aiOutcome is applied` for the URL and the images; `naming:    ai`; `fidelity:  inferred`; no failure or `thinkingLevel` line in `next.log`) | `VERIFY_AI=1 $V up && $V doctor`, the two `drive` commands, `$V down` — host, live, run `20261014-032553-737248`, `head 00aaea0-dirty` |
| E2E 6: full gate | PASS (exit 0; `git status --short` lists only the plan's files, the plan and its patch) | `test ! -e .verify/current.env && npm run check` — host |

### E2E 3: verbatim output of the step that was not met

First run on the branch (exit 1):

```
Distill AI-lane stability (§10) — 3 runs per site

  ✗ clean-light    adjectives 0.29  archetype 0.31
  ✗ dark-mode      adjectives 0.48  archetype 0.33
  ✓ adversarial-shell adjectives 0.51  archetype 0.64

  thresholds: adjectives ≥ 0.5, archetype ≥ 0.3

  ✗ AI lane unstable — check temperature/prompt
```

Second run on the branch (exit 1):

```
Distill AI-lane stability (§10) — 3 runs per site

  ✗ clean-light    adjectives 0.31  archetype 0.29
  ✗ dark-mode      adjectives 0.39  archetype 0.37
  ✓ adversarial-shell adjectives 0.67  archetype 0.70

  thresholds: adjectives ≥ 0.5, archetype ≥ 0.3

  ✗ AI lane unstable — check temperature/prompt
```

Control run on unchanged `main` (a `git archive main` export in the scratchpad with its own `npm ci`, same key and model; exit 1):

```
Distill AI-lane stability (§10) — 3 runs per site

aiLane: thinkingLevel is a Gemini-only knob and has no effect over OpenRouter — token budgets sized for a capped thinking prelude may behave differently on this path.
  ✗ clean-light    adjectives 0.31  archetype 0.31
  ✗ dark-mode      adjectives 0.39  archetype 0.29
  ✓ adversarial-shell adjectives 0.62  archetype 0.81

  thresholds: adjectives ≥ 0.5, archetype ≥ 0.3

  ✗ AI lane unstable — check temperature/prompt
```

What this shows:

- No run printed an `AI Interpretation lane failed (...)` line, and every site was scored. `scoreSite` returns `null` and skips a site when one `interpret` call fails (`eval/stability.ts:73`), so each run made 9 calls that each returned a Zod-validated reply over OpenRouter.
- The `✗` lines are the adjective and archetype overlap between three answers of the routed model, below the floors of `eval/stability.ts` (0.5 and 0.3). That is a property of the model and the prompt.
- `main` fails the same two sites with scores in the same range, and the offline probe shows that the branch sends the same request bytes as `main`. The plan assumed that `npm run eval:ai` is green on this host; it never ran the full command while planning (its live baseline was 3 calls, one per lane).
- The branch output has no `thinkingLevel` line; `main` prints the warning. That is the removed knob, seen live.

To re-run: the command of the table row above. It needs the stability of the interpretation lane fixed first (a lower temperature, a tighter prompt, or another model), which is outside this plan.

### E2E 4 and 5: evidence

- AI lane off: `"structureUnavailableReason": "Structure inference for images requires an AI key — set OPENROUTER_API_KEY."`. The setup hint's ARIA snapshot reads `Set` / `code: OPENROUTER_API_KEY` / `in` / `code: .env.local` / `to enable optional AI vision enrichment (§7). Get an OpenRouter key at` / `link "openrouter.ai/keys"` (`/url: https://openrouter.ai/keys`), with no `GEMINI_API_KEY` and no `aistudio`. The screenshot `02-result-preview.png` shows the hint as one sentence with an underlined link. `.env.local` still defines `GEMINI_API_KEY`, so this run is the Gemini-only case: `meta.aiOutcome is no-key`.
- AI lane on: evidence under `.verify/runs/20261014-032553-737248/evidence/` (`analyze-url-032606`, `analyze-images-032617`).

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/aiLane.ts` | UPDATE (patch) | +22/-103 |
| `lib/interpret.ts` | UPDATE (patch) | +10/-16 |
| `lib/extract/structure/structureAI.ts` | UPDATE (patch) | +2/-4 |
| `lib/extract/structureFromImage.ts` | UPDATE (patch) | +2/-4 |
| `lib/analyze.ts` | UPDATE (patch) | +1/-1 |
| `lib/extract/imageMediaType.ts` | UPDATE (patch) | +1/-1 |
| `app/page.tsx` | UPDATE (patch) | +3/-3 |
| `eval/stability.ts` | UPDATE (patch) | +2/-2 |
| `eval/run.ts` | UPDATE (patch) | +1/-1 |
| `.claude/skills/verify/scripts/verify.sh` | UPDATE (patch) | +3/-3 |
| `package.json` | UPDATE (patch) | +0/-1 |
| `package-lock.json` | UPDATE (patch) | +4/-427 |
| `README.md` | UPDATE | +4/-12 |
| `techstack.md` | UPDATE | +5/-8 |
| `docs/architecture/orchestration.md` | UPDATE | +2/-2 |
| `.agents/PRDs/PRD.md` | UPDATE | +13/-15 |
| `.claude/skills/verify/SKILL.md` | UPDATE | +1/-1 |
| `.claude/skills/verify/features/analyze-images.md` | UPDATE | +1/-1 |
| `.agents/reports/todo-25-remove-native-gemini-provider-path-plan-report.md` | CREATE | this report |

`eval/baseline.json` and `eval/corpus/*` are unchanged. `.env.local` is unchanged.

## Deviations from Plan

1. **`npm run eval:ai` does not pass (E2E step 3, fourth acceptance criterion as worded).** It exits 1 on the stability thresholds on both runs, and on unchanged `main` too. Handled as a wrong premise of the plan (`references/e2e-exceptions.md` of the implement skill): the step is reported as not met, and the variant that covers the same code path (validated interpretation replies over OpenRouter, no failure line) is what passes. The stability of the interpretation lane is a separate, existing defect and deserves its own issue. No threshold, prompt, model or check was changed.
2. **A control run on `main`, outside the plan.** To prove deviation 1, `git archive main` was exported into the session scratchpad, installed with `npm ci --ignore-scripts --prefer-offline`, run once, and deleted. It cost 9 model calls beyond the plan's budget. The live calls of this run total 31: 18 for the two branch runs of `eval:ai`, 9 for the control, 4 for the `VERIFY_AI=1` scenarios.
3. **The PRD's three #199 notes carry a date** (`**Superseded 2026-10-14 (#199):**`, `**Reverted 2026-10-14 (#199):**`, `**Closed 2026-10-14 (#199):**`). Task 5 words them without a date, while the plan's decision and its mirror (`PRD.md:65`) ask for a dated note.
4. **PRD risk row "Vision quality regression…":** after `thinkingLevel: MEDIUM on the vision lane; ` was removed, the cell's first word was capitalised (`Explicit spot-check…`).
5. **Resolved open questions, as instructed:** the README has no sentence about `GEMINI_API_KEY`; the live checks ran only with the host's `OPENROUTER_MODEL`; `.env.local` was not edited.

No key value was printed or written anywhere.

## Tests Written

The project has no unit-test framework, and none was introduced. No test file was committed.

| Test File | Test Cases |
|-----------|------------|
| `scratch/openrouter-only-probe.mts` (scratch, from the plan, deleted after the run) | 26 checks: Part A (5), a setup with only `GEMINI_API_KEY` is a no-key setup for `aiLaneAvailable`, `interpret`, `structureFromImages` and structure Stage 7, and no request leaves the process; Part B (21), each of the three lanes sends one request to OpenRouter with the default model, no extra top-level field and the request-body sha256 of `main`, gets a validated reply, and logs no `thinkingLevel` warning and no failure |
