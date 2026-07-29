# Plan: DIST-063 — Type Structure Regions by Landmark Identity, Not Tree Depth

## Summary

`lib/extract/structure/ontology.ts:24` gates page-band region typing (`provisionalType = "region"` plus the `SiteHeader`/`MainContent`/`Navbar`/`SiteFooter` name rewrite) on `depth <= 1`. `depth` is only a proxy for "this node is a top-level page band," and the proxy holds only because Stage 4b squash (`squash.ts`) usually flattens `body → div → header/main/footer` down to depth 1 — it doesn't when the wrapper has a sibling (a skip-link, a portal root, a toast container), which the DIST-062 `adversarial-shell` fixture (already merged, scoring `0.92` in `eval/baseline.json`) deliberately reproduces. This plan replaces the depth check with an ancestor-tracked identity check — a node is region-eligible only if no strict ancestor already matched the same landmark/tag predicate — threaded top-down exactly the way `insideFooter` already is, so the fix generalizes to any wrapper depth instead of patching this one shape. It also closes a second defect the same root cause exposes: the surviving wrapper div is independently mislabeled `Hero` (an unrelated heuristic — `isHeroSection`'s recursive h1 search — doesn't know it's now looking through real regions), via a one-line guard in the same file. `regionMetrics.ts` (Stage 8a) and `sections.ts` (Stage 9) need no changes — both already key off `provisionalType`/landmark identity, not depth, so they pick up the fix automatically. The change is proven by `npm run eval` scoring `adversarial-shell` at its expected (yaml-asserted) value, with `eval/baseline.json` refreshed in the same PR.

## User Story

As an agency builder
I want the page skeleton to keep its transferable region vocabulary (`SiteHeader`/`MainContent`/`Navbar`/`SiteFooter`) and band annotations on any real-world DOM shape
So that a single stray wrapper `<div>` doesn't silently downgrade my rebuild spec to generic names

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | MEDIUM |
| Systems Affected | `lib/extract/structure/ontology.ts` (primary); `eval/baseline.json` (generated); verification only for `lib/extract/structure/regionMetrics.ts`, `lib/extract/structure/sections.ts` |
| GitHub Issue | #125 (DIST-063) |

---

## Root-cause background (verified by reading the pipeline, not guessed)

1. **`ontology.ts:22-27`** — the region gate:
   ```ts
   if (
     depth <= 1 &&
     (node.landmark || (node.tagName && ["header", "nav", "main", "footer"].includes(node.tagName)))
   ) {
     provisionalType = "region";
   ```
   `depth` counts distance from the pruned/squashed root. Add a sibling to the wrapper that would otherwise squash away (`squash.ts:40` only absorbs a child when the parent has **exactly one** child), and every landmark drops to depth 2 — this branch never fires, so header/main/footer fall through to `formatDefaultName`'s generic `capitalize(node.landmark)` fallback (`Header`/`Main`/`Footer`), and the `h Npx` height tag (lines 43-46, later refined into `padY`/`h 100vh` by Stage 8a) is never attached.
