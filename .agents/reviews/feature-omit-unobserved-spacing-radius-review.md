# Code Review: feature/omit-unobserved-spacing-radius

**Scope**: branch `feature/omit-unobserved-spacing-radius` vs `main`, including uncommitted changes (1 file: `lib/extract/tokens.ts`, +13/-6; plus untracked `.agents/` plan/report artifacts, not code)
**Recommendation**: APPROVE

## Summary

The change removes the hardcoded fallback scales in `extractSpacing` and `extractRadius` and returns `undefined` when nothing was observed, making `ExtractedTokens.spacing`/`.radius` optional. This directly implements issue #16's contract ("measured, never faked" — omit, don't default) and is exactly the minimal plumbing change the issue's technical notes called for. Every downstream consumer was checked and already handles absence: `buildReport` conditionally spreads (`lib/emit.ts:47-48`), body renderers are gated (`lib/emit.ts:80-81`), CSS-variables emission is gated (`lib/emit.ts:318, 324`), the frontend guards (`app/page.tsx:472, 497`), and the structure lane optional-chains (`lib/extract/structure/tokenLink.ts:53,59`, `lib/extract/structure/regionMetrics.ts:108`).

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions (Low / out of scope)
- `extractElevation` still returns `{ provenance: "measured", shadows: [] }` when no shadows were observed — an empty-but-present lane rather than a fabricated one, so it does not violate the contract the way the spacing/radius defaults did, and it is explicitly out of issue #16's scope. Worth a follow-up issue if the same omit-when-empty treatment is desired for consistency.
- `extractTokens` still assigns the keys explicitly (`spacing: extractSpacing(dump)`), so the returned object carries `spacing: undefined` rather than omitting the key. Harmless here (all consumers check truthiness, and `buildReport` re-spreads conditionally), purely cosmetic.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`, strict mode) | PASS |
| Lint (`npm run lint`) | FAIL (pre-existing: repo has no ESLint config, `next lint` prompts interactively; unrelated to this diff) |
| Tests (`npm run eval`) | PASS — clean-light 100%, dark-mode 100%, aggregate 100%, all gates passed, unchanged vs. `eval/baseline.json` |

## What's Good

- Minimal, surgical diff that lands precisely on the two lines the M2 review finding identified.
- Inline comments explain *why* the early return exists ("measured, never faked"), anchoring the invariant against future re-introduction of defaults.
- The `baseUnitPx` 4/8 guess can no longer leak into output when no spacing was observed, a subtle correctness win beyond the letter of the issue.
- Matches the codebase's established optional-lane precedent (`extractDarkPalette` returning nothing for single-scheme sites).

## Recommendation

Approve. Ready to commit and open a PR; the two suggestions are optional follow-ups, not blockers.
