# Code Review: feature/dist-026-recipe-variant-clusters

**Scope**: diff vs `main`, including uncommitted changes — 1 file, `lib/extract/recipes.ts` (+58/−14)
**Recommendation**: APPROVE (with nits)

## Summary

The change partitions each recipe element class into variant clusters keyed by resolved background palette role (via the shared `nearestPaletteRole`, hex fallback, `NO_BACKGROUND_KEY` sentinel for transparent) before the unchanged modal helpers run per cluster, with a significance filter (≥3 instances or ≥15% share), a 3-entries-per-class cap, and count-descending ordering. The implementation matches issue #32's acceptance criteria precisely, reuses the mandated shared helpers (`roleMatch.ts`, existing `resolveColorLabel`, unchanged `modal*` functions), and stays within the project's "measured, never faked" stance — no schema or emit surface changed, and multiple entries per element were already representable.

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions (Low)

1. `lib/extract/recipes.ts:222-226` — A class fragmented into >6 clusters that are each <3 instances and <15% share now emits zero entries where the old code always emitted one per non-empty class. This is exactly what the issue's survival criteria specify, and eval does not score recipes, but the lost "at least one entry per observed class" invariant is worth being aware of if a future consumer assumes it.
2. `lib/extract/recipes.ts:35` — `NO_BACKGROUND_KEY = "none"` shares a namespace with role names and normalized hexes in the same `Map`. Verified safe today: no `ColorRole` is named `none`, hexes start with `#`, and `styleDump.ts`'s `opaqueColor` filters `"none"`/`"transparent"` so the raw-string fallback can never be `"none"`. A `Symbol` or prefixed key would make the non-collision structural rather than incidental.
3. `lib/emit.ts:272` (unchanged code) — Multiple variants of one element render as repeated `- **Button** — …` lines with no variant discriminator (e.g. the bg role). Readable, and the issue asked for no emit change, but a follow-up could label variants for scanability.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | PASS |
| Eval (`npm run eval`) | PASS — clean-light 100%, dark-mode 100%, aggregate 100%, no baseline refresh |

## What's Good

- Cluster keying delegates entirely to the existing `resolveColorLabel`/`nearestPaletteRole` — no third inline role matcher (explicit project rule honored).
- Modal helpers untouched; the fix is where they run, not how — exactly as the issue's technical notes required.
- Thresholds are named constants with intent-stating doc comments, matching the file's existing style.
- Deterministic output: Map insertion preserves document order and the count sort is stable, so ties resolve consistently across runs.
- Filter semantics (`>=` on both count and share) match the issue's "≥3 instances or ≥15% share" wording exactly, and `.slice(0, MAX_VARIANTS_PER_ELEMENT)` caps after filtering and sorting, so the kept 3 are always the largest survivors.

## Recommendation

Approve. The three suggestions are optional follow-ups, none blocking. Next step: commit on the feature branch and open a PR when the user asks.