2. **`squash.ts`'s own contract is depth-agnostic** — it only ever removes *generic* wrapper divs (no landmark, not interactive, not a semantic tag). It is correctly conservative about a wrapper with a real sibling; the bug is entirely that `ontology.ts` uses depth as a stand-in for "already squashed to a page band" instead of testing landmark identity directly.
3. **`sections.ts:findBand` (lines 53-85) is already depth-agnostic** — it matches by `landmark`/`tagName` first, `componentName` only as a fallback, and (for header/footer) explicitly excludes descending into the already-found `main` subtree. This is the exact shape the issue's own review comment says to reuse: *"gate on the identity being tested (landmark), never on a positional proxy for it."* `findBand` still finds the right nodes today even with the bug present — Stage 9 just reports their degraded `componentName`.
4. **`regionMetrics.ts:40` (Stage 8a)** only rewrites nodes whose `provisionalType === "region"` — it walks the *whole* tree with no depth check of its own, so once Stage 6 types header/main/footer as `region` at any depth, Stage 8a picks them up with zero changes required there.
5. **A second, independent defect surfaces once the wrapper is exposed**: `formatDefaultName`'s `div`/`section` branch (`ontology.ts:157-166`) calls `isHeroSection`, which does `!node.bounds || node.bounds.y >= 900` (false — the wrapper spans from the top of the page) and `containsTag(childrenTyped, "h1")` (true — the real hero's `h1` is somewhere in its subtree). This is unconditional and independent of `provisionalType`, so even after fixing the region gate, the wrapper div itself is still named `Hero` — it does **not** "fall out" automatically. Confirmed by tracing: `formatDefaultName` is called once, unconditionally, before the region/atom/composite/container branches; only the region and atom branches ever overwrite `name`, and the wrapper (now correctly typed `container`, since its children include `region`-typed nodes, not all-`atom`) is not one of them. This needs its own guard (Task 2).
6. **The `adversarial-shell` fixture (`eval/corpus/adversarial-shell/`, merged in #124/DIST-062) already asserts the post-fix names** (`expected.yaml`'s `expectedSections`/`expectedRegions` list `SiteHeader`/`MainContent`/`SiteFooter`, not today's `Header`/`Main`/`Footer`) and is registered without `optional: true`, so `npm run eval` exercises this fix directly — no new fixture or scratch script is the proof; `eval/baseline.json`'s current `"adversarial-shell": 0.92` is expected to rise once this lands.

---

## Patterns to Follow

### Ancestor-threaded state (the shape to generalize)
```ts
// SOURCE: lib/extract/structure/ontology.ts:7-16 (current insideFooter threading)
export function assignOntologyTypes(
  node: PrunedNode,
  depth: number = 0,
  insideFooter: boolean = false,
): PrunedNode {
  const childInsideFooter =
    insideFooter || node.tagName === "footer" || node.landmark === "contentinfo";
  const childrenTyped = node.children.map((c) =>
    assignOntologyTypes(c, depth + 1, childInsideFooter),
  );
```
`insideFooter` is computed from the *current* node's own identity (not from `provisionalType`, which isn't known yet — children are typed bottom-up before the parent's own branch runs) and threaded into the recursive call. `insideRegion` follows the exact same shape: computed from the landmark/tag predicate (the same one used by the gate itself), threaded as a fourth parameter.

### Identity predicate to reuse (already correct in this codebase)
```ts
// SOURCE: lib/extract/structure/sections.ts:58-71 (findBand)
const predicates: Record<typeof kind, (n: PrunedNode) => boolean> = {
  header: (n) => n.landmark === "banner" || n.landmark === "header" || n.tagName === "header",
  main: (n) => n.landmark === "main" || n.tagName === "main",
  footer: (n) => n.landmark === "contentinfo" || n.landmark === "footer" || n.tagName === "footer",
};
```
`ontology.ts` doesn't need a third copy of this per-kind predicate — its existing combined check (`node.landmark || (node.tagName && [...].includes(node.tagName))`) already captures "is this node a landmark of any of the four kinds," which is sufficient for the ancestor-tracking boolean (we don't need to know *which* kind an ancestor was, only that region-typing already happened above this point in the tree — mirrors `insideFooter`, which also collapses "footer or contentinfo" into one boolean rather than tracking kind).

### Sibling-only identity check (the other half of "identity, not proxy")
```ts
// SOURCE: lib/extract/structure/ontology.ts:186-193 (isCardGrid) — inspects
// childrenTyped's *already-resolved* provisionalType to make a naming decision,
// the same shape the Task 2 Hero guard needs.
function isCardGrid(childrenTyped: PrunedNode[]): boolean {
  return (
    childrenTyped.length === 1 &&
    childrenTyped[0].provisionalType === "content-block" &&
    (childrenTyped[0].instanceCount ?? 1) >= 2 &&
    childrenTyped[0].componentName.endsWith("Card")
  );
}
```

### Eval workflow (mandatory before/after touching an extractor)
```
// SOURCE: CLAUDE.md, "The eval harness" section
1. Make the change.
2. Run `npm run eval`. It must pass unchanged unless the score change is the
   _intended_ result of your fix.
3. Only then, refresh the baseline deliberately: `UPDATE_BASELINE=1 npm run eval`.
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/extract/structure/ontology.ts` | UPDATE | Replace `depth <= 1` region gate with ancestor-tracked landmark-identity gate (`insideRegion`); guard `isHeroSection` against a wrapper that itself contains a region-typed child |
| `eval/baseline.json` | UPDATE (generated via `UPDATE_BASELINE=1 npm run eval`) | Refresh `adversarial-shell`'s score once it legitimately rises; `clean-light`/`dark-mode` expected unchanged at `1` |

