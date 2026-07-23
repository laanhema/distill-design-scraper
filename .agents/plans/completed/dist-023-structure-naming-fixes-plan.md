# Plan: Fix structure naming — no root "Hero", no bogus *Card suffixes (DIST-023)

## Summary

Two heuristic-naming bugs in the structure lane's Stage 6 ontology pass (`lib/extract/structure/ontology.ts`) produce misleading skeletons: (1) `isHeroSection` can name the depth-0 root node (typically `document.body`, or whatever it collapsed into) "Hero" whenever an h1 sits above y=900 — presenting the whole page as a hero with bogus instance counts; (2) every repeated unit gets a `*Card` suffix via `formatDefaultName(node) + "Card"`, so repeated `<span>` counter digits become `SpanCard ×11` and repeated `<li>`s become `LiCard` even when they have no card-like content. Fix both by threading `depth` into `formatDefaultName` (depth 0 → always `Page`, hero check never reached) and gating the `*Card` suffix on tag ∈ {div, section, article, li} AND card-like content (has children, or mixed text+image). Verify with a synthetic-fixture scratch script (deleted afterwards) and the eval gate with no baseline refresh.

## User Story

As a builder reading a structure report
I want component names that reflect what the elements actually are
So that the skeleton doesn't present `document.body` as a "Hero" with bogus instances or animated counter digits as `SpanCard ×11`

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | LOW |
| Systems Affected | structure lane Stage 6 (ontology naming) only |
| GitHub Issue | #29 |

---

## Context: how the code works today

- `assignOntologyTypes(node, depth = 0, insideFooter = false)` (`lib/extract/structure/ontology.ts:7`) recurses depth-first; children are typed first, then the node's own branch chain runs:
  1. landmark regions (`depth <= 1`) — names `SiteHeader`/`SiteFooter`/`Navbar`/`MainContent` (lines 22–42)
  2. `isCtaRow` composites (line 46)
  3. atoms by tag/interactivity (lines 50–71)
  4. **repeated units** (`instanceCount >= 2`) → `content-block`, `name = formatDefaultName(node) + "Card"` (lines 72–76) — **bug 2 is here**: no tag or content gate, so `SpanCard`, `LiCard` etc.
  5. text leaves → atom, span/small collapse to `Text` (lines 77–82)
  6. containers/composites (lines 83–90)
- `formatDefaultName(node, childrenTyped = [], insideFooter = false)` (line 118) — for `div`/`section` checks `isHeroSection` (line 127) first. `isHeroSection` (line 145) returns true for any node with bounds whose `y < 900` containing an h1 — **bug 1 is here**: the depth-0 root (bounds.y = 0, page contains an h1) always qualifies, so the root gets named `Hero` when it's a div/section. The root is `document.body` (`harvester.ts:159`), but `pruneAndCollapse` (`pruner.ts:48–62`) may collapse body into its single child, so the depth-0 node can be a `div`, `section`, or even a landmark like `main`.
- Callers of `assignOntologyTypes`: `lib/extract/structure/index.ts:78` (primary) and `lib/extract/structure/responsive.ts:93` (secondary viewports — aligned later by tagName+landmark, never by name, so renaming the root is safe there).
- Eval: `eval/scoreStructure.ts` only scores structure when `expected.yaml` carries `expectedRegions`/`expectedComponents`; neither corpus fixture (`eval/corpus/clean-light`, `eval/corpus/dark-mode`) does, so structure naming changes cannot move eval scores. `npm run eval` must pass with **no baseline refresh**.
- `structureFromImage.ts:60–86` prompts the vision model with the same "Hero"/"<Noun>Card" vocabulary — that is the AI lane, out of scope for this heuristic fix; do not touch it.

---

## Patterns to Follow

### Existing depth threading and branch structure
```ts
// SOURCE: lib/extract/structure/ontology.ts:7-19
export function assignOntologyTypes(
  node: PrunedNode,
  depth: number = 0,
  insideFooter: boolean = false,
): PrunedNode {
  ...
  let name = formatDefaultName(node, childrenTyped, insideFooter);
```
`depth` already exists on the recursion — thread it into `formatDefaultName` as a trailing parameter with a default, mirroring how `insideFooter` was added.

### Existing "meaningless tag name collapses to Text" pattern
```ts
// SOURCE: lib/extract/structure/ontology.ts:77-82
else if (node.hasText && childrenTyped.length === 0) {
  provisionalType = "atom";
  if (node.tagName && ["span", "small"].includes(node.tagName)) name = "Text";
}
```
Reuse this collapse for repeated text leaves that lose their `*Card` suffix, so a repeated span reads `Text ×11`, not `Span ×11`.

