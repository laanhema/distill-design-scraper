# Code Review: DIST-037 — Migrate vision structure lane and retire its hand-written media-type union

**Scope**: branch `feature/dist-037-vision-structure-callmodel` (diff vs `main`) — `lib/extract/structureFromImage.ts`
**GitHub Issue**: [#71](https://github.com/laanhema/distill-design-scraper/issues/71)
**Recommendation**: APPROVE

## Summary

Migrated vision structure lane (`lib/extract/structureFromImage.ts`) to `callModel` with `ThinkingLevel.MEDIUM` and `parseJsonLoose`. Retired hand-written media-type union, deleted latent `temperature: 0.1`, and updated docstrings to `GEMINI_API_KEY`. All acceptance criteria satisfied.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check | PASS |
| Lint | PASS |
| Tests | PASS (`npm run eval` 100%, baseline untouched) |