No changes expected to `lib/extract/structure/regionMetrics.ts` or `lib/extract/structure/sections.ts` — both are already identity-based, not depth-based (verified in root-cause notes 3-4 above). Task 3 below is a verification-only step to confirm this holds rather than an edit.

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Replace the depth-based region gate with an ancestor-tracked identity gate

- **File**: `lib/extract/structure/ontology.ts`
- **Action**: UPDATE
- **Implement**:
  1. Add a fourth parameter `insideRegion: boolean = false` to `assignOntologyTypes`, alongside the existing `depth`/`insideFooter` parameters (line 7-11).
  2. Compute the landmark/tag identity predicate once, before the `childrenTyped` map, so it can be reused both for threading and for the gate itself:
     ```ts
     const isLandmarkNode = Boolean(
       node.landmark || (node.tagName && ["header", "nav", "main", "footer"].includes(node.tagName)),
     );
     const childInsideRegion = insideRegion || isLandmarkNode;
     ```
  3. Pass `childInsideRegion` as the fourth argument in the recursive `node.children.map((c) => assignOntologyTypes(c, depth + 1, childInsideFooter, childInsideRegion))` call (line 14-16).
  4. Change the region gate condition (line 23-26) from:
     ```ts
     if (
       depth <= 1 &&
       (node.landmark || (node.tagName && ["header", "nav", "main", "footer"].includes(node.tagName)))
     ) {
     ```
     to:
     ```ts
     if (!insideRegion && isLandmarkNode) {
     ```
  5. Leave the `if (depth > 0) { ... SiteHeader/SiteFooter/Navbar/MainContent ... }` naming guard (lines 31-36) and the raw-height annotation block (lines 43-46) **untouched** — they already correctly depend only on `depth === 0` (the page root) and `node.bounds`, not on the gate's old `depth <= 1` threshold. Only the outer `if` condition changes.
  6. Update the comment above the gate (currently "1. Landmarks -> region") to explain the identity-based rationale (why `insideRegion` replaces `depth <= 1`) so a future reader doesn't reintroduce the depth proxy — mirror the style of the squash.ts module-level comment explaining *why* a rule exists, not just what it does.
