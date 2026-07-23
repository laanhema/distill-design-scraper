# Implementation Report

**Plan**: `.agents/plans/completed/dist-032-zero-width-border-color-plan.md`
**Branch**: `feature/dist-032-zero-width-border-color`
**Status**: COMPLETE

## Summary

Fixed zero-width default border colors claiming the palette `border` role (GitHub issue #38 / DIST-032). The style dump already gated the `border` channel on "is any side visible", but then read the color unconditionally from `borderTopColor` — so on nodes with a single-sided visible border (e.g. `border-bottom: 1px solid …` hairlines) the zero-width top side's *default* color (`currentColor`, typically `#000000`) was captured and accumulated `channels.border` counts that won `borderScore`. The dump now captures the color of the widest *visible* side (width > 0, style neither `none` nor `hidden`), so only actually-painted borders contribute to the channel — benefiting every consumer (`palette.ts` borderScore, `recipes.ts`, `states.ts`) without changing the dump shape.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Capture border color from a visible side | `lib/extract/styleDump.ts` | ✅ |
| 2 | Eval gate + synthetic-fixture verification | n/a (scratch script, deleted) | ✅ |

## Validation Results

| Check | Result |
|-------|--------|
| Type check (`npm run typecheck`) | ✅ |
| Lint (`npm run lint`) | ✅ |
| Eval gate (`npm run eval`) | ✅ — passed unchanged, no baseline refresh (aggregate combined 100%) |
| Synthetic fixture (scratch `npx tsx`, Playwright + `collectStyleDump`) | ✅ — only `rgb(29, 78, 216)` (the visible side) observed; `#000000` and `#ff0000` absent |

No unit test framework exists in this repo (per CLAUDE.md); correctness gate = `npm run eval` + temporary scratch verification script (deleted after use).

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/extract/styleDump.ts` | UPDATE | +29/-11 |

## Deviations from Plan

None — implementation matched the plan. (The scratch script needed a `main()` wrapper because tsx compiles root-level scripts as CJS, which forbids top-level await; harness detail only, deleted with the script.)

## Tests Written

| Test | Cases |
|------|-------|
| Scratch verification script (deleted per CLAUDE.md) | Single-sided hairline border → captures visible side's color; `border-width: 0` + explicit `border-color` → contributes nothing; `#000000` default never enters the border channel |

## End-to-End Verification

- [x] `npm run typecheck` + `npm run lint` pass
- [x] `npm run eval` passes with no baseline refresh
- [x] Synthetic fixture: `setContent` page with a bottom-only hairline (blue), a zero-width red-bordered node, and a borderless control → border channel contained exactly one observation, `rgb(29, 78, 216)`; script deleted
