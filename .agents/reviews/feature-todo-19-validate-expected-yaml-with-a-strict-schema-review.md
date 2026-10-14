# Code Review: feature/todo-19-validate-expected-yaml-with-a-strict-schema

**Scope**: branch `feature/todo-19-validate-expected-yaml-with-a-strict-schema` vs merge base `43f524b` (`main`); all work is uncommitted in the working tree (5 modified files, plus the untracked plan and implementation report read as context). Issue #183.
**Recommendation**: APPROVE WITH NITS

## Summary

The change replaces `yamlLoad(...) as ExpectedSpec` in `eval/run.ts` with `loadExpectedSpec`, which parses each `expected.yaml` with `expectedSpecSchema` (`z.strictObject` at every level, in `eval/score.ts` and `eval/scoreStructure.ts`). The `ExpectedSpec`, `ExpectedStructureSpec` and `ExpectedSectionEntry` types are now derived with `z.infer`, so the scorers keep their signatures. `AGENTS.md` and `README.md` document the check. The code is small and correct, and it throws before every gate and before the `UPDATE_BASELINE` write. The one nit is a rule row in `AGENTS.md` that claims more than the schema enforces.

Acceptance criteria of #183:
- [x] **`expected.yaml` is parsed with a strict Zod schema at load, and `as ExpectedSpec` is gone.** Met: `eval/run.ts:49-60` calls `expectedSpecSchema.safeParse`, and `grep -rn "as ExpectedSpec" eval/` finds nothing. Every object level is `z.strictObject` (`eval/score.ts:18-31`, `eval/scoreStructure.ts:4-25`).
- [x] **A spec with an unknown key fails `npm run eval` with a message that names the key.** Met. A scratch probe ran on a copy of the changed tree and on a `git archive main` export, editing only the copies' `adversarial-shell/expected.yaml`. It misspelt top-level `typography`, `typography.scale`, `structure.expectedSections`, a component entry's `count` and a section entry's `name`. On the branch every case exited 1 and named the key, e.g. `✖ Unrecognized key: "typograhpy"`, and with `UPDATE_BASELINE=1` the baseline stayed byte-identical. On `main`, four of the five exited 0 at 100% without naming the key. The misspelt section-entry `name` exited 1 there only because the scorer crashed, and the key was still not named. A wrong value type (`body: "16"`) also fails on the branch (`→ at typography.scale.body`). The control (unmodified spec) exited 0 in both trees.
- [x] **`npm run eval` passes with the three committed specs unchanged.** Met: `npm run check` exits 0 with `clean-light`, `dark-mode` and `adversarial-shell` at combined 100%. `git status` shows no change under `eval/corpus/`, and `eval/baseline.json` is untouched.

The owner's technical notes put the `as Capture` casts out of scope, and they stay as they were.

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions (Low)
- **L1** `AGENTS.md:78` — The new rule row says that hand-written eval specs "must not carry a key the scorer does not read", but `expectedSpecSchema` still accepts keys that no scorer reads: `expectedComponents.<name>.type` (`eval/scoreStructure.ts:17`, which `scoreStructure` never looks at), and also `name` and `bucket`. **Why:** An agent that reads the rule will think a spec cannot carry a dead assertion. It can: `SectionCard: { type: Card }` passes validation and is never scored, which is the same kind of silent no-op that the issue set out to remove. **Fix:** Reword the row to state what is enforced ("Hand-written eval specs must not carry a key the spec schema does not define"). Or, if the row's stronger claim is wanted, delete `type` from the component-entry schema, since no committed spec uses it.

**Noted, not a finding**: Specs that are valid but empty still score as a full pass: `palette: {}` gives role accuracy 1, and a `typography` block with no `scale` makes `combinedScore` substitute the palette score. Also, `bodyFamily` never feeds the combined score. The issue's technical notes name these silent paths, but its acceptance criteria cover only unknown keys, and the plan keeps the optional parts optional on purpose. The `as Capture` casts (`eval/run.ts:67`, `eval/stability.ts`) are out of scope per the owner's technical notes.

## Validation Results

| Check | Status | Notes |
|-------|--------|-------|
| Build / Type Check | PASS | `npm run check` (`tsc --noEmit`, then `next build`, "Compiled successfully"); host. `npm run typecheck` re-run alone: clean |
| Warnings | NONE | `tsc` and `eslint .` printed no warnings; `next build` printed none |
| Lint | PASS | `npm run check` (`eslint .`); host. `npm run lint` re-run alone: clean |
| Tests | PASS | `npm run check` (`tsx eval/run.ts`); host. 3 required sites scored at 100%, "✓ all gates passed". Skipped: `stripe`, `linear`, `vercel` (marked `optional: true` and have no committed capture, as before). No unit test framework exists. A scratch probe in the scratchpad compared `main` and the branch as described in the Summary; the scratch copies were deleted afterwards |
| UI verification | N/A | No UI, API-route or extraction change; only the offline eval harness and docs changed |

## What's Good

- `z.infer` derives the types from the schemas, so the spec type and its validation cannot drift, and the exported names did not change.
- The loader throws inside `scoreSite`, before every gate and before the `UPDATE_BASELINE` branch, so an invalid spec cannot refresh the baseline. The probe confirmed this.
- `z.prettifyError` reports the key and its path (`→ at structure.expectedComponents.SectionCard`), and the message names the file.
- Map keys (palette roles, scale tokens, component names) are left as free strings. That is correct: a misspelt role or token already registers as a miss in the scorers, so it is not silent.

## Recommendation

Merge after deciding on L1, which is a one-line doc fix or a one-line schema deletion: `/fix-findings .agents/reviews/feature-todo-19-validate-expected-yaml-with-a-strict-schema-review.md L1`.
