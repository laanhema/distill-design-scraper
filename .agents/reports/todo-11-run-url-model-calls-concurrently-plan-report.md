# Implementation Report

**Plan**: `.agents/plans/completed/todo-11-run-url-model-calls-concurrently-plan.md`
**Branch**: `feature/todo-11-run-url-model-calls-concurrently`
**Status**: COMPLETE

## Summary

Implemented concurrent execution of the two AI model calls on the URL analysis path (`enrichWithAI` for design tokens and Stage 7 semantic labelling for structure) per GitHub issue #175 (Finding M5 in codebase review). Split `extractStructure` into `extractStructureThroughStage7` (Stages 3–7b) and `finalizeStructure` (Stages 8a–10), executed token enrichment and preliminary structure extraction concurrently via `Promise.all` inside `analyzeUrl`, and fed the resulting AI-enriched report into `finalizeStructure` for token linking. Structure extraction errors are caught gracefully as `structureUnavailableReason` and prevented from being cached, while offline deterministic evaluation gates (`npm run eval`) and end-to-end verification suites remain 100% passing.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Split `extractStructure` at Stage 7 (`extractStructureThroughStage7` and `finalizeStructure`) | `lib/extract/structure/index.ts` | PASS |
| 2 | Run token enrichment and structure extraction concurrently in `analyzeUrl` via `Promise.all` | `lib/analyze.ts` | PASS |
| 3 | Simplify URL pipeline handling in API route to consume structure outcomes directly and guard cache | `app/api/analyze/route.ts` | PASS |
| 4 | Update architecture documentation for orchestration entry points and structure lane split | `docs/architecture/orchestration.md`, `docs/architecture/structure-lane.md` | PASS |

## Validation Results

| Check | Result | Command / environment |
|-------|--------|-----------------------|
| Type check | PASS | `npm run typecheck` (`tsc --noEmit`) — host |
| Lint | PASS | `npm run lint` (`eslint .`) — host |
| Tests | PASS (3/3 fixture suites passed, 100% score) | `npm run eval` (`tsx eval/run.ts`) — host |
| Build | PASS (Next.js 15.5.20 compiled, 4/4 static pages) | `npm run build` (`next build`) — host |
| Full CI Check | PASS | `npm run check` (typecheck → lint → build → eval) — host |
| E2E Verify (AI off) | PASS | `verify.sh drive analyze-url` & `tabs-downloads` (clean-light fixture, status 200, structureReport present, aiOutcome no-key) — host |
| E2E Verify (AI on) | PASS | `VERIFY_AI=1 AI_LANE=on verify.sh drive analyze-url` (status 200, structureReport present, aiOutcome applied) — host |

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/extract/structure/index.ts` | UPDATE | +91/-12 |
| `lib/analyze.ts` | UPDATE | +65/-9 |
| `app/api/analyze/route.ts` | UPDATE | +10/-21 |
| `docs/architecture/orchestration.md` | UPDATE | +1/-1 |
| `docs/architecture/structure-lane.md` | UPDATE | +2/-0 |

## Deviations from Plan

1. **Verify script environment variable**: In the plan's E2E Step 3, the command was written as `AI_LANE=on .claude/skills/verify/scripts/verify.sh up`. Per `.claude/skills/verify/scripts/verify.sh:78-80`, `verify.sh` clears `GEMINI_API_KEY` and `OPENROUTER_API_KEY` unless `VERIFY_AI=1` is explicitly exported. Running `VERIFY_AI=1 AI_LANE=on verify.sh up` retained the keys and passed with `aiOutcome: "applied"` as intended.

## Tests Written

| Test File | Test Cases |
|-----------|------------|
| N/A | No unit test framework configured in repository per `AGENTS.md`. Correctness verified through offline evaluation harness (`npm run eval`), E2E browser verification scenarios (`analyze-url`, `tabs-downloads`), and full compilation check (`npm run check`). |
