# Code Review: tablet-viewport-responsive-diff (unstaged changes)

**Scope**: Unstaged changes on `feature/tablet-viewport-responsive-diff` — `lib/ingest.ts`, `lib/analyze.ts`, `eval/corpus/{clean-light,dark-mode}/capture.json`, `.agents/PRDs/PRD.md`
**Recommendation**: APPROVE

## Summary

Adds a 768×1024 tablet pass to the responsive-diff capture alongside the existing 390×844 mobile pass, by extending `RESPONSIVE_VIEWPORTS` in `lib/ingest.ts`. The downstream pipeline (`diffResponsive`, `structureEmit.ts`, `structureSchema.ts`) is already generic over N secondary viewports and needed no changes — verified by reading `responsive.ts`/`structureEmit.ts` directly rather than taking that on faith. The one real correctness fix is in `lib/analyze.ts`: the mobile-type-size lookup now matches `viewport.width === 390` explicitly instead of assuming `responsiveHarvests[0]`, which would otherwise silently pick up the tablet harvest's sizes once a second entry exists. Eval corpus was refreshed per the repo's fixture policy for capture-shape changes.

## Issues Found

### Critical
None.

### High Priority
None.

### Medium Priority
None.

### Suggestions
- None. Grepped for any other `responsiveHarvests[0]`/index-based assumptions across `lib/` — the `lib/analyze.ts` fix was the only one that existed, and no new one was introduced.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check | PASS (`npm run typecheck`) |
| Lint | N/A — `npm run lint` drops into an interactive `next lint` setup wizard; confirmed pre-existing/identical on `main`, unrelated to this change |
| Eval | PASS — `npm run eval`: clean-light 100%, dark-mode 100%, aggregate 100%, all gates passed |

## What's Good

- The fix in `lib/analyze.ts` (index `[0]` → explicit `width === 390`) is exactly the right defensive change for going from 1 to N secondary viewports — an easy latent bug to introduce otherwise, and it was caught proactively rather than after a regression.
- Correctly identified that `structureEmit.ts`/`responsive.ts`/`structureSchema.ts` needed no changes by reading them rather than assuming — confirmed independently during this review (`allViewports = [viewport, ...secondaryViewports]`, capture-order not sorted; `diffResponsive` loops over `input.secondary` generically; deltas keyed by width string, not index).
- Eval corpus regenerated in the same PR as the capture-shape change, per `CLAUDE.md` policy, and the diff's extra noise (`inNav` flags, `scrollShots`/`panoramaShot`) was correctly attributed to backlog drift from other capture-shape features rather than this change — verified in this review by confirming those fields exist as pre-existing schema/extractor features unrelated to the tablet viewport.
- Manual verification against a synthetic 3-breakpoint fixture (documented in the report) covered behavior the frozen eval fixtures can't exercise, since neither committed fixture has real `@media` breakpoints.
- PRD.md updated to reflect the completed backlog item, consistent with the code change.

## Recommendation

Ready to merge as-is. No changes requested.
