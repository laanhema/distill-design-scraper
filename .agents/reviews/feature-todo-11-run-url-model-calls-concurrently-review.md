# Code Review: feature/todo-11-run-url-model-calls-concurrently

**Scope**: branch `feature/todo-11-run-url-model-calls-concurrently` (diff against `main` merge base 8ef014a, including uncommitted changes)
**Recommendation**: APPROVE WITH NITS

## Summary

Reviewed changes implementing concurrent execution of URL model calls (`enrichWithAI` and Track B Stage 7 structural labelling) per GitHub issue #175. The structure extraction pipeline was split cleanly into preliminary (Stages 3–7b) and finalization (Stages 8a–10) phases, allowing token enrichment and structure labelling to run concurrently via `Promise.all` while preserving Stage 8a/8b token linking against the enriched report. Validation passed completely across type checking, linting, production build, offline eval scoring (100%), and live verified runs with `AI_LANE=on`.

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions (Low)
- **L1** `lib/analyze.ts:390` — Unread `error` property and unlogged missing-harvest failure in `analyzeUrl`. **Why:** When `capture.rawHarvestNode` is absent, an `Error` object is instantiated into `preliminaryOutcome.error`, but it is never logged or read because line 399 only checks `preliminaryOutcome.preliminary`. **Fix:** Log `console.warn` if missing-harvest failure visibility is desired, or simplify `preliminaryOutcome` to resolve `{ preliminary: undefined }` directly without unused `error` fields.

## Validation Results

| Check | Status | Notes |
|-------|--------|-------|
| Build / Type Check | PASS | `npm run typecheck` (`tsc --noEmit`) and `npm run build` (`next build`); host |
| Warnings | NONE | 0 warnings across tsc, eslint, and next build |
| Lint | PASS | `npm run lint` (`eslint .`); host |
| Tests | PASS | `npm run eval` (`tsx eval/run.ts`); 3/3 required suites passed (clean-light 100%, dark-mode 100%, adversarial-shell 100%; aggregate combined: 100%); 3 optional live entries skipped without captures (`stripe`, `linear`, `vercel`) |
| UI verification | PASS | `.claude/skills/verify/scripts/verify.sh drive analyze-url` & `tabs-downloads`; evidence verified in `.verify/runs/20261013-201555-28239/evidence/analyze-url-201609/checks.json` with `AI_LANE=on` (status 200, structureReport present, aiOutcome: "applied") |

## What's Good

- Elegant and minimal pipeline split in `lib/extract/structure/index.ts` separating Stages 3–7b (`extractStructureThroughStage7`) from Stages 8a–10 (`finalizeStructure`), retaining `extractStructure` as a backwards-compatible composite wrapper.
- Preserved Stage 8a and 8b dependency on the AI-enriched report while starting Stage 7 AI semantic labelling concurrently with `enrichWithAI`.
- Simplified the API route in `app/api/analyze/route.ts` so `analyzeUrl` mirrors the structure output shape of `analyzeImages`.
- Robust error containment ensures structure failures produce `structureUnavailableReason` and prevent cache storage without terminating token extraction.
- Clear documentation updates in `docs/architecture/orchestration.md` and `docs/architecture/structure-lane.md`.

## Recommendation

Address finding L1 (`/fix-findings .agents/reviews/feature-todo-11-run-url-model-calls-concurrently-review.md L1`) or proceed with merging.
