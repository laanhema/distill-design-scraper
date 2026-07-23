# Implementation Report

**Plan**: `.agents/plans/completed/dist-026-recipe-variant-clusters-plan.md`
**Branch**: `feature/dist-026-recipe-variant-clusters`
**Status**: COMPLETE

## Summary

`buildRecipes` (`lib/extract/recipes.ts`) now partitions each element class's instances into variant clusters keyed by the instance's resolved background palette role (via the shared `nearestPaletteRole` from `lib/extract/roleMatch.ts`; normalized hex when no role is within ΔE; a `NO_BACKGROUND_KEY` sentinel for transparent/no-background instances) before any modal helper runs. The modal helpers (`modalPadding`/`modalRadius`/`modalColorValue`/`modalType`) are unchanged — they now just receive a cluster's nodes instead of the whole class pool. Cluster significance filter: a cluster survives with ≥3 instances (`MIN_CLUSTER_INSTANCES`) or ≥15% share of the class (`MIN_CLUSTER_SHARE`); survivors are ordered by instance count descending (stable sort keeps document order on ties) and capped at 3 per class (`MAX_VARIANTS_PER_ELEMENT`). No schema or emit changes — `recipesSchema.entries` already permits multiple entries per element and `renderRecipes` renders each independently.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Variant clustering in `buildRecipes` + constants + `variantKey` helper + doc-comment update | `lib/extract/recipes.ts` | Done |
| 2 | E2E synthetic two-variant fixture verification (scratch script, deleted after) | (scratch, deleted) | Done |
| 3 | Regression gate, no baseline refresh | — | Done |

## Validation Results

| Check | Result |
|-------|--------|
| Type check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | PASS |
| Eval (`npm run eval`) | PASS — clean-light 100%, dark-mode 100%, aggregate 100%, no baseline refresh |
| E2E scratch fixture | PASS (details below) |

## End-to-End Verification

Scratch script (project root, run with `SSRF_ALLOWLIST_HOSTS=localhost npx tsx`, deleted after use) served a synthetic page with 4 filled-primary buttons (`padding 12px 24px`, blue bg) and 3 ghost buttons (`padding 8px 16px`, transparent bg, 1px border), plus body copy and two text links. Result:

- 2 Button entries emitted, ordered by count (filled first: 4 vs 3 instances)
- Filled entry: `padding 12px 24px`, `radius 8px`, carries `bg` — no bleed from the ghost variant
- Ghost entry: `padding 8px 16px`, carries `border`, no `bg` — proves the transparent/no-background sentinel cluster path
- TextLink still emits exactly one entry — clustering is a no-op for single-variant classes
- No entry with chimera `padding 0px` for a styled class

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/extract/recipes.ts` | UPDATE | +58/-14 |

## Deviations from Plan

- The scratch script was executed from the project root rather than the session scratchpad directory: `tsx`/esbuild resolves `node_modules` and the `@/*` tsconfig alias relative to the script's own location (documented in CLAUDE.md), so a scratchpad-located copy cannot import `@/lib/*`. The script was deleted from the repo immediately after the run, per project convention. No other deviations.

## Tests Written

No unit test framework exists in this project (per CLAUDE.md, `npm run eval` is the correctness gate). The change was exercised through:

| Verification | Cases |
|--------------|-------|
| Scratch E2E fixture (deleted) | ≥2 Button variants; per-variant padding sanity; ghost = no-bg cluster; count ordering; single-variant class no-op |
| `npm run eval` | Full measured-lane regression, unchanged scores, no baseline refresh |
