# Plan: Squash single-child generic wrapper chains in the pruned tree (DIST-024)

## Summary

Add a deterministic post-pass to the structure lane that collapses chains like `Hero → Hero [grid · 1col] → Hero [grid · 12col]` into a single node. The existing wrapper-collapse rule in `pruner.ts` deliberately exempts flex/grid wrappers (don't touch it); this new pass runs *after* `pruneAndCollapse` and *before* `detectRepetition`, merging a node with its single child when the child is a generic layout container (no landmark, not interactive, not a semantic tag). The outer node's identity (tag, landmark, bounds) survives; the more specific layout annotation wins (`grid · Ncol` > `grid · 1col` > `flex …` > none). The pass is a pure `PrunedNode → PrunedNode` function, so it works identically for live-`Page` and pre-harvested `rawHarvestNode` (eval replay) inputs, and must also be wired into the responsive secondary-viewport re-derivation so tree alignment stays consistent.

## User Story

As a builder reading a structure report
I want wrapper chains collapsed to one node
So that the skeleton reads at section altitude instead of echoing every layout wrapper.

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT |
| Complexity | MEDIUM |
| Systems Affected | structure lane (`lib/extract/structure/`) |
| GitHub Issue | #30 |

---

## Patterns to Follow

### Stage shape — pure PrunedNode transform, one exported function per file

```ts
// SOURCE: lib/extract/structure/repetition.ts:8-17
export function detectRepetition(node: PrunedNode): PrunedNode {
  const childrenProcessed = node.children.map((child) => detectRepetition(child));
  ...
  return { ...node, children: childrenProcessed };
}
```

### The existing collapse rule the pass must NOT disturb (and its meaningful-container definition to reuse)

```ts
// SOURCE: lib/extract/structure/pruner.ts:52-65
const isMeaningfulContainer =
  Boolean(layoutAnnotation) ||
  Boolean(root.landmark) ||
  root.isInteractive ||
  ["header", "nav", "main", "footer", "section", "article", "aside", "form"].includes(root.tagName);

if (cleanedChildren.length === 1 && !isMeaningfulContainer) { ... collapse into child ... }
```

### Pipeline wiring point

```ts
// SOURCE: lib/extract/structure/index.ts:68-75
const prunedRoot = pruneAndCollapse(rawRoot);
if (!prunedRoot) { throw ... }
// Stage 5: Detect Repetition
const repeatedRoot = detectRepetition(prunedRoot);
```

```ts
// SOURCE: lib/extract/structure/responsive.ts:91-93 (same stages re-run per secondary viewport)
const pruned = pruneAndCollapse(raw);
...
return assignOntologyTypes(detectRepetition(pruned));
```

### Annotation vocabulary produced upstream (what the specificity ranking must parse)

```ts
// SOURCE: lib/extract/structure/pruner.ts:24-46
// "flex · <dir>" | "flex · <justify>" | "grid" | "grid · <N>col"
// plus, for sticky/fixed landmarks: "<annotation> · sticky" | "sticky" (bare)
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/extract/structure/squash.ts` | CREATE | New post-pass `squashWrapperChains(root: PrunedNode): PrunedNode` |
| `lib/extract/structure/index.ts` | UPDATE | Wire pass after `pruneAndCollapse`, before `detectRepetition` |
| `lib/extract/structure/responsive.ts` | UPDATE | Apply the same pass in the secondary-viewport re-derivation (tree alignment consistency) |

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Create the squash pass

- **File**: `lib/extract/structure/squash.ts`
- **Action**: CREATE
- **Implement**:
  - Export `squashWrapperChains(node: PrunedNode): PrunedNode`. Recurse children first (bottom-up), then repeatedly merge while the merge condition holds (a `while` loop so chains of 3+ collapse fully).
  - **Merge condition** — node has exactly 1 child AND the child is a *generic layout container*:
    - `!child.landmark`
    - `!child.isInteractive`
    - child's tag is not semantic: not in `["header", "nav", "main", "footer", "section", "article", "aside", "form"]` (same list as `pruner.ts:56`); a child with no `tagName` (vision-inferred) is NOT merged — leave those trees alone.
    - `child.children.length > 0` (it's a container, not a leaf content node)
  - **Merged node** (outer identity survives): keep outer `id`, `tagName`, `ariaRole`, `landmark`, `bounds`, `signature`, `provisionalType`, `componentName`; take `children` from the child; propagate `hasText: outer.hasText || child.hasText`, `textSnippet: outer.textSnippet ?? child.textSnippet`, `isImageOrSvg: outer.isImageOrSvg || child.isImageOrSvg`, keep outer `isInteractive`.
  - **Annotation resolution** (`grid · Ncol` > `grid · 1col`/`grid` > `flex …` > none):
    - Strip any ` · sticky` / ` · fixed` suffix (or bare `sticky`/`fixed`) from the outer annotation before ranking; remember it.
    - Rank the flex/grid part: `grid · Ncol` with N ≥ 2 → 3; `grid · 1col` or bare `grid` → 2; anything starting with `flex` → 1; absent/position-only → 0.
    - Higher rank wins; on equal rank prefer the child's (innermost content layout — matches the AC's "hero keeps the innermost content grid's annotation").
    - Re-append the remembered sticky/fixed suffix (outer landmark positioning must not be lost).
  - JSDoc header naming it as the post-pass companion to Stage 4 (cite issue #30 / DIST-024) and stating why the pruner's own rule can't do this (it exempts flex/grid wrappers on purpose).
- **Mirror**: `lib/extract/structure/repetition.ts:8-17` — pure recursive `PrunedNode` transform.
- **Validate**: `npm run typecheck`

### Task 2: Wire into the primary pipeline

- **File**: `lib/extract/structure/index.ts`
- **Action**: UPDATE
- **Implement**: After the `pruneAndCollapse` null-check (line ~69-72), insert `const squashedRoot = squashWrapperChains(prunedRoot);` and feed `squashedRoot` to `detectRepetition`. Add the import.
- **Validate**: `npm run typecheck`

### Task 3: Wire into the responsive re-derivation

- **File**: `lib/extract/structure/responsive.ts`
- **Action**: UPDATE
- **Implement**: In the per-secondary-viewport derivation (lines ~91-93), apply `squashWrapperChains` between `pruneAndCollapse` and `detectRepetition`, mirroring index.ts — the responsive diff aligns trees by structural position, so both sides must be squashed identically.
- **Validate**: `npm run typecheck`

### Task 4: End-to-end verification against a synthetic wrapper-chain fixture

- **File**: scratch script only (delete afterwards; do NOT commit, do NOT touch `eval/corpus`)
- **Action**: VERIFY
- **Implement**: Per CLAUDE.md "Manually verifying extraction changes": scratch script in the session scratchpad that serves a synthetic HTML page whose hero is `section.hero > div[display:grid; 1 col] > div[display:grid; grid-template-columns repeated 12] > (h1 + p + a)`, plus a control (e.g. a `nav` child that must NOT be merged into a wrapper). Drive Playwright directly like `eval/capture.ts` (chromium.launch + page.goto) or set `SSRF_ALLOWLIST_HOSTS=localhost`, call `extractStructure`, and assert the emitted skeleton shows the hero as a single node annotated `grid · 12col` (no `1col` intermediate line). Run with `npx tsx` from the project root.
- **Validate**: script output shows the squashed skeleton

---

## Validation

```bash
npm run typecheck
npm run lint
npm run eval
```

`npm run eval` must pass with NO baseline refresh (per the issue's AC). Note `eval/run.ts:60-64` calls `scoreStructure(structReport)` without an expected spec, so structure scores are constant 1.0 — the design-token scores must be untouched because this change never leaves the structure lane.

## End-to-End Verification

1. Write the Task-4 scratch script in the scratchpad directory; run `npx tsx <script>` from `/home/lauri/github/distill-design-scraper`.
2. Expected: skeleton ASCII contains exactly one hero line carrying `grid · 12col`; the intermediate `grid · 1col` wrapper line is gone; the control landmark/interactive children are still separate nodes.
3. Delete the scratch script.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Squashing changes tree shape used by the responsive diff's positional alignment | Apply the identical pass on both primary and secondary derivations (Task 3) |
| Losing a sticky/fixed landmark annotation when the inner grid annotation wins | Strip + re-append the position suffix in the annotation resolver |
| Vision-inferred trees (`structureFromImage.ts`) have no `tagName`/`bounds` | Guard: never merge when the child has no `tagName` |
| Eval baseline drift | Structure isn't score-gated (no expected spec) and the token lane is untouched; run `npm run eval` unchanged, no `UPDATE_BASELINE` |

## Acceptance Criteria

- [ ] Single-child + generic-layout-container child merges into one node
- [ ] More specific annotation wins; outer landmark kept
- [ ] Landmark/interactive/semantic children never merged
- [ ] Synthetic hero fixture emits a single hero node with the innermost grid's annotation
- [ ] `npm run typecheck`, `npm run lint`, `npm run eval` pass with no baseline refresh
