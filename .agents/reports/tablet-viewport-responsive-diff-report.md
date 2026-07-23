# Implementation Report

**Plan**: `.agents/plans/tablet-viewport-responsive-diff.plan.md`
**Branch**: `feature/tablet-viewport-responsive-diff`
**Status**: COMPLETE

## Summary

Added a 768×1024 tablet pass to the responsive-diff capture, alongside the existing 390×844 mobile pass. `RESPONSIVE_VIEWPORTS` in `lib/ingest.ts` now captures both viewports; the downstream pipeline (`diffResponsive`, `structureEmit.ts`, `structureSchema.ts`) required no changes since it was already generic over N secondary viewports, as the plan predicted. Fixed the one real latent fragility the plan called out: `lib/analyze.ts`'s mobile-type-size lookup now matches on `viewport.width === 390` explicitly instead of assuming index `[0]`. Eval corpus and baseline refreshed per the repo's fixture policy for capture-shape changes.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Add 768×1024 to `RESPONSIVE_VIEWPORTS` | `lib/ingest.ts` | ✅ |
| 2 | Width-explicit mobile-type-size lookup | `lib/analyze.ts` | ✅ |
| 3 | Manual verification against synthetic 3-breakpoint fixture | scratch (deleted) | ✅ |
| 4 | Refresh eval corpus captures | `eval/corpus/{clean-light,dark-mode}/capture.json` | ✅ |
| 5 | Run eval, refresh baseline | `eval/baseline.json` | ✅ (no-op — already at 1.0) |
| 6 | Sync PRD.md | `.agents/PRDs/PRD.md` | ✅ |
| 7 | Final validation pass | n/a | ✅ (typecheck + eval; lint pre-existing broken, see below) |

## Validation Results

| Check | Result |
|-------|--------|
| Type check | ✅ |
| Lint | ⚠️ Pre-existing repo issue, unrelated to this change (see below) |
| Eval | ✅ combined 100% both sites, `✓ all gates passed` |

### Manual verification (Task 3)

Built a throwaway synthetic fixture with real `@media (max-width: 900px)` (→2col) and `@media (max-width: 480px)` (→1col) breakpoints on a 6-card grid, rendered via `capturePage` against a `file://` URL (bypasses the SSRF guard the same way `eval/capture.ts` does for local fixtures), then ran `extractFromCapture` + `extractStructureFromCapture`. Confirmed:
- `responsiveHarvests` had exactly 2 entries: `{390,844}` and `{768,1024}`.
- `## Responsive` markdown rendered: `- **CardGrid** — 390px \`grid · 1col\` → 768px \`grid · 2col\` → 1440px \`grid · 3col\`` — width-labeled, unambiguous.
- `machineBlock.viewports` was `[[1440,900],[390,844],[768,1024]]` — primary-first, capture order, not sorted.
- No fabricated delta keys for components that don't change shape (only `CardGrid` appears in `machineBlock.responsive`).
- Scratch script and fixture HTML deleted after verification.

### Lint (pre-existing, out of scope)

`npm run lint` drops into an interactive `next lint` ESLint setup wizard rather than running — there is no `.eslintrc`/`eslint.config.*` anywhere in the repo's git history. Verified this is identical on `main` before any of this branch's changes (stashed, checked out `main`, reproduced the same prompt, restored the branch). Not caused by this change and not in the plan's scope; not fixed here.

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/ingest.ts` | UPDATE | +3/-3 |
| `lib/analyze.ts` | UPDATE | +3/-1 |
| `eval/corpus/clean-light/capture.json` | UPDATE (regenerated) | +1117/-254 lines total diff |
| `eval/corpus/dark-mode/capture.json` | UPDATE (regenerated) | +1156/-254 lines total diff |
| `eval/baseline.json` | unchanged | already at `1.0`/`1.0`, no diff after `UPDATE_BASELINE=1` |
| `.agents/PRDs/PRD.md` | UPDATE | +1/-2 |

## Deviations from Plan

1. **Eval corpus diff is larger than "just the tablet entry."** Structurally verified (via a normalization script comparing old vs. new capture JSON, stripping `capturedAt`/base64 blobs/known drift) that beyond the new 768px `responsiveHarvests` entry, the only other deltas are:
   - `inNav: true` flags on nav-link style-dump nodes, and
   - newly-present `scrollShots`/`panoramaShot` fields.

   Both are **pre-existing capture-shape features** (an `inNav` field in `lib/extract/styleDump.ts` used by `recipes.ts`'s NavItem classification, and the full-page tile/panorama capture) that landed in the codebase since the committed corpus fixtures were last refreshed — per `CLAUDE.md`'s policy, fixtures aren't refreshed for every additive capture-shape change, so this drift had simply accumulated. Regenerating the corpus for this PR's sanctioned refresh naturally picked up that backlog too. No palette/typography/token/recipe *values* changed — eval score stayed at 100%/100% and the baseline needed no update.
2. **`npm run lint` could not be validated** — see "Lint (pre-existing, out of scope)" above. Confirmed broken identically on `main`, unrelated to this work.

Everything else matched the plan exactly.

## Tests Written

No unit test framework exists in this repo (`CLAUDE.md`); `npm run eval` is the correctness gate for extraction logic, and it passed (`combined: 100%` for both corpus sites, gates passed). Manual verification (Task 3) covered the new behavior the eval corpus fixtures can't exercise (no `@media` queries in either committed fixture).
