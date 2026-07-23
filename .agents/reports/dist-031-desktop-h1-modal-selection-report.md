# Implementation Report

**Plan**: `.agents/plans/dist-031-desktop-h1-modal-selection-plan.md`
**Branch**: `feature/dist-031-desktop-h1-modal-selection`
**Status**: COMPLETE

## Summary

Fixed the desktop h1 modal-selection bug (DIST-031 / issue #37): `extractTypography` clustered all text nodes by size, tag-agnostic, and `pickSpread` favoured the most *frequent* sizes — so a one-off hero h1 lost its cluster slot to small-but-ubiquitous h1-styled sizes (Stripe: desktop h1 reported 26px while the mobile pass, which measures the `<h1>` element directly, saw 34px → inversion). The h1 token is now anchored to the measured size of real `<h1>`-tagged dump nodes (`NodeStyle.tag`): the heading picks are built around that size (one `display` slot above it only if a larger cluster exists, up to two slots below), so the bottom-up token assignment always lands `h1` on the hero. With no `<h1>`-tagged samples the frequency path runs unchanged (measured-never-faked).

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Collect h1-tagged size samples | `lib/extract/typography.ts` | ✅ |
| 2 | Anchor h1 token to the real h1 size | `lib/extract/typography.ts` | ✅ |
| 3 | Eval gate | `eval/baseline.json` (unchanged) | ✅ |
| 4 | Synthetic-fixture verification | scratch script (deleted) | ✅ |

## Validation Results

| Check | Result |
|-------|--------|
| Type check (`npm run typecheck`) | ✅ |
| Lint (`npm run lint`) | ✅ |
| Eval gate (`npm run eval`) | ✅ — clean-light 100%, dark-mode 100%, unchanged → no baseline refresh needed |
| Synthetic fixture (hero h1 60px + 4 frequent smaller clusters, mobile 34px) | ✅ h1 = 60px desktop / 34px mobile (no inversion); no-h1-tag variant keeps old frequency behaviour (display=26, h1=22) |

No unit test framework exists in this project — correctness gate is `npm run eval` plus the scratch verification script (run, passed, deleted) per CLAUDE.md.

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/extract/typography.ts` | UPDATE | +44/-1 |

## Deviations from Plan

1. **Anchor placement refined**: the plan's "pin h1 size into the frequency picks" would, with 4 clusters, have landed the hero size on the `display` token instead of `h1` (bottom-up assignment). The picks are now built explicitly around the real h1 size (≤1 cluster above → `display`, ≤2 below → h2/h3), guaranteeing `h1` = hero size.
2. **Fallback-fixture expectation corrected**: the no-h1-tag variant's old behaviour is `display=26, h1=22` (four more-frequent clusters win all four picks), not `h1=26` as first assumed — the scratch assertion was corrected to match the unchanged pre-fix algorithm.

## Tests Written

| Test | Cases |
|------|-------|
| `verify-dist-031.ts` (scratch, deleted after use) | hero fixture: h1=60px desktop, 34px mobile, desktop ≥ mobile; no-h1-tag fixture: frequency fallback preserved |
