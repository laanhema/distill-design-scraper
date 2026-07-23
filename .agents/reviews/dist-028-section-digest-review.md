# Code Review: feature/dist-028-section-digest (DIST-028 / #34)

**Scope**: branch `feature/dist-028-section-digest` — diff against `main`, including uncommitted changes
**Recommendation**: APPROVE (one Medium finding fixed in-place during the flow; re-verified)

## Summary

Stage 9 section digest for the structure lane: `sections.ts` (builder +
formatter), orchestration in `index.ts`, emit wiring in `structureEmit.ts`,
and the pre-existing schema additions in `structureSchema.ts`. The change is
faithful to the project's "measured, never faked" invariant — every digest
field joins an already-measured upstream artifact and is omitted when its
input is absent.

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
1. ~~`sections.ts` `findBand` — header/footer matched inside the main subtree~~
   **FIXED before commit.** A section-level `<header>`/`<footer>` inside
   `<main>` (common in articles/sections) would have been promoted to the
   `SiteHeader`/`SiteFooter` band by the DFS first-match. Fixed by searching
   header/footer outside the main subtree (`exclude` parameter); verified
   with a synthetic fixture whose only `<header>`/`<footer>` live inside a
   `<section>` in `<main>` — no bogus bands, the real site footer still
   closes the digest.

### Suggestions
1. `lib/extract/structure/sections.ts:170` — representative-subtree counts for
   a collapsed repeated group (e.g. `ArticleCard ×3` reports `1 heading · 1
   paragraph`) are honest but could be misread as totals; the `×N` on the
   digest entry carries the multiplicity. Documented in the docstring — no
   change needed.
2. `structureEmit.ts` — `formatSectionDigests(sections!)` non-null assertion
   behind the `hasSections` boolean; matches the existing `responsive!` usage
   on line ~102, so consistent with the file's style.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | PASS |
| Eval (`npm run eval`) | PASS — clean-light 100%, dark-mode 100%, no baseline refresh |
| Synthetic-fixture E2E (2 scripts, `npx tsx`, deleted after use) | PASS — band order/ordinals, `instances: 3` collapsed group, sticky/padY band segments, honest omission of hero `band` (depth-2 non-region), tokens joined in `both` mode and omitted in structure-only mode, nested-header edge case |

## What's Good

- Band identity keys on measured `landmark`/`tagName` with the final component
  name only as a fallback — robust to AI renaming.
- The `BAND_SEGMENT` split mirrors `responsive.ts`'s non-structural segment
  list, so `band` and `layout` can never overlap or double-report a segment.
- Emit uses the file's established conditional-spread pattern; the vision lane
  (`structureFromImage.ts`) needs no change and simply omits `sections`.
- Renumbered the stale `Stage 8: Structure Emit` / "Stages 1-8" comments in
  `index.ts` to reflect the new Stage 9.

## Recommendation

Approve. No PR created in this flow (handled by the follow-up issue-flow-done
step).
