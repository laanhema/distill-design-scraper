# Code Review: feature/dist-024-squash-wrapper-chains

**Scope**: Diff vs `main`, including uncommitted changes — `lib/extract/structure/squash.ts` (new), `lib/extract/structure/index.ts`, `lib/extract/structure/responsive.ts`
**Recommendation**: APPROVE (with nits)

## Summary

Adds a Stage 4b post-pass that squashes single-child generic-wrapper chains in the pruned structure tree (issue #30 / DIST-024). The pass is a pure `PrunedNode → PrunedNode` transform wired after `pruneAndCollapse` in both the primary pipeline and the responsive secondary-viewport re-derivation — the latter is essential for the positional tree alignment and was correctly included. The pruner's own collapse rule is untouched, merge guards match the issue's acceptance criteria (landmark/interactive/semantic children never merge; vision-inferred nodes without `tagName` are skipped, honoring the "absent evidence means no squash" invariant), and annotation specificity resolution including the sticky/fixed suffix preservation is correct against the vocabulary `pruner.ts` actually produces.

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions (Low)

1. `lib/extract/structure/squash.ts:23` — `SEMANTIC_TAGS` duplicates the semantic-tag list inlined in `pruner.ts:56`; the project's stated convention (see `roleMatch.ts`/`styleMatch.ts` precedent in CLAUDE.md) is to avoid second inline copies of shared definitions — consider exporting one shared constant so the two lists can't drift.
2. `lib/extract/structure/squash.ts:59` — a child carrying a non-landmark `ariaRole` (e.g. `role="dialog"`, `role="tablist"`) is absorbed and its role discarded; `ariaRole` is currently unused downstream so there is no observable impact today, but adding `!child.ariaRole` to the guard would be more conservative and future-proof.
3. `lib/extract/structure/squash.ts:71` — the merged node keeps the outer's `signature` even though its subtree changed; harmless today because `detectRepetition` recomputes signatures live via `getBaseSignature`, but the stored field now misdescribes the subtree it labels.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | PASS |
| Eval (`npm run eval`) | PASS — aggregate 100%, all gates passed, no baseline refresh |

## What's Good

- The pass was wired into `responsive.ts`'s `typeSecondary` as well as `index.ts` — squashing only the primary tree would have silently broken the responsive diff's positional alignment; catching this dependency was the most important correctness call in the change.
- Bottom-up recursion plus the `while` loop collapses chains of arbitrary depth in one pass.
- The `tagName !== undefined` guard keeps vision-inferred trees untouched, consistent with the repo's measured-never-faked invariant.
- Sticky/fixed suffix stripping/re-appending preserves pinned-landmark information through annotation resolution, and tie-breaks prefer the innermost (content) layout per the issue's hero example.
- Immutable transform (spread, no input mutation), matching the `repetition.ts` stage pattern.

## Recommendation

Approve. The three low-severity suggestions are optional polish and can be addressed in this branch or deferred; none block a PR.
