# Implementation Report

**Plan**: `.agents/plans/dist-060-fail-missing-eval-corpus-capture-plan.md`
**Branch**: `feature/dist-060-eval-corpus-fail-missing`
**Status**: COMPLETE

## Summary

Added `optional?: boolean` to `CorpusEntry` interface in `eval/corpus.ts` and updated `eval/run.ts` to fail `npm run eval` if any non-optional corpus entry is missing its `capture.json` or `expected.yaml` file. Marked live reference URLs (`stripe`, `linear`, `vercel`) as `optional: true`. Updated `CLAUDE.md` and `.agents/PRDs/PRD.md` to document gate coverage and missing capture failure policy.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Update `eval/corpus.ts` and `eval/run.ts` | `eval/corpus.ts`, `eval/run.ts` | ✅ |
| 2 | Update documentation (`CLAUDE.md` and `PRD.md`) | `CLAUDE.md`, `.agents/PRDs/PRD.md` | ✅ |

## Validation Results

| Check | Result |
|-------|--------|
| Type check | ✅ |
| Lint | ✅ |
| Eval suite | ✅ |
| Missing required entry failure verification | ✅ |

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `eval/corpus.ts` | UPDATE | +5/-3 |
| `eval/run.ts` | UPDATE | +18/-6 |
| `CLAUDE.md` | UPDATE | +1/-1 |
| `.agents/PRDs/PRD.md` | UPDATE | +1/-1 |

## Deviations from Plan

None.

## Tests Written

None required (harness failure behavior verified end-to-end via synthetic missing entry check).