### Doc-comment style
Each helper carries a one-to-three-line `/** ... */` explaining the heuristic and citing the plan section (e.g. `ontology.ts:101-103, 143-144, 151-153`). New helpers must do the same.

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/extract/structure/ontology.ts` | UPDATE | Both fixes live here; no other file changes |

---

## Tasks

### Task 1: Depth-0 root is always `Page`

- **File**: `lib/extract/structure/ontology.ts`
- **Action**: UPDATE
- **Implement**:
  1. Add `depth: number = 1` as a trailing parameter to `formatDefaultName(node, childrenTyped, insideFooter, depth)`. At the very top of the function body: `if (depth === 0) return "Page";` — this runs before the div/section branch, so `isHeroSection` can never apply to the root regardless of h1 position. Default the parameter to `1` (not `0`) so the two existing internal call sites that omit it (the repeated-unit branch) keep today's behavior.
  2. Pass the real `depth` at the main call site (line 19): `formatDefaultName(node, childrenTyped, insideFooter, depth)`.
  3. In the landmark-region branch (lines 22–42), guard the four specific-name overrides so they only apply when `depth > 0` — a root that collapsed into `main`/`header` must stay `Page`, not become `MainContent`. Keep `provisionalType = "region"` and the height annotation as-is for the root (region height is still real).
  4. Add/adjust doc comments explaining the depth-0 rule (root is the page, never a hero).
- **Mirror**: `insideFooter` threading (`ontology.ts:10,15,19,121`)
- **Validate**: `npm run typecheck`

### Task 2: Gate the `*Card` suffix on tag + card-like content

- **File**: `lib/extract/structure/ontology.ts`
- **Action**: UPDATE
- **Implement**:
  1. Add a helper, e.g.:
     ```ts
     /** Only tags that plausibly wrap a card, with real card-like content
      *  (children, or mixed text+image), earn the `*Card` suffix — a repeated
      *  bare span/li (counter digits, plain list items) keeps its base name. */
     function isCardWorthy(node: PrunedNode, childrenTyped: PrunedNode[]): boolean {
       if (!node.tagName || !["div", "section", "article", "li"].includes(node.tagName)) return false;
       return childrenTyped.length > 0 || (node.hasText && node.isImageOrSvg);
     }
     ```
  2. In the repeated-unit branch (lines 72–76): keep `provisionalType = "content-block"` (the repetition itself is real and `instanceCount` must survive), but only append `Card` when `isCardWorthy(node, childrenTyped)`. When not card-worthy, use the base name — and for text-leaf tags apply the existing `Text` collapse (`span`/`small`/`p` with `hasText` and no children → `Text`), else `formatDefaultName(node)` as today, minus the suffix.
  3. `article` and `li` are not handled by `formatDefaultName`'s div/section branch — their base name is `capitalize(tagName)` (`Article`/`Li`); with the suffix they become `ArticleCard`/`LiCard` only when card-worthy. This matches AC 3 (repeated div/article with real content still get `*Card`).
- **Mirror**: `ontology.ts:77-82` (Text collapse), `ontology.ts:104-113` (small predicate helper w/ doc comment)
- **Validate**: `npm run typecheck && npm run lint`

### Task 3: Synthetic-fixture end-to-end verification (scratch script, then delete)

- **File**: `/tmp/claude-1000/-home-lauri-github-distill-design-scraper/d2888b27-1563-4b61-a44b-f3b456b3de2f/scratchpad/verify-dist023.ts` (scratchpad — never committed; CLAUDE.md requires deleting scratch scripts and `npx tsx` must run **from the project root**)
- **Action**: CREATE, run, DELETE
- **Implement**: Per CLAUDE.md "Manually verifying extraction changes": local `http.createServer` serving a synthetic page containing (a) an `h1` near the top directly under body, (b) a repeated run of ≥3 `<span>` counter digits, (c) a grid of ≥3 real cards (`<article>` or `<div>` with heading + paragraph + `<img>`/svg content). Drive `renderUrl` (with `SSRF_ALLOWLIST_HOSTS=localhost`) + `captureFromRender` + `extractStructureFromCapture` from `lib/analyze.ts`; print the skeleton ASCII / component map. Assert:
  - skeleton root line is `Page` (no `Hero` at root; a genuine inner hero section may still be named `Hero`)
  - no `SpanCard` (or any `*Card` on a non-div/section/article/li tag) appears anywhere
  - the real card group still carries a `*Card` name
- **Note**: no `ANTHROPIC_API_KEY` needed — Stage 7 falls back to heuristic names, which is exactly what's under test.
- **Validate**: script output shows all three assertions pass; then `rm` the script.

---

## Validation

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run eval        # regression gate — must pass with NO baseline refresh
```

## End-to-End Verification

Run the Task 3 scratch script from the project root:

```bash
cd /home/lauri/github/distill-design-scraper
SSRF_ALLOWLIST_HOSTS=localhost npx tsx /tmp/claude-1000/-home-lauri-github-distill-design-scraper/d2888b27-1563-4b61-a44b-f3b456b3de2f/scratchpad/verify-dist023.ts
```

Expected output: skeleton root named `Page`; no `SpanCard` anywhere; the genuine card grid still emits a `*Card` component with its instance count. Delete the script afterwards.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Root collapsed into a landmark (`main`) would be renamed `MainContent`, violating "root is always Page" | Task 1 step 3 guards the landmark name overrides with `depth > 0` |
| Losing legit `Hero` naming for real hero sections at depth ≥ 1 | Depth special-case only fires at `depth === 0`; inner sections unchanged (scratch script has an inner hero-like section to eyeball) |
| Eval score drift | Structure naming is unscored in the current corpus (no `expectedRegions`/`expectedComponents` in either `expected.yaml`); run `npm run eval` to confirm — no baseline refresh allowed |
| Stage 7 AI labeller renames on top of heuristics | Out of scope; heuristic names are the fallback contract under test (no API key in scratch run) |
| `structureFromImage.ts` prompt still says "Hero"/`<Noun>Card` | AI vision lane, explicitly `fidelity: "inferred"` — issue targets the heuristic ontology stage only; do not touch |

## Acceptance Criteria

- [ ] Depth-0 node is always named `Page`; `isHeroSection` never applies to the root
- [ ] Repeated units with tag not in div/section/article/li, or without children/mixed content, keep their base name (no `SpanCard`, no `LiCard`)
- [ ] Repeated div/article units with real card-like content still get `*Card`
- [ ] Synthetic fixture: skeleton root is `Page`, no `SpanCard` appears
- [ ] `npm run typecheck`, `npm run lint`, `npm run eval` pass with no baseline refresh
- [ ] Scratch script deleted; only `lib/extract/structure/ontology.ts` changed
