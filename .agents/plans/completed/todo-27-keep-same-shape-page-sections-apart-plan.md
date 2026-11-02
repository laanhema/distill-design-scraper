# Plan: Keep page sections that share a shape from collapsing into one repeated component

## Summary

Stage 5 (`detectRepetition`, `lib/extract/structure/repetition.ts:8-60`) groups siblings by `getBaseSignature`, which is the tag plus the first five child tags (`repetition.ts:62-70`). On `saas-landing`, the features and pricing `<section>`s both squash to `section[h2,div]`, so the pricing band is dropped and the features band turns into `SectionCard ×2`. The fix exempts the page bands from the collapse. `detectRepetition(root)` now calls `findDigestBands(root)` once (`sections.ts:156`), the same band list that Stage 9 and the Stage 7 prompt use. It then recurses through a private `collapseRepeats(node, bandIds)`. A band is left out of the signature counts and pushed through unchanged: no `instanceCount` and no `varianceNote`. Every node inside a band (card grids, logo clouds, FAQ `details`, nav links) and every node outside `main` (footer columns) collapses as it does today. The public signature `detectRepetition(root: PrunedNode): PrunedNode` does not change, so its two callers, `index.ts:84` and `responsive.ts:80` (Stage 7b's `typeSecondary`), need no edit. Each secondary-viewport harvest gets its own band exemption, so the responsive trees stay the same shape.

**Decision: exempt the bands rather than enrich the signature (probe, 2026-11-02).** AC 1 says that sections with *the same tag shape* but different content stay two. A richer *structural* signature does not meet that in general. Many landing pages repeat a band with the same shape at every depth (for example two or three "feature row" sections of `div[h2,p] + img`), and any tag-only signature, however deep, still merges them. I measured a recursive signature over the four committed captures at every viewport. Depth 1 and 2 do not fix `saas-landing`, because the two grids differ only at the card level (`div[h3,p]` against `div[h3,div,p,a]`). Depth 3 and above fix it and change no other group in any capture. That is the only reason it looks safe, and it would also stop variant cards (one with an extra badge) from collapsing on real sites. A *content* signature (text) would break AC 2, because cards always differ in text. A band, in this codebase, already means "a direct child of `MainContent`, plus header and footer" (`docs/architecture/structure-lane.md:10`), and AC 1 is about exactly those nodes. The scratch check below shows both tag-shape-identical bands staying apart, which a deep signature could not do.

**Side effect, not scored:** with the pricing section back in the tree, `computeContentMaxWidth` (`structureEmit.ts:193-235`) reports `contentMaxWidth: 1104` for `saas-landing` instead of `720`. The fixture's container is `max-w-6xl` (72rem = 1152px) with 24px padding per side, which gives 1104. So the old 720, the narrower FAQ container, came from the missing band, and 1104 is the more accurate value.

Every `file:line` in this plan is a line of HEAD `e6ee0cb`, before the prototype patch is applied.

## User Story

As someone rebuilding a page from a Distill structure report
I want every page section to appear in the skeleton and the section digest, even when two sections share a layout
So that the pricing band (its prices and plan buttons) is not silently dropped and later sections keep their real order

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | LOW (one-function change; the rest is comments, docs and the baseline) |
| Systems Affected | Structure lane Stage 5 (`lib/extract/structure/repetition.ts`), comments in `sections.ts`, `docs/architecture/structure-lane.md`, `docs/architecture/eval.md`, `eval/baseline.json` |
| GitHub Issue | #218 (TODO-27, `TODO.md:11`) |
| PRD Phase | N/A |
| Prototype Patch | `.agents/plans/todo-27-keep-same-shape-page-sections-apart-prototype.patch` |

## Environment Findings

| Probe | Result |
|-------|--------|
| `npm run eval` on HEAD | `clean-light`, `dark-mode`, `adversarial-shell` 100%. `saas-landing` 96% with `Missing/extra section at ordinal 4: expected Section, got SectionCard ×2`, `ordinal 6: expected Section, got SiteFooter`, `ordinal 7: expected SiteFooter, got —`. `aggregate combined: 99%`, `✓ all gates passed` |
| `eval/baseline.json` on HEAD | `saas-landing: 0.9571`, the other three `1` |
| Issue's claim "both squash to `section[h2,div]`" | Confirmed on the squashed tree: features `section[h2,div]` → `div` grid of 6 `div[h3,p]`; pricing `section[h2,div]` → `div` grid of 3 `div[h3,div,p,a]` |
| `npm run eval` with the prototype | All four 100%, `aggregate combined: 100%`, `✓ all gates passed` |
| Full structure report (both mode, heuristic naming), HEAD against prototype | `clean-light`, `dark-mode`, `adversarial-shell`: byte-identical. `saas-landing`: sections become `SiteHeader, Hero, GridSection, Section, Section, Section, SiteFooter` (no `instances`). The pricing band's digest gets `contents: 2 headings · 1 paragraph · SectionCard ×3` and `responsive: CardGrid: 390px \`grid · 1col\` → 768px \`grid · 2col\` → 1440px \`grid · 3col\``. Component map: `Button` stays 2, `Image` 6, `Details` 3, `CardGrid` 1→2, `SectionCard` 10→11. `contentMaxWidth` 720→1104 (see Summary) |
| Responsive diff (AC 5) | The pricing band carries a 390/768/1440 `responsive` line, so Stage 7b paired it with its counterpart at both secondary viewports. The `machineBlock.responsive` keys are unchanged |
| Signature-depth probe (rejected alternative) | Recursive tag signature: depth 1–2 leave `saas-landing` collapsed. Depth ≥ 3 un-collapses it and changes no other group in any capture or viewport |
| Does `npm run eval` exercise the change? | Yes, through the `saas-landing` structure score. It cannot show AC 1 for bands that are tag-identical at every depth, or that AC 2 still holds outside the fixture. The scratch check below covers both |
| Scratch check on HEAD | Exit 1: `FAIL two same-shape bands stay two nodes`, plus `FAIL card grid …` and `FAIL FAQ details …`, which fail on HEAD only because the merged band shifts the child indices the check reads |
| Scratch check with the prototype | Exit 0, seven `ok` lines |
| `npx tsc --noEmit` and `npx eslint` on the touched files, with the prototype | Both exit 0 |
| Forward references to #218 / TODO-27 | Only `TODO.md:11`, `.agents/issues/todo-issues.md`, which is off-limits, and the defect note in `eval/corpus/saas-landing/expected.yaml:8-15`. No code placeholder |
| Image-input path | `structureFromImage.ts` never calls `findDigestBands` or `buildSectionDigests`, so the exemption cannot reach it |

## Patterns to Follow

### Shared band source, never an inline copy

```ts
// SOURCE: lib/extract/structure/structureAI.ts:5,90-91
import { findDigestBands } from "./sections";
...
function summarizeDigestListForAI(root: PrunedNode): DigestListEntry[] {
  return findDigestBands(root).map((band) => ({
```

### Node identity by id, which survives every stage's spread copies

```ts
// SOURCE: lib/extract/structure/sections.ts:187-190
    // Band ids survive every stage via spread copies, so the Stage 7 line
    // joins back even after the AI pass renamed the band.
    const description = descriptions?.[band.id];
```

### Doc comment style: one short *why*, no restating code (house style after #212)

```ts
// SOURCE: lib/extract/structure/sections.ts:148-155
/**
 * `SiteHeader`, each direct child of `MainContent`, `SiteFooter` — empty when
 * the page has no identifiable main region (band identity would be a guess).
 * Single source for BOTH Stage 9 and the Stage 7 AI prompt, so the two can
 * never disagree about which nodes are sections.
 */
```

### Tests

There is no unit test framework (`AGENTS.md`, Commands). `npm run eval` is the gate. One-off behavior goes into a scratch `npx tsx` script, run from the project root and deleted afterwards (`AGENTS.md`, "Manually verifying extraction changes").

## Files to Change

| File | Action | Covered by patch? | Purpose |
|------|--------|-------------------|---------|
| `lib/extract/structure/repetition.ts` | UPDATE | Yes, all of it | `detectRepetition(root)` computes the band ids once and delegates to the private recursive `collapseRepeats`. Bands are skipped in the counts and pushed through unchanged |
| `lib/extract/structure/sections.ts` | UPDATE | No | Correct the comment at line 7 (a band is no longer a collapsed group) and the `findDigestBands` doc at lines 153-154 (Stage 5 is a third consumer) |
| `docs/architecture/structure-lane.md` | UPDATE | No | Document the Stage 5 band exemption, and name Stage 5 as a `findDigestBands` consumer |
| `docs/architecture/eval.md` | UPDATE | No | Drop the "scores below 1.00 because Stage 5 repetition merges its features and pricing sections" clause |
| `eval/baseline.json` | UPDATE | No | `UPDATE_BASELINE=1 npm run eval` → `saas-landing: 1` |
| `eval/corpus/saas-landing/expected.yaml` | NONE | No | Must stay byte-identical (AC 3). See Open Questions about its stale comment |

## Tasks

Execute in order. `/implement` applies the prototype patch before Task 1.

### Task 1: Reproduce red on HEAD, then green with the patch

- **File**: `scratch-218-check.ts` (project root, temporary)
- **Action**: CHECK
- **Implement**: The red run needs the code without the fix. Take it from a detached worktree of `e6ee0cb` (`git worktree add --detach <scratch>/base e6ee0cb`, then link `node_modules` into it), copy the script from **Validation** into that worktree's root, and run it there: it must exit 1 with `FAIL two same-shape bands stay two nodes`. Remove that worktree. Then, in the patched repository, create the same script at the project root, run it, and expect exit 0 with seven `ok` lines. Run `npm run eval` and expect all four sites at 100% and `✓ all gates passed`. Delete `scratch-218-check.ts` and confirm it is gone with `git status -s`.
- **Mirror**: `AGENTS.md`, "Manually verifying extraction changes" (run scratch scripts with `npx tsx` from the project root, then delete them)
- **Validate**: `npx tsx scratch-218-check.ts && npm run eval`

### Task 2: Correct the section-digest comments

- **File**: `lib/extract/structure/sections.ts`
- **Action**: UPDATE
- **Implement**:
  1. Line 7: replace `A collapsed repeated group like \`SectionCard ×7\` stays **one** entry.` with a sentence saying that a band is never collapsed (Stage 5 exempts it), and that a repeated group inside a band reads as one `×N` item of `contents`.
  2. Lines 153-154: say that `findDigestBands` is the single source for Stage 5's exemption, Stage 9 and the Stage 7 AI prompt.
  3. Leave the `band.instanceCount` branch at lines 185-187 and the one at `structureAI.ts:94-96` as they are (see Open Questions).
- **Mirror**: `lib/extract/structure/sections.ts:148-155` (comment style)
- **Validate**: `npm run typecheck && npm run lint`

### Task 3: Document the Stage 5 contract

- **File**: `docs/architecture/structure-lane.md`
- **Action**: UPDATE
- **Implement**:
  1. Line 7: change "Two of these stages carry non-obvious contracts" to "Three…".
  2. Before the Stage 9 bullet, add a **Stage 5 (`repetition.ts`)** bullet. It says that siblings with the same `getBaseSignature` (the tag plus the first five child tags) collapse to one `×N` node. It says that the bands `findDigestBands` reports are exempt, so two sections sharing a shape stay two sections and a band never carries `instanceCount`. It says that a tag-only signature cannot tell same-shape sections apart, which is why bands are exempted rather than the signature deepened. It says that the exemption runs inside `detectRepetition`, so the secondary-viewport derivations in Stage 7b get it too.
  3. Stage 9 bullet, line 10: "used by *both* Stage 9 and the Stage 7 AI prompt" becomes Stage 5, Stage 9 and the Stage 7 prompt.
- **Mirror**: the Stage 4b bullet at `docs/architecture/structure-lane.md:9` (bold stage label, the contract, then why it must hold on the secondary viewports)
- **Validate**: `grep -n "Stage 5 (\`repetition.ts\`)" docs/architecture/structure-lane.md`

### Task 4: Drop the stale eval note

- **File**: `docs/architecture/eval.md`
- **Action**: UPDATE
- **Implement**: In line 3, replace "whose `expected.yaml` holds the ground truth and scores below 1.00 because Stage 5 repetition merges its features and pricing sections" with a clause saying that its `expected.yaml` holds the ground truth for its seven bands, including two sections that share one tag shape (features and pricing), which Stage 5 must keep apart. Leave the rest of the line unchanged.
- **Mirror**: the `adversarial-shell` clause in the same sentence (it states what the spec asserts and why)
- **Validate**: `grep -c "scores below 1.00" docs/architecture/eval.md` prints `0`

### Task 5: Refresh the baseline deliberately

- **File**: `eval/baseline.json`
- **Action**: UPDATE
- **Implement**: Run `UPDATE_BASELINE=1 npm run eval`. The file must show `"saas-landing": 1`, with the other three at `1`. Then run `npm run eval` without the variable and expect `✓ all gates passed`. Confirm that `git diff --stat eval/corpus/` is empty, so `expected.yaml` and `capture.json` are untouched.
- **Mirror**: `AGENTS.md`, eval workflow step 3
- **Validate**: `npm run eval && git diff --exit-code eval/corpus/`

### Task 6: Full gate

- **File**: (whole tree)
- **Action**: CHECK
- **Implement**: Confirm that no `verify.sh` server is up (`prebuild` refuses otherwise). Run `npm run check`. Then check that `git status -s` lists only the intended files: `repetition.ts`, `sections.ts`, the two docs, `baseline.json`, the plan and its patch, plus the user's own pre-existing `.agents/issues/todo-issues.md`, which must not be staged.
- **Mirror**: `AGENTS.md`, Git policy
- **Validate**: `npm run check`

## Validation

```bash
# Type check / Build
npm run typecheck
npm run build        # part of npm run check; never while verify.sh is up

# Lint
npm run lint

# Tests (the eval gate): saas-landing must read 100%, the other three 100%
npm run eval

# Reproduction: red on HEAD (exit 1, "FAIL two same-shape bands stay two nodes"), green after the fix (exit 0)
npx tsx scratch-218-check.ts

# Full CI gate
npm run check
```

`scratch-218-check.ts`. Create it at the project root, run it, then delete it:

```ts
// Scratch check for #218: run from the project root with `npx tsx scratch-218-check.ts`, then delete it.
import { detectRepetition } from "@/lib/extract/structure/repetition";
import type { PrunedNode } from "@/lib/extract/structureSchema";

let nextId = 0;
function n(tagName: string, children: PrunedNode[] = [], landmark: string | null = null): PrunedNode {
  return {
    id: `n${nextId++}`, tagName, ariaRole: null, landmark, hasText: children.length === 0,
    isImageOrSvg: false, isInteractive: false, signature: "", provisionalType: "container",
    componentName: tagName, children,
  };
}
const card = (extra: string[] = []) => n("div", [n("h3"), n("p"), ...extra.map((t) => n(t))]);
// Two "feature row" sections with the same tag shape at every depth (different text only),
// then a card grid and an FAQ list, inside a page with header/main/footer.
const featureRow = () => n("section", [n("div", [n("h2"), n("p")]), n("img")], "section");
const page = n("div", [
  n("header", [n("a"), n("nav", [n("a"), n("a"), n("a")], "nav")], "header"),
  n("main", [
    featureRow(),
    featureRow(),
    n("section", [n("h2"), n("div", [card(), card(), card(), card()])], "section"),
    n("section", [n("h2"), n("div", [n("details", [n("summary"), n("p")]), n("details", [n("summary"), n("p")])])], "section"),
  ], "main"),
  n("footer", [n("div", [n("strong"), n("a")]), n("div", [n("strong"), n("a")])], "footer"),
]);
// A page with no <main>: no digest bands, so its same-shape siblings still collapse as before.
const noMain = n("div", [featureRow(), featureRow()]);

const out = detectRepetition(page);
const main = out.children[1];
const grid = main.children[2]?.children[1];
const faq = main.children[3]?.children[1];
const footer = out.children[2];
const checks: Array<[string, boolean]> = [
  ["two same-shape bands stay two nodes", main.children.length === 4 && !main.children[0].instanceCount && !main.children[1].instanceCount],
  ["no band carries a varianceNote", main.children.every((b) => !b.varianceNote)],
  ["card grid still collapses to ×4", grid?.children.length === 1 && grid.children[0].instanceCount === 4],
  ["FAQ details still collapse to ×2", faq?.children.length === 1 && faq.children[0].instanceCount === 2],
  ["nav links still collapse to ×3", out.children[0].children[1].children[0].instanceCount === 3],
  ["footer columns still collapse to ×2", footer.children.length === 1 && footer.children[0].instanceCount === 2],
  ["no-main page keeps today's collapse", detectRepetition(noMain).children.length === 1],
];
let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
```

Recorded outcomes (2026-11-02):

- HEAD: lines 1, 3 and 4 `FAIL`, exit 1. Lines 3 and 4 fail only because the merged band shifts the indices.
- Prototype: all seven lines `ok`, exit 0.

## End-to-End Verification

This proves the fix through the real UI and `/api/analyze` on a live render of the fixture, beyond the frozen capture that eval replays. AI lane off by default. Nothing reaches a model provider, and no outside service is called (the fixture server is local).

1. `.claude/skills/verify/scripts/verify.sh up`, then `verify.sh doctor`. Expect no `FAIL`, and note the `head` value (`-dirty` is expected with the uncommitted change).
2. `verify.sh drive analyze-url --target saas-landing`. Expect every check `ok`, exit 0.
3. In the new `$RUN_DIR/evidence/analyze-url-<HHMMSS>/`:
   - `jq -r '.structureReport.machineBlock.sections | map(.name + (if .instances then " ×\(.instances)" else "" end)) | join(", ")' response.json` prints `SiteHeader, Hero, GridSection, Section, Section, Section, SiteFooter`, with no `×2` on any band.
   - `structure.md` lists both a features `Section` (`CardGrid` → `SectionCard ×6`) and a pricing `Section` (`CardGrid` → `SectionCard ×3`) under `MainContent`. Its page-sections digest numbers seven bands, with the FAQ `Section` at 6 and `SiteFooter` at 7.
   - The pricing band's digest entry carries a `responsive:` line for `CardGrid` (390px / 768px / 1440px), which shows that Stage 7b still aligns the trees.
   - `console-errors.txt` is empty.
4. `verify.sh down`, always, and before Task 6's `npm run check`.

If the live render differs from the committed capture (for example the consent pass leaves the banner), record that difference rather than changing the fixture. The eval gate stays the scored proof.

## Risks

| Risk | Mitigation | Scope |
|------|------------|-------|
| A page whose bands really are one repeated component directly under `<main>` (a blog index of `<article>` ×N, three identical feature rows) now lists N digest entries instead of one `×N` | This is what AC 1 asks for: sections that share a shape stay separate. Each entry is still measured, nothing is guessed. Document it in the Stage 5 bullet (Task 3) | In scope (documented, accepted) |
| A page with no identifiable `<main>` keeps today's collapse in the skeleton, because `findDigestBands` returns `[]` | Such a page has no digest at all (`sections.ts:156-160`). The scratch check pins the unchanged behavior | Out of scope; flag only |
| Footer columns (and any same-shape siblings outside `main`, or nested deeper than `main`'s direct children) still collapse | AC 2 treats them as one component. The issue names footer columns only as a side effect of the rejected alternative | Out of scope |
| Stage 5 finds `main` on the pre-ontology tree (tag/landmark), Stage 9 on the post-AI tree (tag/landmark or a `MainContent` name). A model could name some other earlier node `MainContent` on a page without a `<main>` tag | `findBand` checks the tag/landmark predicate first and walks in pre-order, so both stages resolve the same node whenever a `<main>` exists. The divergence needs an AI rename on a page without `<main>`, and the worst case is today's behavior for that page | Out of scope; flag only |
| `band.instanceCount` branches (`sections.ts:185-187`, `structureAI.ts:94-96`) become unreachable, so `sections[].instances` is never emitted | See Open Questions. The default keeps the optional schema field and the branches, so the frontmatter contract does not change | In scope (decision recorded) |
| Responsive diff misalignment | The exemption lives inside `detectRepetition`, so `typeSecondary` (`responsive.ts:80`) gets it per harvest. Measured: the pricing band's responsive line appears for 390 and 768 | In scope (verified) |
| `contentMaxWidth` changes for `saas-landing` (720 → 1104) | It is more accurate, not scored, and comes from the band that was missing (Summary) | In scope (expected) |
| Running `npm run check` while `verify.sh` is up | `prebuild` (`scripts/guard-build.mjs`) refuses. Run `verify.sh down` first | In scope |

## Open Questions

1. **What happens to the now-unreachable band `instances`?** `sectionDigestSchema.instances` (`lib/extract/structureSchema.ts:58`) is part of the frontmatter contract, and `expectedSectionEntrySchema.instances` (`eval/scoreStructure.ts:6`) is part of the eval spec contract. With bands exempt, no URL-path band carries `instanceCount`, and the image path builds no digest. **Proposed default:** keep the schema field, the two reader branches and `formatSectionDigests`'s `×N` rendering unchanged in this bug fix. Optional fields are omitted when absent, so nothing that reads the contract breaks. Only correct the comment that claims a band can be a collapsed group (Task 2). Removing the field would change the written contract, and that belongs in its own issue if the owner wants it.
2. **The stale defect note in `expected.yaml`.** `eval/corpus/saas-landing/expected.yaml:8-15` says that this spec "scores below 1.00 on purpose" because Stage 5 collapses the two sections. AC 3 requires the file to stay unchanged. **Proposed default:** leave it byte-identical, as the AC says, and let the owner reword the comment (it is not spec data) in a follow-up or in the PR review. The data lines would stay untouched either way.

## Acceptance Criteria

- [ ] All tasks completed
- [ ] Two sibling page sections with the same tag shape but different content stay two nodes in the skeleton and two digest entries (scratch check line 1; `saas-landing` ordinals 4–5)
- [ ] Card grids, logo clouds, FAQ `details`, nav links and footer columns still collapse to `×N` (scratch check lines 3–6; the other three fixtures produce byte-identical reports)
- [ ] `saas-landing` scores 100% in `npm run eval`, its `expected.yaml` is unchanged, and `eval/baseline.json` reads `"saas-landing": 1`
- [ ] `clean-light`, `dark-mode` and `adversarial-shell` stay at 100%
- [ ] The responsive diff still aligns: the pricing band carries a `CardGrid` responsive line
- [ ] Type check passes (`npm run typecheck`)
- [ ] `npm run check` passes
- [ ] Follows existing patterns (shared `findDigestBands`, id-keyed band identity, terse comments)
- [ ] `TODO.md` and `.agents/issues/todo-issues.md` are not edited by this change (the TODO tick belongs to the TODO workflow)
