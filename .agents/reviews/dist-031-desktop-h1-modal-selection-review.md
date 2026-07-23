# Code Review: feature/dist-031-desktop-h1-modal-selection

**Scope**: Branch `feature/dist-031-desktop-h1-modal-selection` vs `main` (commit 5a0b948, `lib/extract/typography.ts` +44/-1)
**Recommendation**: APPROVE (with nits)

## Summary

The change anchors the type scale's `h1` token to the measured size of real `<h1>`-tagged dump nodes instead of relying purely on size-cluster frequency, fixing the desktop/mobile h1 inversion (issue #37). The implementation is small, well-commented, preserves the existing frequency path byte-for-byte when no `<h1>` samples exist, and keeps the measured-never-faked invariant. Validation (typecheck, lint, eval) all pass.

## Issues Found

### Critical

None

### High Priority

None

### Medium Priority

None

### Suggestions

1. **Low — `lib/extract/typography.ts:157-162`**: When the anchor is active, the picks are capped at `display(≤1) + h1 + h2/h3(≤2)`, so a page with 3+ frequent clusters *below* the h1 size loses its least-frequent heading cluster compared to the old 4-pick behaviour. This is a deliberate, documented tradeoff (h1 correctness over one extra cluster), but worth being aware of if a future site legitimately needs h4-level granularity.
2. **Low — `lib/extract/typography.ts:160`**: `larger`/`smaller` are drawn from the frequency top-4 (`freqRanked`), not from all of `above`. A one-off cluster *larger* than the h1 (e.g. an 80px display headline used once) won't be surfaced as `display`. Consistent with the existing frequency-first philosophy; noted for completeness.
3. **Nit — test coverage**: the new `representativeHeadingSize` tie-break (mode, ties → larger) is exercised only via the deleted scratch fixture. Consistent with project norms (no unit framework; eval is the gate), and the eval gate passes unchanged — no action required.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | PASS |
| Tests (`npm run eval`) | PASS — clean-light 100%, dark-mode 100%, no baseline change |

## What's Good

- Correct guard placement: `h1Sizes.push(size)` sits after the same `node.type`/6–200px guards as bucket insertion, so every anchored size provably has a `bySize` bucket for `buildStep`.
- The anchor restructures picks *around* the h1 size (rather than appending it), which correctly avoids the hero landing on the `display` token in the 4-cluster case.
- Tie-break toward the larger size in `representativeHeadingSize` is order-independent (explicit `size > best` comparison), not reliant on Map insertion order.
- Fallback path is literally the original expression — zero behavioural change for pages without measurable `<h1>` text (e.g. text nested in child spans), honouring measured-never-faked.
- Comment block clearly links the change to DIST-031 and explains the mobile/desktop asymmetry.

## Recommendation

Approve. The two low-severity suggestions are acceptable tradeoffs for a Low-priority bug fix; no changes required before merge.
