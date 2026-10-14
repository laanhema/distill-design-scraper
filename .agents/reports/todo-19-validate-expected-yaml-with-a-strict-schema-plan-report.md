# Implementation Report

**Plan**: `.agents/plans/completed/todo-19-validate-expected-yaml-with-a-strict-schema-plan.md`
**Branch**: `feature/todo-19-validate-expected-yaml-with-a-strict-schema`
**Status**: COMPLETE

## Summary

Each hand-written `eval/corpus/<slug>/expected.yaml` is now parsed at load with a strict Zod schema instead of `yamlLoad(...) as ExpectedSpec`. `expectedSectionEntrySchema` and `expectedStructureSpecSchema` (`eval/scoreStructure.ts`) and `expectedSpecSchema` (`eval/score.ts`) are `z.strictObject` at every level, and the `ExpectedSectionEntry`, `ExpectedStructureSpec` and `ExpectedSpec` types are derived from them with `z.infer`, so type and schema cannot drift. `loadExpectedSpec` in `eval/run.ts` calls `safeParse` and throws an error that names the file and, through `z.prettifyError`, the unknown key and its path. The throw happens in `scoreSite`, before every gate and before the `UPDATE_BASELINE` branch, so an invalid spec cannot refresh the baseline. Optional parts stay optional, and map keys (palette roles, scale tokens, component names) stay free strings. `AGENTS.md` and `README.md` now say that the spec is validated.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Describe the structure spec with strict schemas | `eval/scoreStructure.ts` | PASS |
| 2 | Describe the whole spec with a strict schema | `eval/score.ts` | PASS |
| 3 | Parse the spec at load, remove `as ExpectedSpec` | `eval/run.ts` | PASS |
| 4 | Say in the docs that the spec is validated | `AGENTS.md`, `README.md` | PASS |
| 5 | Prove the gate (probe on `main` and on the changed tree) and run the full check | scratch only | PASS |

## Validation Results

| Check | Result | Command / environment |
|-------|--------|-----------------------|
| Type check | PASS | `npm run check` (step `tsc --noEmit`) — host, Node v22 |
| Lint | PASS | `npm run check` (step `eslint .`) — host |
| Build | PASS | `npm run check` (step `next build`, "Compiled successfully") — host |
| Tests (eval gate) | PASS (3 sites at combined 100%, "✓ all gates passed") | `npm run check` (step `tsx eval/run.ts`) — host |
| Cast removed | PASS (prints `0`) | `grep -c "as ExpectedSpec" eval/run.ts` |
| Corpus, baseline, fixtures untouched | PASS (prints nothing) | `git diff --stat -- eval/corpus eval/baseline.json eval/fixtures` |
| E2E red on unchanged code | PASS (11 `FAIL`, `PASS control`, `failed cases: 11`, exit 1, as the plan measured) | `bash "$S/probe-spec.sh" "$S/head"` on a `git archive main` export in the scratchpad |
| E2E green after the change | PASS (12 `PASS`, `failed cases: 0`, exit 0) | `bash "$S/probe-spec.sh" "$S/work"` on a copy of the changed `eval`, `lib`, `package.json`, `tsconfig.json` |

Sample probe output after the change (component-entry case):

```
✖ Unrecognized key: "cuont"
  → at structure.expectedComponents.SectionCard
```

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `eval/scoreStructure.ts` | UPDATE | +20/-9 |
| `eval/score.ts` | UPDATE | +18/-11 |
| `eval/run.ts` | UPDATE | +19/-1 |
| `AGENTS.md` | UPDATE | +2/-1 |
| `README.md` | UPDATE | +1/-1 |

## Deviations from Plan

None. The doc comment the plan asks for above `expectedSpecSchema` was written as a JSDoc block (it explains why the schema is strict at every level).

## Tests Written

The project has no unit test framework, so no test file was added (per the plan). The change is covered by the eval gate (`npm run eval`, the three committed specs pass unchanged) and by the plan's scratch probe `probe-spec.sh` (ten misspelt keys, the `UPDATE_BASELINE` case, and a control), run red on `main` and green on the changed tree, then deleted.

| Test File | Test Cases |
|-----------|------------|
| scratch `probe-spec.sh` (deleted) | top-level `typography`, `structure`, extra key; `typography.bodyFamily`, `typography.scale`; `structure.expectedSections`, `expectedRegions`, `expectedComponents`; section entry key; component entry key; `UPDATE_BASELINE` with an invalid spec; control |
