# Code Review: feature/dist-023-structure-naming-fixes

**Scope**: branch `feature/dist-023-structure-naming-fixes` diff vs `main` (uncommitted working-tree change: `lib/extract/structure/ontology.ts`, +42/−8)
**Recommendation**: APPROVE WITH NITS

## Summary

The diff fixes the two DIST-023 naming bugs in structure-lane Stage 6: the depth-0 root can no longer be named "Hero" (or any landmark-specific name) — `formatDefaultName` short-circuits to `Page` at depth 0 and the landmark name overrides are guarded with `depth > 0` — and the repeated-unit `*Card` suffix is now gated by `isCardWorthy` (tag ∈ div/section/article/li plus content), with repeated bare text leaves collapsing to `Text`. A consistent follow-through tightens `isCardGrid` to require the repeated child to actually carry the `Card` suffix. The change is small, well-commented in the file's established style, stays entirely inside the heuristic ontology stage (AI/vision lanes untouched), and all gates pass with no baseline refresh. Two non-blocking findings below.

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority

1. `lib/extract/structure/structureEmit.ts:187` — `computeContentMaxWidth` keys on `componentName === "MainContent"`. When `document.body` collapses into a lone `<main>` (a common `body > main` page shape), the depth-0 node was previously named `MainContent` and its children fed the content-max-width computation; it is now named `Page`, so those direct children no longer count. Partially mitigated because inner `<section>` tags still match, but pages whose content wrappers are divs directly under a root `<main>` can silently lose `contentMaxWidth`. Recommendation: also match `node.tagName === "main"` in the walk (tag-based, name-independent).

### Suggestions (Low)

2. `lib/extract/structure/ontology.ts:137` — the second `isCardWorthy` clause `node.hasText && node.isImageOrSvg` is unreachable: the function already returned `false` unless `tagName` ∈ div/section/article/li, and `isImageOrSvg` is only ever true for `img`/`svg`/`picture`/`canvas` (harvester.ts:38-41). The effective gate is "tag in set AND has children", which still satisfies the issue's acceptance criteria (a childless div with text+image content collapses into its image child in the pruner anyway), but the clause as written is dead — either drop it or detect mixed content via `childrenTyped` (e.g. some child `isImageOrSvg` and some child `hasText`).

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | PASS |
| Tests (`npm run eval`) | PASS — clean-light 100%, dark-mode 100%, aggregate 100%, all gates passed, baseline untouched |

(No unit-test framework exists; per CLAUDE.md the eval harness is the correctness gate. Structure naming is unscored by the current corpus — neither `expected.yaml` declares `expectedRegions`/`expectedComponents` — so the naming fix is verified by the implementer's synthetic-fixture run rather than eval scores.)

## What's Good

- Both fixes land exactly where the bug lives (Stage 6 heuristics) and nowhere else; the AI-lane "Hero"/"<Noun>Card" prompt vocabulary in `structureFromImage.ts` is correctly left alone.
- The `depth > 0` guard on landmark names catches the non-obvious case of the pruner collapsing `body` into a landmark — without it, "root is always Page" would fail for `body > main` pages.
- `provisionalType: "content-block"` and `instanceCount` survive the de-suffixing, so the repetition measurement itself is preserved — consistent with the "measured, never faked" invariant.
- The `isCardGrid` tightening (`componentName.endsWith("Card")`) prevents the new naming from leaving a stale "CardGrid" over a run of counter digits — a coherent follow-through, not scope creep.
- Doc comments match the file's established style and explain the *why* of each heuristic.

## Recommendation

Approve with nits. Neither finding blocks the issue's acceptance criteria; finding 1 is worth a small follow-up (tag-based match in `computeContentMaxWidth`) since it is a behavioral side effect outside the issue's stated scope.
