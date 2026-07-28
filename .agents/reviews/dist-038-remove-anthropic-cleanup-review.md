# Code Review: DIST-038 — Remove @anthropic-ai/sdk and sweep provider references out of docs and eval

**Scope**: branch `feature/dist-038-remove-anthropic-cleanup` (diff vs `main`)
**GitHub Issue**: [#72](https://github.com/laanhema/distill-design-scraper/issues/72)
**Recommendation**: APPROVE

## Summary

Removed `@anthropic-ai/sdk` and updated all remaining provider/key references across docs (`README.md`, `CLAUDE.md`), `eval/run.ts`, `eval/stability.ts`, and `lib/extract/imageMediaType.ts`. Codebase now cleanly references Gemini and `GEMINI_API_KEY`. All acceptance criteria satisfied.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check | PASS |
| Lint | PASS |
| Tests | PASS (`npm run eval` 100%, baseline untouched) |
| Grep check | PASS |