- **Mirror**: `ontology.ts:12-13` (`childInsideFooter` computation/threading) for the exact shape; `sections.ts:58-71` (`findBand`'s predicates) for why identity (landmark/tag), not position, is the correct test.
- **Validate**: `npm run typecheck`

### Task 2: Guard `isHeroSection` against a wrapper that itself contains a real region

- **File**: `lib/extract/structure/ontology.ts`
- **Action**: UPDATE
- **Implement**: In `isHeroSection` (lines 176-179), add a check that bails when any direct child is already typed `region` — such a node is a page-level shell (it wraps real bands), never hero content, regardless of what an h1 search finds deeper inside it:
  ```ts
  function isHeroSection(node: PrunedNode, childrenTyped: PrunedNode[]): boolean {
    if (!node.bounds || node.bounds.y >= HERO_Y_THRESHOLD_PX) return false;
    // A container that itself wraps a page-level region (header/main/footer)
    // is a page shell, not hero content, even if an h1 happens to live
    // somewhere inside it (e.g. an unsquashable wrapper div, DIST-063).
    if (childrenTyped.some((c) => c.provisionalType === "region")) return false;
    return containsTag(childrenTyped, "h1");
  }
  ```
  This relies on `childrenTyped` already carrying resolved `provisionalType` values (true — they're computed bottom-up before `formatDefaultName` runs, same precondition `isCardGrid` already relies on).
- **Mirror**: `ontology.ts:186-193` (`isCardGrid`) — same "inspect already-resolved `childrenTyped[i].provisionalType`" shape.
- **Validate**: `npm run typecheck`; confirmed via Task 4's eval run and the End-to-End Verification script below (the wrapper should name as a generic `Section`/`GridSection`/`FlexContainer` container, not `Hero`).

### Task 3: Confirm downstream stages need no changes (verification only)

- **File**: none (read-only confirmation)
- **Action**: n/a
- **Implement**: Re-read `regionMetrics.ts:34-67` (`annotateRegionMetrics`) and `sections.ts:191-202` (`findDigestBands`)/`53-85` (`findBand`) against the Task 1 diff and confirm neither references `depth` — `annotateRegionMetrics` walks the whole tree checking `node.provisionalType !== "region"`, and `findBand`/`findDigestBands` match by `landmark`/`tagName`/`componentName` fallback only. No edit expected; if either turns out to have a hidden depth dependency, note it and extend Task 1's scope rather than silently patching around it.
- **Validate**: Manual read; no command (this is a design confirmation, not a code change).

### Task 4: Run the eval harness and confirm the fixture's score moves as expected

- **File**: none
- **Action**: n/a (verification)
- **Implement**: Run `npm run eval` (no `UPDATE_BASELINE`). Confirm:
  - `adversarial-shell`'s `structure` sub-score and `combined` score rise above the committed baseline (`0.92`) — since `eval/baseline.json` still holds the pre-fix `0.92`, a legitimate rise will show as an *improvement*, which the harness's "no site may drop below baseline" gate allows (it only fails on regressions).
  - `clean-light` and `dark-mode` remain unchanged at `1` (no regression — their DOM shapes already squash to depth 1, so `insideRegion` behaves identically to the old `depth <= 1` gate for them; verify no `Navbar`/extra region shows up that wasn't there before, since `nav` nested inside `header` must still resolve to `insideRegion = true` and stay non-region, matching both fixtures' `expected.yaml`, neither of which lists a `Navbar` entry).
  - The printed structure notes for `adversarial-shell` no longer list `SiteHeader`/`MainContent`/`SiteFooter` name mismatches (if any mismatch remains, re-check Task 1/2 against the root-cause trace above before proceeding).
- **Validate**: exit code 0; eyeball the printed per-site `structure:` scores before/after in the terminal output.

### Task 5: Refresh the baseline in the same PR

- **File**: `eval/baseline.json`
- **Action**: UPDATE (generated)
- **Implement**: Run `UPDATE_BASELINE=1 npm run eval`. This rewrites `eval/baseline.json` with the new (higher) `adversarial-shell` score; `clean-light`/`dark-mode` should remain `1`.
- **Mirror**: `CLAUDE.md`'s eval workflow step 3; `dist-062-adversarial-eval-fixture-plan.md` Task 9 (same mechanism, this repo's established pattern for committing a legitimate score change).
- **Validate**: `git diff eval/baseline.json` — confirm exactly one value changed (`adversarial-shell`, upward) and the other two are untouched. Include the before/after delta in the PR description per the issue's acceptance criteria ("the delta explained in the description").

### Task 6: Final gate

- **File**: n/a
- **Action**: n/a
- **Implement**: Run `npm run typecheck`, `npm run lint`, `npm run eval` (plain, no `UPDATE_BASELINE`) in sequence — all three must pass cleanly against the refreshed baseline.
- **Validate**: `npm run typecheck && npm run lint && npm run eval`

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Eval (offline, no network/API key — the regression + floor gate)
npm run eval

# Only after confirming the score change is intended (Task 4):
UPDATE_BASELINE=1 npm run eval
```

## End-to-End Verification

1. **Primary proof (required by the issue's own acceptance criteria)**: `npm run eval` scores `adversarial-shell` — a real, committed, offline fixture (`eval/corpus/adversarial-shell/`, `eval/fixtures/adversarial-shell.html`) whose `expected.yaml` already asserts `SiteHeader`/`MainContent`/`SiteFooter` and the correct `Hero`/`CardGrid` section digest. Before the fix: mismatches on those three region names, score `0.92`. After the fix: those mismatches disappear and the score rises (ideally to `1.00`, per `expected.yaml`'s comment: *"asserts the POST-DIST-063 CORRECT names on purpose... hit 1.00 once DIST-063 fixes the depth gate"*).
2. **Regression check**: `npm run eval` shows `clean-light` and `dark-mode` unchanged at `1` — proves the fix doesn't alter behavior for DOM shapes that already squashed to depth 1 (the common case).
3. **Offline manual repro matching the issue's own reproduction method** (optional but recommended, mirrors how the issue was originally verified — per `CLAUDE.md`'s "Manually verifying extraction changes," delete the scratch script when done): write a throwaway `tsx` script that loads `eval/corpus/clean-light/capture.json`, mutates its `rawHarvestNode` to insert an extra sibling under the body-level wrapper (reproducing the issue's own repro: "mutating the committed `rawHarvestNode` and re-running the full structure lane"), calls `extractStructureFromCapture(capture, undefined, { forceHeuristicNaming: true })` from `lib/analyze.ts`, and prints `structReport.skeletonAscii`. Confirm the header/main/footer nodes are still named `SiteHeader`/`MainContent`/`SiteFooter` (not `Header`/`Main`/`Footer`) despite the added depth, that their band annotations (`padY …` / `h 100vh` / `sticky`) are present, and that the wrapper div itself is **not** named `Hero`.
4. `npm run typecheck && npm run lint` both pass on the final tree.

---

## Risks

| Risk | Mitigation |
|------|------------|
| `insideRegion` propagation changes behavior for a real (non-adversarial) DOM shape where a landmark is legitimately nested inside another (e.g. a `<nav>` directly inside `<header>`, or a content `<section>` inside `<main>`) | This is intentional and matches existing behavior: under the *old* `depth <= 1` gate, a `<nav>` inside `<header>` (depth 2) was already excluded from region-typing; under the new gate it's excluded via `insideRegion` instead. Verified against both committed fixtures (neither's `expected.yaml` lists a `Navbar` entry) in Task 4 — a regression here would show up as those fixtures dropping below `1`. |
| The `isHeroSection` guard (Task 2) is broader than strictly required and could suppress a legitimate `Hero` name in some untested real-world shape (e.g. a hero section that, for some reason, has a region-typed child) | Scoped narrowly to "any direct child is `region`-typed" — a genuine hero section (h1 + copy + CTAs) never has a header/main/footer as a *direct child* in any of the eval fixtures or in ordinary page structure, so this should only fire for the page-shell-wrapper case it targets. If `npm run eval`'s `Hero` section-digest entries regress for `clean-light`/`dark-mode`, narrow the condition (e.g. require `childrenTyped.length` to include *multiple* distinct region kinds) rather than reverting it outright. |
| `adversarial-shell`'s score doesn't reach exactly `1.00` after the fix (e.g. a secondary, unrelated mismatch surfaces once the primary depth bug is fixed) | Not a blocker for this issue — the acceptance criteria requires the score to "reach its expected value," and `expected.yaml` was hand-authored against real `extractStructureFromCapture` output per the DIST-062 plan's Task 6 methodology. If the score doesn't reach 1.00, read the harness's printed `misses` list (from `scoreStructure.ts`) to determine whether it's a new, unrelated defect (out of scope — file a follow-up) or evidence Task 1/2 is incomplete (in scope — fix here). |
| Baseline refresh (Task 5) accidentally captures an unintended regression on `clean-light`/`dark-mode` alongside the intended `adversarial-shell` improvement | `git diff eval/baseline.json` after `UPDATE_BASELINE=1 npm run eval` must show only the `adversarial-shell` value changing, and only upward; if either of the other two moves at all, do not commit the baseline — investigate first. |
| A future reader reintroduces a depth-based shortcut elsewhere in the structure lane (e.g. in a new stage) now that this pattern is fixed here | Task 1's updated code comment explicitly documents the identity-vs-depth rationale in `ontology.ts`, and this plan's root-cause section is available in `.agents/plans/` for the same reason — matches the PRD §14 risk row this fix was written to close ("Gate on the identity being tested (landmark), never on a positional proxy for it"). |

---

## Acceptance Criteria

- [ ] Given a harvest whose landmarks sit at depth 2 behind an unsquashable wrapper, the header/main/footer nodes are typed `region` and named `SiteHeader`/`MainContent`/`SiteFooter` — matching the depth-1 baseline output exactly.
- [ ] Those regions carry their Stage 8a band annotations (`padY …`, `h 100vh`, `sticky`) rather than dropping them.
- [ ] The depth-0 root is still named `Page` and never adopts a landmark-specific or hero name.
- [ ] A landmark nested deep inside content (e.g. a `<footer>` inside a card within `<main>`) does not spuriously become a top-level page band.
- [ ] The wrapper div that used to hide the landmarks is not itself mislabeled `Hero` (Task 2).
- [ ] `npm run eval` scores the `adversarial-shell` fixture at its `expected.yaml`-asserted value, proven by the harness, not a scratch script.
- [ ] `eval/baseline.json` is refreshed in the same PR, with the delta explained in the PR description.
- [ ] `npm run typecheck`, `npm run lint`, `npm run eval` all pass on the final tree.
- [ ] No scratch verification scripts left in the repo.
