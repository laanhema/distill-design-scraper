# Implementation Report

**Plan**: `.agents/plans/completed/dist-024-squash-wrapper-chains-plan.md`
**Branch**: `feature/dist-024-squash-wrapper-chains`
**Status**: COMPLETE

## Summary

Added Stage 4b to the structure lane: `squashWrapperChains` (new `lib/extract/structure/squash.ts`), a pure `PrunedNode → PrunedNode` post-pass that merges a node with its single child when the child is a generic layout container (no landmark, not interactive, not a semantic tag, has children, and has a real `tagName` — vision-inferred nodes are never merged). The outer node's identity (id, tag, landmark, bounds, signature) survives; `hasText`/`textSnippet`/`isImageOrSvg` propagate; the more specific layout annotation wins (`grid · Ncol` > `grid · 1col`/`grid` > `flex …` > none, ties prefer the innermost) with any sticky/fixed suffix on the outer annotation preserved. Wired after `pruneAndCollapse` / before `detectRepetition` in both the primary pipeline (`index.ts`) and the responsive secondary-viewport re-derivation (`responsive.ts`) so positional tree alignment sees identical shapes. The existing Stage 4 collapse rule in `pruner.ts` was not touched.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Create squash pass | `lib/extract/structure/squash.ts` | Done |
| 2 | Wire into primary pipeline | `lib/extract/structure/index.ts` | Done |
| 3 | Wire into responsive re-derivation | `lib/extract/structure/responsive.ts` | Done |
| 4 | E2E verification vs synthetic wrapper-chain fixture | scratch script (deleted) | Done |

## Validation Results

| Check | Result |
|-------|--------|
| Type check (`npm run typecheck`) | Pass |
| Lint (`npm run lint`) | Pass |
| Eval (`npm run eval`) | Pass — clean-light 100%, dark-mode 100%, aggregate 100%, all gates passed, no baseline refresh |

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/extract/structure/squash.ts` | CREATE | +122 |
| `lib/extract/structure/index.ts` | UPDATE | +6/-1 |
| `lib/extract/structure/responsive.ts` | UPDATE | +5/-1 |

## Deviations from Plan

- The E2E scratch script was placed at the project root instead of the session scratchpad — tsx/esbuild resolves `node_modules` relative to the script's own location (documented in CLAUDE.md), so a script outside the repo cannot import project modules. Deleted after use.
- The scratch run needed a `page.addInitScript` shim for the tsx/esbuild `__name` helper injected into `page.evaluate` callbacks (scratch-only workaround, not project code).

## Tests Written

No unit test framework exists in this project (per CLAUDE.md, `npm run eval` is the correctness gate). Verification was:

| Verification | Cases |
|--------------|-------|
| `npm run eval` (regression gate, offline replay incl. structure lane) | clean-light, dark-mode — all gates passed unchanged |
| Scratch E2E (synthetic fixture, live Playwright render, deleted after) | (1) `section.hero > div[grid·1col] > div[grid·12col]` chain emits a single `Hero [grid · 12col]` node; (2) no residual hero `1col` line; (3) `nav` landmark child NOT merged into its grid wrapper; (4) the landmark-child wrapper itself survives un-squashed |
