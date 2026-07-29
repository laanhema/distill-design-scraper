# Stories — PRD §12 Phase 8: Heuristic-Invariant Audit

**Source:** `.agents/PRDs/PRD.md` §12 Phase 8 (2026-07-29 second full-codebase sweep), plus the two unchecked §11 functional-requirement lines that trace to Phase 8 / P0-1 and P0-2.
**Generated:** 2026-07-29
**Repository:** `laanhema/distill-design-scraper`
**Baseline commit:** `d619f19`
**Story ID range:** DIST-062 → DIST-077 (continues from DIST-061 / issue #109)

Every finding below was **re-verified against the code at `d619f19`** before a story was written for it — line numbers, predicates, and duplicate bodies were read in the tree, not taken from the PRD text. Verification notes are inline in each story's Technical Notes.

Phase ordering follows the PRD's own P0 → P1 → P2 → P3 priority grouping rather than implementation phases, with **one deliberate inversion**: DIST-062 (the adversarial eval fixture, PRD P1-1) ships **first**, because §12 Phase 8's own validation note says *"P1-1 gates the rest: land the adversarial fixture first, so P0-1's fix is verified by the harness rather than by hand."*

---

## Created GitHub issues

| Issue | Story | PRD item | Title | Labels | Priority | Complexity |
|---|---|---|---|---|---|---|
| [#124](https://github.com/laanhema/distill-design-scraper/issues/124) | DIST-062 | P1-1 | Add an adversarially-shaped eval fixture that breaks the structural proxies | `technical` `eval` `tooling` | **High** | Large |
| [#125](https://github.com/laanhema/distill-design-scraper/issues/125) | DIST-063 | P0-1 | Type structure regions by landmark identity, not by tree depth | `bug` `structure-lane` `extraction` | **High** | Medium |
| [#126](https://github.com/laanhema/distill-design-scraper/issues/126) | DIST-064 | P0-2 | Never assign an evidence-gated semantic role by displacement | `bug` `ai-lane` `palette` | **High** | Small |
| [#127](https://github.com/laanhema/distill-design-scraper/issues/127) | DIST-065 | P1-2 | Populate `Capture.viewport` in `eval/capture.ts` and refresh the fixtures | `technical` `eval` `structure-lane` | Medium | Medium |
| [#128](https://github.com/laanhema/distill-design-scraper/issues/128) | DIST-066 | P2-1a | Unify the band-segment regex and `structuralPart` behind one seam | `technical` `structure-lane` `cleanup` | Medium | Small |
| [#129](https://github.com/laanhema/distill-design-scraper/issues/129) | DIST-067 | P2-1b | Unify the two `nearestScaleValue` copies | `technical` `structure-lane` `cleanup` | Low | Small |
| [#130](https://github.com/laanhema/distill-design-scraper/issues/130) | DIST-068 | P2-1c | Unify the two `mode<T>` copies without moving measured output | `technical` `extraction` `cleanup` | Low | Small |
| [#131](https://github.com/laanhema/distill-design-scraper/issues/131) | DIST-069 | P2-1d | Unify `parsePositiveNumber` / `parsePositiveInteger` | `technical` `cleanup` | Low | Small |
| [#132](https://github.com/laanhema/distill-design-scraper/issues/132) | DIST-070 | P2-2 | Remove the unreachable landmark-preservation branch in the pruner | `technical` `structure-lane` `cleanup` | Low | Small |
| [#133](https://github.com/laanhema/distill-design-scraper/issues/133) | DIST-071 | P2-4 | Move `emitTailwindTheme` out of `lib/emit.ts` so `js-yaml` leaves the client bundle | `enhancement` `frontend` `performance` | Medium | Small |
| [#134](https://github.com/laanhema/distill-design-scraper/issues/134) | DIST-072 | P2-5 | Join `computeContentMaxWidth` on landmark identity, not a post-AI-rename name | `bug` `structure-lane` | Medium | Small |
| [#135](https://github.com/laanhema/distill-design-scraper/issues/135) | DIST-073 | P2-6 | Resolve the ten exports that have no importer | `technical` `cleanup` | Low | Small |
| [#136](https://github.com/laanhema/distill-design-scraper/issues/136) | DIST-074 | P3-1 | Stop double-counting above-the-fold pixels in palette area weights | `bug` `extraction` `palette` | Low | Small |
| [#137](https://github.com/laanhema/distill-design-scraper/issues/137) | DIST-075 | P3-2 | Emit a `prefers-color-scheme: dark` block from `renderCssVariables` | `enhancement` `emit` | Low | Small |
| [#138](https://github.com/laanhema/distill-design-scraper/issues/138) | DIST-076 | P3-3 | Skip the AI interpretation lane on `mode: "structure"` URL runs | `enhancement` `ai-lane` `performance` | Low | Small |
| [#139](https://github.com/laanhema/distill-design-scraper/issues/139) | DIST-077 | P3-4 | Omit `text` rather than duplicating the background hex on single-cluster images | `bug` `extraction` `palette` | Low | Small |

**Repository:** `laanhema/distill-design-scraper` · **Milestone:** none (consistent with DIST-001 → DIST-061)

Each issue body carries the description, verified context (with quoted code and line numbers), acceptance criteria, and dependencies; Technical Notes were added as the first comment on each.

---

## Accepted as-is — no story created

| PRD item | Finding | Why no story |
|---|---|---|
| **P2-3** | No global concurrency ceiling on Chromium (`lib/ingest.ts:346` launches a browser per request; bounded per client, unbounded in aggregate) | The PRD explicitly accepts this: *"Consistent with §9's 'auth is the deployer's responsibility' posture… Documented in §9 as of this sweep; a semaphore in `renderUrl` is the code-level fix if it ever binds."* §9's Out-of-scope list already names it. The documentation half is **already shipped** — verified in §9 at `d619f19` — so the checkbox can be ticked without code. **Revisit trigger:** a deployment where the API is fronted by auth and still sees concurrent-render memory pressure; the fix is then a semaphore in `renderUrl`, not a new abstraction. |

---

## Ordering & dependency graph

```
GATE  DIST-062 #124  adversarial eval fixture                 (P1-1)  ── blocks ──┐
                                                                                  │
P0    DIST-063 #125  region typing by landmark, not depth     (P0-1)  ◀───────────┤
      DIST-064 #126  no semantic role by displacement         (P0-2)              │
                                                                                  │
P1    DIST-065 #127  Capture.viewport on the eval path        (P1-2)              │
                                                                                  │
P2    DIST-066 #128  band-segment regex / structuralPart      (P2-1a) ◀───────────┘ (verified by)
      DIST-067 #129  nearestScaleValue dedup                  (P2-1b)
      DIST-068 #130  mode<T> dedup                            (P2-1c)
      DIST-069 #131  parsePositive* dedup                     (P2-1d)
      DIST-070 #132  pruner dead branch                       (P2-2)
      DIST-071 #133  emitTailwindTheme out of emit.ts         (P2-4)
      DIST-072 #134  computeContentMaxWidth landmark join     (P2-5)
      DIST-073 #135  ten importer-less exports                (P2-6)

P3    DIST-074 #136  panorama-only area weights               (P3-1)
      DIST-075 #137  dark block in renderCssVariables         (P3-2)
      DIST-076 #138  skip interpret lane on structure-only    (P3-3)
      DIST-077 #139  single-cluster image text role           (P3-4)
```

**Soft sequencing (not hard blocks):** #133 before #137 (same file, `lib/emit.ts`); #124 before #127 (avoid a double recapture); #125 before #134 (reuse the shared landmark predicate); #125 before #132 (re-verify pruner reachability).

**Baseline policy for the whole set** (from §12 Phase 8 Validation + §14):

- **DIST-066 through DIST-077 must pass `npm run eval` with `eval/baseline.json` untouched.** All are dedup, removal, or non-measured-lane changes — *any* score movement means the change leaked into measured extraction and must be investigated, **not** baselined away. DIST-074 is the one P3 that legitimately nudges a measured value (0.001 on `clean-light`); if the rounded score moves, refresh the baseline deliberately in the same PR with the delta quoted in the description.
- **DIST-062, DIST-063, and DIST-065 legitimately change measured output** (a new fixture; restored region names/annotations on wrapper-shaped pages; a capture-shape change). Each refreshes fixtures and bumps `eval/baseline.json` **in the same PR**, per the §14 policy.
- **DIST-064 must be proven by the PRD's reproduction** — a keyless check that a displaced non-refinable role is dropped rather than reassigned.

---

# GATE

## [DIST-062] Add an adversarially-shaped eval fixture that breaks the structural proxies

**Type**: Technical
**GitHub Label**: `technical`
**Priority**: High
**Complexity**: Large
**Phase**: PRD §12 Phase 8 / P1-1 (carried forward from Phase 7 / P3-1)
**Labels**: `technical`, `eval`, `tooling`

### Description

As a **maintainer**, I want at least one eval fixture whose DOM deliberately violates the structural shortcuts the extractors rely on, so that heuristics gated on positional proxies fail loudly in CI instead of silently degrading on real sites.

### Context

Both committed fixtures score **exactly 1.00** and `eval/baseline.json` is `{"clean-light": 1, "dark-mode": 1}` — verified at `d619f19`. The gate is therefore regression-only: there is no headroom to confirm a heuristic change *helped*, only that it didn't hurt two hand-authored pages with textbook `<body> → header/main/footer` structure. Compounding it: `forceHeuristicNaming: true` means Stage 7's AI path, `sectionDescriptions`, and the AI merge in `runStructureAILabeller` are exercised by **no** automated check; neither capture carries `motion`/`keyframes` or a cross-origin stylesheet; and `stripe`/`linear`/`vercel` have been `optional: true` since the corpus was created.

Both Phase-7 P0s and both Phase-8 P0s were invisible to this gate **by construction**. That is now a repeated result, not an incidental one. The PRD names this the cheapest high-value fix in the backlog: the fixture below would have caught P0-1 and P2-5 outright, and would turn a future `structuralPart` divergence (P2-1a) into a failing score rather than a silent one.

### Acceptance Criteria

- [ ] Given a new fixture page under `eval/fixtures/`, when it is authored, then its DOM contains **all** of: a root wrapper `<div>` **with at least one sibling** (portal root, toast container, or skip link) so Stage 4b squash cannot absorb it; at least one `<div>`-based page section (no `<section>` tag); a landmark nested below depth 1; a declared `transition` on a recognized recipe element class; and a CSSOM `:hover` rule.
- [ ] Given the new fixture, when `npm run eval:capture` runs, then `eval/corpus/<slug>/capture.json` is produced and committed, and `eval/corpus.ts` registers the entry **without** `optional: true`.
- [ ] Given the committed capture, when a hand-authored `eval/corpus/<slug>/expected.yaml` is written, then it asserts the *correct* (post-DIST-063) region names — `SiteHeader` / `MainContent` / `SiteFooter` — and their band annotations, so the fixture **fails** on `main` at `d619f19` and passes only once DIST-063 lands.
- [ ] Given the new entry, when `npm run eval` runs, then the fixture is scored on both lanes (palette/typography **and** structure), its score is recorded in `eval/baseline.json`, and the run is still fully offline (no browser, no network, no API key).
- [ ] Given the fixture's declared `transition` and `:hover` rule, when the capture is replayed, then `motion` and `states` are populated in the extracted report — closing the "no fixture exercises these lanes" gap for the two Phase-6 lanes.
- [ ] Given the score is below 1.00, when it is committed to the baseline, then the PR description states the score and why it is not 1.00, so the corpus retains detectable headroom in **both** directions.

### Technical Notes

- Verified at `d619f19`: `eval/baseline.json` is exactly `{"clean-light": 1, "dark-mode": 1}`.
- `eval/capture.ts` drives Playwright directly (`chromium.launch` + `page.goto`) rather than going through `renderUrl`, deliberately, so the SSRF guard doesn't block capturing from a `localhost` fixture server. Follow that existing pattern — do **not** route the new fixture through `renderUrl`.
- Land `viewport: VIEWPORT` (DIST-065) in the same capture literal if DIST-065 hasn't merged yet, so this fixture isn't captured twice.
- The structure lane is scored via `eval/scoreStructure.ts` (section-digest order/names/instance counts, region names against `skeletonAscii`, component-map counts) and a structure-lane exception scores `0`, never "skipped" — so a fixture that crashes the lane cannot leave the gate green.
- **Do not** attempt to un-force `forceHeuristicNaming` for this fixture. Eval must stay deterministic and offline; the AI-naming gap is a separate, acknowledged posture, and `npm run eval:ai` is its (weaker) counterpart.
- Files: `eval/fixtures/`, `eval/corpus.ts`, `eval/corpus/<slug>/{capture.json,expected.yaml}`, `eval/baseline.json`.

### Dependencies

- Blocked by: —
- Blocks: **DIST-063** (its fix must be verified by the harness, not by hand); usefully precedes **DIST-066** (turns a `structuralPart` divergence into a failing score) and **DIST-072**.

---

# P0 — Invariant defects

## [DIST-063] Type structure regions by landmark identity, not by tree depth

**Type**: Bug
**GitHub Label**: `bug`
**Priority**: High
**Complexity**: Medium
**Phase**: PRD §12 Phase 8 / P0-1 (also closes the unchecked §11 line *"Structure names are stable under realistic DOM shapes"*)
**Labels**: `bug`, `structure-lane`, `extraction`

### Description

As an **agency builder**, I want the page skeleton to keep its transferable region vocabulary (`SiteHeader` / `MainContent` / `Navbar` / `SiteFooter`) and band annotations on any real-world page shape, so that a single stray wrapper `<div>` doesn't silently downgrade my rebuild spec to generic names.

### Context

`lib/extract/structure/ontology.ts:24` gates `provisionalType: "region"` — and with it the transferable names **and** the `h Npx` band annotation that Stage 8a later refines into `padY` / `h 100vh` — on `depth <= 1`. Verified in the tree at `d619f19`:

```ts
if (
  depth <= 1 &&
  (node.landmark || (node.tagName && ["header", "nav", "main", "footer"].includes(node.tagName)))
) {
  provisionalType = "region";
```

Stage 4b squash normally flattens the `<body> → <div id="__next"> → header/main/footer` shape every React/Next app produces, which is why the fixtures pass. But `squashWrapperChains` absorbs a child only when it is an **only child** — verified at `squash.ts:40`, `while (current.children.length === 1 && isGenericLayoutContainer(current.children[0]))`. Add one sibling — a portal root, a toast container, a skip link — and the wrapper survives, every landmark drops to depth 2, and region typing never fires.

Reproduced offline against `clean-light` (PRD §12 Phase 8):

```
baseline / single wrapper:   SiteHeader | Hero | CardGrid | SiteFooter
wrapper + one sibling:       Header     | Hero | CardGrid | Footer
```

Three things degrade at once:

1. Names fall back to `capitalize(landmark)`, losing exactly the vocabulary §5 story 6 and the vision lane's prompt are written around.
2. `SiteHeader [padY 25px]` and `MainContent [h 100vh]` lose their annotations entirely, since Stage 8a only rewrites `region` nodes.
3. The surviving wrapper is itself misnamed **`Hero`** (a `<div>` containing an `h1` near the top) and adopts the real page bands as its children.

The section digest still *finds* the bands — `sections.ts:findBand` correctly keys off landmark/tag with `componentName` only as a fallback — but reports the degraded names, so a real-site `expectedSections`/`expectedRegions` spec would fail.

### Acceptance Criteria

- [ ] Given a harvest whose landmarks sit at depth 2 behind an unsquashable wrapper, when the structure lane runs, then the header/main/footer nodes are typed `region` and named `SiteHeader` / `MainContent` / `SiteFooter` — matching the depth-1 baseline output exactly.
- [ ] Given the same harvest, when Stage 8a annotates, then those regions carry their band annotations (`padY …`, `h 100vh`, `sticky`) rather than dropping them.
- [ ] Given the depth-0 root, when it is typed, then it is still named `Page` and never adopts a landmark-specific or hero name — the existing `depth > 0` guard behavior is preserved.
- [ ] Given a landmark nested deep inside content (e.g. a `<nav>` inside a card), when it is typed, then it does not spuriously become a top-level page band — the fix gates on landmark *identity*, not on removing the constraint entirely.
- [ ] Given DIST-062's adversarial fixture, when `npm run eval` runs, then the fixture's structure score reaches its expected value, and the change is proven by the harness rather than by a scratch script.
- [ ] Given the score legitimately moves, when the PR lands, then `eval/baseline.json` is refreshed **in the same PR** with the delta explained in the description.

### Technical Notes

- **`findBand` in `sections.ts` already demonstrates the correct predicate in this same codebase** — it keys off landmark/tag with `componentName` only as a fallback. Reuse that shape rather than inventing a third predicate; this is a §6 "one seam per concern" opportunity, not just a bug fix.
- `depth <= 1` is a proxy for "this node is a page band" that squash only *sometimes* makes true. Replace the proxy with the identity being tested. Keep `insideFooter` threading and the `depth > 0` root guard intact — both encode separate, still-correct intent.
- Consider whether the *misnaming* of the surviving wrapper as `Hero` needs a separate guard, or falls out of the fix once the real bands are typed as regions. Document whichever it is in the PR.
- This is the fix §14's new risk row was written for: *"Gate on the identity being tested (landmark), never on a positional proxy for it."*
- Files: `lib/extract/structure/ontology.ts` (primary), possibly `lib/extract/structure/regionMetrics.ts` (Stage 8a's `region`-only rewrite), `eval/baseline.json`.

### Dependencies

- Blocked by: **DIST-062** (land the adversarial fixture first so the harness verifies this)
- Blocks: —

---

## [DIST-064] Never assign an evidence-gated semantic role by displacement

**Type**: Bug
**GitHub Label**: `bug`
**Priority**: High
**Complexity**: Small
**Phase**: PRD §12 Phase 8 / P0-2 (also closes the unchecked §11 line *"The AI lane can never assign an evidence-gated role"*)
**Labels**: `bug`, `ai-lane`, `palette`

### Description

As a **frontend developer**, I want a swatch labelled `danger` to actually have danger evidence behind it, so that a palette stamped `provenance: "measured"` never hands me a synthesized semantic role.

### Context

`lib/schema.ts:41` states semantic states are *"assigned only on strong evidence (hue band + usage context — an alert/status role or an aria-invalid element), never synthesized from `primary`,"* and `assignRoles` honours that: `semanticScore` returns 0 without a `semanticContext` node.

The AI lane's **proposals** are correctly constrained — `roleRefinements.role` is typed to `REFINABLE_COLOR_ROLES`, deliberately excluding `success`/`warning`/`danger`/`on-primary`. But `applyRoleRefinements` implements a refinement as a **swap**. Verified in the tree at `lib/interpret.ts:246-250`:

```ts
const from = target.role;
const holder = colors.find((c) => c !== target && c.role === role);
if (holder) relabel(from, holder); // swap the displaced role onto the holder
relabel(role, target);
```

`from` is the *target's previous role*, which is **unconstrained**. Reproduced (PRD §12 Phase 8):

```
input:   #1a73e8 = primary,  #d92d20 = danger
AI says: #d92d20 should be primary          (a legal, in-enum proposal)
output:  #d92d20 = primary,  #1a73e8 = danger  ("error/destructive state")
```

`#1a73e8` has no `alert` / `aria-invalid` evidence anywhere in the dump, yet ships as `danger` with `ROLE_USAGE["danger"]` attached, inside a palette still stamped `provenance: "measured"`. This is precisely the synthesis §2 principle 1 forbids, reached indirectly.

A **second, independent defect** sits two lines above: `colors.find((c) => c.hex.toLowerCase() === hex.toLowerCase())` matches the *first* swatch with that hex — verified at `lib/interpret.ts:241-243`. Duplicate hexes across roles are common (`on-primary` = `background` = `#ffffff`), so a refinement can relabel the wrong swatch.

### Acceptance Criteria

- [ ] Given a refinement whose target currently holds a role **outside** `REFINABLE_COLOR_ROLES` (`success`/`warning`/`danger`/`on-primary`), when it is applied, then the displaced role is **dropped** — the holder becomes role-less — rather than being reassigned to the holder.
- [ ] Given the PRD's exact reproduction (`#1a73e8 = primary`, `#d92d20 = danger`, AI proposes `#d92d20 → primary`), when `applyRoleRefinements` runs, then `#1a73e8` does **not** end up labelled `danger`, and no swatch gains `ROLE_USAGE["danger"]` without evidence.
- [ ] Given a refinement whose target currently holds a role **inside** `REFINABLE_COLOR_ROLES`, when it is applied, then the existing swap behavior is unchanged — this story narrows the write path, it does not disable refinement.
- [ ] Given a palette where two swatches share a hex under different roles, when a refinement names that hex, then the correct swatch is targeted (or the ambiguous refinement is skipped) rather than the first array match being silently taken.
- [ ] Given a role-less swatch results from a dropped displacement, when the report is emitted, then it degrades honestly — no fabricated role name, no fabricated `usage` line — and `renderPalette` / the CSS-variables block handle it without emitting an empty or malformed entry.
- [ ] Given the fix, when `npm run eval` runs, then it passes with `eval/baseline.json` **untouched** (the eval path never calls the AI lane).

### Technical Notes

- **Prove this with the reproduction, not by inspection.** The PRD's validation note is explicit: *"P0-2 must be proven by the reproduction above — a keyless unit-style check that a displaced non-refinable role is dropped rather than reassigned."* There is no unit-test framework, so the established pattern is a scratch script run via `npx tsx` **from the project root**, calling `applyRoleRefinements` directly with a two-swatch palette. Quote the before/after output in the PR description, then delete the script.
- `applyRoleRefinements` already clones (`palette.colors.map((c) => ({ ...c }))`) so the measured palette is never mutated in place — preserve that.
- The trailing sort uses `order.get(a.role) ?? 99`, so a role-less swatch already sorts last; confirm the `?? 99` path still behaves once a swatch can legitimately have no role.
- This is the fix §14's new risk row was written for: *"When a constraint protects an invariant, constrain every write path to the field — not just the one the model drives. Audit permutation/swap logic specifically: it moves values the caller never named."*
- Files: `lib/interpret.ts` (primary), `lib/schema.ts` (only if the role type must admit "none"), `lib/emit.ts` (role-less rendering).

### Dependencies

- Blocked by: —
- Blocks: —

---

# P1 — Gate coverage

## [DIST-065] Populate `Capture.viewport` in `eval/capture.ts` and refresh the fixtures

**Type**: Technical
**GitHub Label**: `technical`
**Priority**: Medium
**Complexity**: Medium
**Phase**: PRD §12 Phase 8 / P1-2 (carried forward from Phase 7 / P3-2, partially closed by DIST-061)
**Labels**: `technical`, `eval`, `structure-lane`

### Description

As a **maintainer**, I want committed eval captures to carry the viewport they were captured at, so that the coupling DIST-061 existed to remove is actually removed on the eval path too.

### Context

DIST-061 added `Capture.viewport` and wired `extractStructureFromCapture` to forward it. But `eval/capture.ts` constructs its `Capture` literal by hand and omits the field. Verified at `d619f19`:

- `eval/capture.ts:19` defines `const VIEWPORT = { width: 1440, height: 900 }` and passes it to the Playwright context at line 30 — but the `Capture` literal (around line 53) never sets `viewport`.
- Neither committed capture has a top-level `viewport` key: `Object.keys(clean-light/capture.json)` → `source, finalUrl, title, styleDump, viewportShot, rawHarvestNode, responsiveHarvests, darkCapture, scrollShots, panoramaShot`.

Every eval structure replay therefore silently takes `extractStructure`'s hardcoded `{1440, 900}` default — which *happens* to match `eval/capture.ts`'s own `VIEWPORT`, so nothing fails today, **and nothing would fail if that constant ever changed either**. The story is marked done; the coupling it existed to remove is still live on the eval path.

### Acceptance Criteria

- [ ] Given `eval/capture.ts`, when it builds a `Capture`, then it sets `viewport: VIEWPORT` from the same constant it passes to the Playwright context — one source, no second literal.
- [ ] Given the change, when `npm run eval:capture` re-runs, then both committed `capture.json` files carry a top-level `viewport` key with `{ width: 1440, height: 900 }`.
- [ ] Given a replayed capture, when `extractStructureFromCapture` runs, then it consumes the capture's `viewport` rather than falling through to `extractStructure`'s hardcoded default — verifiable by temporarily changing `VIEWPORT` and observing `regionMetrics` output move.
- [ ] Given this is a capture-shape change, when the PR lands, then **both fixtures are refreshed and `eval/baseline.json` is bumped in the same PR**, per the §14 policy — never as a follow-up.
- [ ] Given a legacy capture without `viewport`, when it is replayed, then the lane still falls back cleanly rather than throwing — an absent field remains "nothing observed."

### Technical Notes

- Verified: `extractStructure`'s default lives at `lib/extract/structure/index.ts:44`.
- Coordinate with **DIST-062**: if the adversarial fixture hasn't landed yet, capture it with `viewport` already set so it isn't recaptured twice. If DIST-062 lands first, this PR refreshes three fixtures, not two.
- This is a genuine capture-shape change — the third in the project's history, after the responsive-harvest/dark-scheme pass and the full-page panorama pass. Follow the same PR discipline those did.
- Files: `eval/capture.ts`, `eval/corpus/*/capture.json`, `eval/baseline.json`.

### Dependencies

- Blocked by: —
- Blocks: — *(coordinate with DIST-062 to avoid a double recapture)*

---

# P2 — Duplication, dead code, and drift

> §6 "one seam per concern" is the principle `roleMatch.ts` and `styleMatch.ts` exist to enforce, and whose violation was the **root cause** of Phase 7 / P0-2. DIST-066 → DIST-069 are the four helper pairs the Phase-8 sweep found; they are split into separate stories because they carry materially different risk, and the highest-risk one is worth reviewing alone.

## [DIST-066] Unify the band-segment regex and `structuralPart` behind one seam

**Type**: Technical
**GitHub Label**: `technical`
**Priority**: Medium
**Complexity**: Small
**Phase**: PRD §12 Phase 8 / P2-1 (row 1 — *highest risk*)
**Labels**: `technical`, `structure-lane`, `cleanup`

### Description

As a **maintainer**, I want the section digest and the responsive diff to split a layout annotation through **one** shared helper, so that adding a band segment can't silently desynchronize the two consumers.

### Context

Verified byte-identical regexes under two different constant names at `d619f19`:

```
sections.ts:19    const BAND_SEGMENT           = /^(sticky|fixed|h \d+px|h 100vh|padY \d+px)$/;
responsive.ts:23  const NON_STRUCTURAL_SEGMENT = /^(sticky|fixed|h \d+px|h 100vh|padY \d+px)$/;
```

Plus two `structuralPart` functions — `sections.ts:42` and `responsive.ts:27` — splitting the same annotation string for two consumers. Adding a segment (say `padX`) to one desynchronizes the section digest from the responsive diff **silently**, exactly like `STATE_PROPS` did in Phase 7. §14's risk row names this pair as *"the live instance of the same failure mode that produced the original."*

### Acceptance Criteria

- [ ] Given the two modules, when they split a layout annotation, then both call **one** exported helper from a single module — no second regex literal, no second `structuralPart` body anywhere in `lib/extract/structure/`.
- [ ] Given the shared helper, when it is defined, then its doc comment names both consumers and states that band-vs-structural is one classification with two views, so a future reader adds a segment in one place.
- [ ] Given the dedup, when `npm run eval` runs, then it passes with `eval/baseline.json` **untouched** — this is a pure refactor and any score movement means behavior leaked.
- [ ] Given `grep -rn "sticky|fixed" lib/extract/structure/`, when run after the change, then exactly one segment-classification regex is found.

### Technical Notes

- The two `structuralPart` bodies invert the same filter — `sections.ts` keeps `BAND_SEGMENT` matches for the band field (line 38) and drops them for the structural part (line 44); `responsive.ts` only ever wants the structural part. One helper exposing both halves (`bandSegments` / `structuralPart`) covers both call sites.
- Where the seam lives: alongside the other shared structure helpers, next to `styleMatch.ts` — not inside `sections.ts` or `responsive.ts`, or the "which one is canonical" question just moves.
- **DIST-062's fixture makes this verifiable**: with an adversarial fixture in the corpus, a future divergence becomes a failing score rather than a silent one. Land after DIST-062 if scheduling allows.
- Files: `lib/extract/structure/sections.ts`, `lib/extract/structure/responsive.ts`, plus one new shared module.

### Dependencies

- Blocked by: — *(benefits from DIST-062)*
- Blocks: —

---

## [DIST-067] Unify the two `nearestScaleValue` copies

**Type**: Technical
**GitHub Label**: `technical`
**Priority**: Low
**Complexity**: Small
**Phase**: PRD §12 Phase 8 / P2-1 (row 2)
**Labels**: `technical`, `structure-lane`, `cleanup`

### Description

As a **maintainer**, I want one `nearestScaleValue` helper with an explicit tolerance parameter, so the two call sites' differing tolerances are a visible argument rather than a hidden fork.

### Context

Verified at `d619f19`: identical bodies at `lib/extract/structure/tokenLink.ts:29` and `lib/extract/structure/regionMetrics.ts:114`, differing only in their tolerance constants.

### Acceptance Criteria

- [ ] Given both modules, when they snap a value to the spacing scale, then both call one exported helper that takes tolerance as an explicit parameter.
- [ ] Given each call site, when it passes its tolerance, then the value is **unchanged** from the constant that module used before — this is a dedup, not a tolerance change.
- [ ] Given the shared helper, when it is defined, then its doc comment states why the two consumers legitimately differ (bounds-derived averages vs. exact gap matches).
- [ ] Given the dedup, when `npm run eval` runs, then it passes with `eval/baseline.json` **untouched**.

### Technical Notes

- Place it beside `styleMatch.ts` / `roleMatch.ts` — the existing home for shared matchers in this lane.
- Both consumers must keep "no match within tolerance ⇒ `null`" semantics; `tokenLink.ts` relies on that to *never guess a token that isn't in the report*.
- Files: `lib/extract/structure/tokenLink.ts`, `lib/extract/structure/regionMetrics.ts`, plus the shared module (reuse DIST-066's if it lands first).

### Dependencies

- Blocked by: —
- Blocks: —

---

## [DIST-068] Unify the two `mode<T>` copies without moving measured output

**Type**: Technical
**GitHub Label**: `technical`
**Priority**: Low
**Complexity**: Small
**Phase**: PRD §12 Phase 8 / P2-1 (row 3)
**Labels**: `technical`, `extraction`, `cleanup`

### Description

As a **maintainer**, I want one `mode<T>` with explicit tie-break semantics, so two functions with the same name can't quietly mean two different things in the lane that decides every recipe value.

### Context

Verified at `d619f19`: `lib/extract/tokens.ts:6` is `function mode<T>(values: T[]): T` and `lib/extract/typography.ts:67` is `function mode<T>(values: T[], fallback: T): T` — **different signatures and different tie-break semantics under one name**. Modal aggregation is the mechanism §6 relies on so *"one outlier instance can't skew a recipe"*; two meanings of "mode" in that lane is the kind of ambiguity that produces a wrong token nobody can trace.

### Acceptance Criteria

- [ ] Given both modules, when they take a modal value, then both call one exported helper whose signature makes the tie-break rule and the empty-input behavior explicit.
- [ ] Given each existing call site, when it is migrated, then its **observable result is identical** for every input the committed captures produce.
- [ ] Given the unified helper, when it is defined, then its doc comment states the tie-break rule explicitly (first-seen wins, highest-count wins, etc.) rather than leaving it to insertion order.
- [ ] Given the dedup, when `npm run eval` runs, then it passes with `eval/baseline.json` **untouched** — **any** score movement here means a tie-break changed and must be investigated, not baselined away.

### Technical Notes

- This is the riskiest of the four dedups precisely because the two copies **already differ**. Read both bodies fully before unifying, and pick the semantics that preserves current output at both sites — if that means the helper takes an optional `fallback`, take the optional `fallback`.
- `recipes.ts` and `states.ts` also aggregate modally; check whether either has a third inline copy before landing, so this closes the pattern rather than leaving two of three.
- Files: `lib/extract/tokens.ts`, `lib/extract/typography.ts`, plus a shared helper module.

### Dependencies

- Blocked by: —
- Blocks: —

---

## [DIST-069] Unify `parsePositiveNumber` / `parsePositiveInteger`

**Type**: Technical
**GitHub Label**: `technical`
**Priority**: Low
**Complexity**: Small
**Phase**: PRD §12 Phase 8 / P2-1 (row 4)
**Labels**: `technical`, `cleanup`

### Description

As a **maintainer**, I want one env-var parsing helper, so a fix to bounds parsing lands for both the cache and the rate limiter at once.

### Context

Verified at `d619f19`: `lib/cache.ts:42-51` and `lib/security/rateLimiter.ts:44-53` carry **identical bodies and near-identical doc comments** (both explaining the `< 1` floor rejection, differing only in whether they say "the entry cap" or "bucket capping"). Both guard bounded-resource caps — §6's *"Bounded everything"* — so a parsing bug here weakens two limits simultaneously.

### Acceptance Criteria

- [ ] Given both modules, when they read a numeric env var, then both import one shared helper pair; no duplicate body remains.
- [ ] Given each existing caller (`CACHE_MAX_ENTRIES`, `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_BUCKETS`), when it parses, then its fallback and clamping behavior is unchanged.
- [ ] Given a fractional value below 1 (e.g. `0.5`), when parsed as an integer, then the documented default is returned rather than `0` — the behavior both copies' comments describe is preserved by a check, not by assumption.
- [ ] Given the dedup, when `npm run lint` and `npm run typecheck` run, then both pass, and `npm run eval` passes with `eval/baseline.json` untouched.

### Technical Notes

- These are config helpers, not extraction helpers — put them somewhere neutral (e.g. `lib/env.ts`), not inside `lib/security/` or `lib/cache.ts`, so neither module owns the other's dependency.
- Carry the *union* of the two doc comments' intent into the shared one; don't drop the `< 1` rationale, it's the non-obvious part.
- Files: `lib/cache.ts`, `lib/security/rateLimiter.ts`, plus a shared module.

### Dependencies

- Blocked by: —
- Blocks: —

---

## [DIST-070] Remove the unreachable landmark-preservation branch in the pruner

**Type**: Technical
**GitHub Label**: `technical`
**Priority**: Low
**Complexity**: Small
**Phase**: PRD §12 Phase 8 / P2-2
**Labels**: `technical`, `structure-lane`, `cleanup`

### Description

As a **maintainer**, I want dead safety nets removed, so a future reader doesn't believe landmark preservation is already handled when it isn't.

### Context

Verified at `d619f19`: `lib/extract/structure/pruner.ts:61-63` preserves a wrapper's landmark onto its collapsed child:

```ts
if (root.landmark && !singleChild.landmark) {
  singleChild.landmark = root.landmark;
}
```

But the collapse only runs when `!isMeaningfulContainer`, and `isMeaningfulContainer` includes `Boolean(root.landmark)` (line 52). `root.landmark` is therefore **always falsy** inside the branch — it is unreachable. Harmless at runtime, but it reads as a safety net that isn't one, and **DIST-063 above is exactly a landmark-preservation failure**, so a future reader may reasonably believe this covers it.

### Acceptance Criteria

- [ ] Given `pruner.ts`, when the collapse branch runs, then no unreachable landmark-preservation code remains.
- [ ] Given the removal, when a comment is left in its place, then it states that landmark-carrying nodes are never collapsed (because `isMeaningfulContainer` includes `landmark`) — preserving the intent without the dead code, the same pattern DIST-051 used for `fullPageShot`.
- [ ] Given the change, when `npm run eval` runs, then it passes with `eval/baseline.json` **untouched** — an unreachable branch cannot change output, so any movement means the reachability analysis was wrong.

### Technical Notes

- Confirm reachability before deleting: assert that `isMeaningfulContainer` still includes `Boolean(root.landmark)` at the time of the change, and quote both lines in the PR description. If **DIST-063** alters the pruner's landmark handling, re-check this first — do not delete on the strength of this story's snapshot alone.
- Files: `lib/extract/structure/pruner.ts`.

### Dependencies

- Blocked by: — *(re-verify if DIST-063 touched the pruner)*
- Blocks: —

---

## [DIST-071] Move `emitTailwindTheme` out of `lib/emit.ts` so `js-yaml` leaves the client bundle

**Type**: Enhancement
**GitHub Label**: `enhancement`
**Priority**: Medium
**Complexity**: Small
**Phase**: PRD §12 Phase 8 / P2-4
**Labels**: `enhancement`, `frontend`, `performance`

### Description

As a **user of the workbench**, I want the Tailwind-theme download to not drag a YAML serializer into my browser, so the page ships less JavaScript for a feature that is pure string building.

### Context

Verified at `d619f19`: `app/page.tsx:5` imports `emitTailwindTheme` from `@/lib/emit`, and `lib/emit.ts:1` imports `js-yaml`'s `dump` plus `reportSchema` at module scope — **neither of which `emitTailwindTheme` (line 380) uses**. Confirmed in the production build: `js-yaml` is present in `.next/static/chunks/171-*.js` (84 kB).

`emitTailwindTheme` is a derived view over an already-validated `Report` — it needs no schema and no serializer.

### Acceptance Criteria

- [ ] Given `emitTailwindTheme`, when it is relocated, then it lives in its own module importing only what it uses — no `js-yaml`, no `reportSchema` — and `app/page.tsx` imports it from there.
- [ ] Given a production build, when `.next/static/chunks/` is inspected, then `js-yaml` no longer appears in any client chunk.
- [ ] Given the workbench, when "Download Tailwind theme" is clicked, then the emitted `@theme` stylesheet is **byte-identical** to before the move — including the `prefers-color-scheme: dark` override block when `paletteDark` exists.
- [ ] Given the move, when `npm run build`, `npm run typecheck`, and `npm run lint` run, then all pass, and the reported First Load JS is lower than the 132 kB recorded in §1a.
- [ ] Given `lib/emit.ts`, when it is re-read, then it still owns the markdown emit path and `renderCssVariables`; only the Tailwind view moved.

### Technical Notes

- Verified: `emitTailwindTheme` is `lib/emit.ts:380`; the dark override it emits is around `emit.ts:425`.
- The PRD describes `emitTailwindTheme` as a **derived view adding zero schema surface** — that property is what makes this move safe. Keep it: don't take the opportunity to add validation on the way out.
- Quote the before/after First Load JS in the PR description; §1a records 132 kB as the baseline.
- Coordinate with **DIST-075**, which adds a dark block to `renderCssVariables` in the same file — sequence them to avoid a conflict.
- Files: `lib/emit.ts`, a new module (e.g. `lib/emitTailwind.ts`), `app/page.tsx`.

### Dependencies

- Blocked by: —
- Blocks: — *(sequence against DIST-075, same file)*

---

## [DIST-072] Join `computeContentMaxWidth` on landmark identity, not a post-AI-rename name

**Type**: Bug
**GitHub Label**: `bug`
**Priority**: Medium
**Complexity**: Small
**Phase**: PRD §12 Phase 8 / P2-5
**Labels**: `bug`, `structure-lane`

### Description

As an **agency builder**, I want `contentMaxWidth` measured on `<div>`-based layouts too, so the field doesn't silently vanish on the majority of real sites that don't use `<section>`.

### Context

Verified at `d619f19`, `lib/extract/structure/structureEmit.ts:213`:

```ts
if (node.componentName === "MainContent" || node.tagName === "section") {
```

The name half is fragile — Stage 7 may rename `MainContent` to anything, and unlike `sections.ts:findBand` this site does **not** check landmark first. Empirically (PRD §12 Phase 8) the tag half carries the signal: replacing `<section>` with `<div>` in the harvest drops `contentMaxWidth` from `1344` to `undefined` **even with heuristic naming intact**. So on `<div>`-based layouts the value silently vanishes. Omission is the honest outcome, but it omits far more often than the field's doc comment implies.

### Acceptance Criteria

- [ ] Given a harvest where the main region is a `<div>` with `landmark: "main"` (no `<section>` tags), when the structure lane runs, then `contentMaxWidth` is still computed.
- [ ] Given a harvest where Stage 7's AI pass renamed `MainContent` to something else, when the emit runs, then `contentMaxWidth` is unaffected — the join no longer depends on a post-rename name.
- [ ] Given no identifiable main region, when the emit runs, then `contentMaxWidth` is **omitted**, not defaulted — the optional-field contract is preserved.
- [ ] Given the fix, when `npm run eval` runs, then it passes; if the committed fixtures' `contentMaxWidth` legitimately changes, the baseline is refreshed **in the same PR** with the before/after quoted.

### Technical Notes

- **`sections.ts:findBand` is the reference predicate** — landmark first, tag second, `componentName` only as a fallback. This is the third site in the sweep pointing at the same correct implementation (see DIST-063); if DIST-063 extracts a shared landmark predicate, reuse it here rather than writing a fourth variant.
- DIST-062's adversarial fixture is specified to include `<div>`-based sections, so it covers this case once landed.
- Files: `lib/extract/structure/structureEmit.ts`.

### Dependencies

- Blocked by: — *(reuse DIST-063's predicate if that lands first; verified by DIST-062's fixture)*
- Blocks: —

---

## [DIST-073] Resolve the ten exports that have no importer

**Type**: Technical
**GitHub Label**: `technical`
**Priority**: Low
**Complexity**: Small
**Phase**: PRD §12 Phase 8 / P2-6
**Labels**: `technical`, `cleanup`

### Description

As a **maintainer**, I want the public surface of each module to reflect what is actually consumed, so "exported" doesn't quietly mean "exported for a test suite that doesn't exist."

### Context

Verified at `d619f19` — each of these is used only within its own defining module:

| Export | Module |
|---|---|
| `isBlockedIpv4`, `isBlockedIpv6`, `parseAllowlist` | `lib/security/ssrfGuard.ts` |
| `boundsDistance`, `BOUNDS_MATCH_TOLERANCE` | `lib/extract/structure/styleMatch.ts` |
| `extractSpacing`, `extractRadius`, `extractElevation` | `lib/extract/tokens.ts` |
| `PALETTE_DELTA_E_TOLERANCE` | `eval/score.ts` |
| `AI_MODEL` | `lib/aiLane.ts` |

They read as exported-for-testability in a repo that has **no unit-test framework** — the PRD's own framing: *"either add one, or drop the `export`."*

### Acceptance Criteria

- [ ] Given each of the ten, when it is reviewed, then it is either dropped to module-private **or** kept with a one-line comment naming the intended consumer — the decision is recorded per export, not applied blanket.
- [ ] Given the SSRF guard's three predicates, when a decision is made, then it accounts for their value as an independently-auditable security surface — keeping them exported with a rationale is a legitimate outcome for these specifically.
- [ ] Given `AI_MODEL`, when a decision is made, then it accounts for §6's "one pinned model" framing — the export may be the documented way an operator inspects the pin.
- [ ] Given the change, when `npm run typecheck` and `npm run lint` run, then both pass with no unused-export or unused-symbol warnings introduced.
- [ ] Given the change, when `npm run eval` runs, then it passes with `eval/baseline.json` **untouched** — visibility changes cannot alter behavior.

### Technical Notes

- Do **not** treat this as ten mechanical deletions. Three groups have genuinely different arguments: security predicates (auditability), the AI model pin (documentation), and the token extractors / bounds helpers (pure internals — these are the clearest drops).
- `PALETTE_DELTA_E_TOLERANCE` lives in `eval/score.ts`, outside `lib` — same treatment, different blast radius.
- If a future unit-test framework is on the table, say so in the PR and keep the exports; that is a legitimate resolution, but it should be a stated decision rather than the current default-by-inaction.
- Files: `lib/security/ssrfGuard.ts`, `lib/extract/structure/styleMatch.ts`, `lib/extract/tokens.ts`, `lib/aiLane.ts`, `eval/score.ts`.

### Dependencies

- Blocked by: —
- Blocks: —

---

# P3 — Minor, verified

## [DIST-074] Stop double-counting above-the-fold pixels in palette area weights

**Type**: Bug
**GitHub Label**: `bug`
**Priority**: Low
**Complexity**: Small
**Phase**: PRD §12 Phase 8 / P3-1
**Labels**: `bug`, `extraction`, `palette`

### Description

As a **frontend developer**, I want area weights to sample each pixel once, so a tall page's palette isn't biased toward whatever is above the fold.

### Context

Verified at `d619f19`: `lib/analyze.ts:63-67` passes the viewport shot as `screenshotPngBase64` **and** the panorama as `additionalScreenshotsPngBase64`, while `lib/ingest.ts:222` makes the viewport shot **tile 0 of the panorama** (`const tileBuffers: Buffer[] = [Buffer.from(topShotBase64, "base64")]`). The fold is therefore sampled twice.

Measured impact on `clean-light` (PRD): **0.001** — background `0.695` vs `0.696` panorama-only. Real but negligible at 2 tiles; grows with page height.

### Acceptance Criteria

- [ ] Given a capture with a `panoramaShot`, when `extractPalette` is called, then the panorama is passed **alone** — the viewport shot is not additionally sampled.
- [ ] Given a capture with **no** panorama (a single-viewport page), when `extractPalette` is called, then the viewport shot is still sampled — coverage is never lost.
- [ ] Given a tall page, when area weights are computed, then no pixel above the fold contributes twice.
- [ ] Given the fix, when `npm run eval` runs, then any score movement is quoted in the PR description with the before/after `areaWeight` values, and the baseline is refreshed **deliberately in the same PR** if the rounded score changes.

### Technical Notes

- The fix is a one-line argument change at the `extractPalette` call site, **not** a change to `palette.ts` — keep the extractor's "sample every screenshot you're given" contract intact.
- Check the image path (`analyzeImages` → `imagePalette`) is unaffected; it merges across uploads and has no panorama concept.
- Expect the delta to be sub-0.001 on the committed fixtures (2 tiles). If the eval score doesn't move at all, say so explicitly rather than refreshing the baseline for no reason.
- Files: `lib/analyze.ts` (primary), `eval/baseline.json` (only if the score moves).

### Dependencies

- Blocked by: —
- Blocks: —

---

## [DIST-075] Emit a `prefers-color-scheme: dark` block from `renderCssVariables`

**Type**: Enhancement
**GitHub Label**: `enhancement`
**Priority**: Low
**Complexity**: Small
**Phase**: PRD §12 Phase 8 / P3-2
**Labels**: `enhancement`, `emit`

### Description

As a **frontend developer**, I want the report's `:root` fence to carry the dark palette it measured, so I don't get a light-only system from a report that measured both schemes.

### Context

Verified at `d619f19`: `emitTailwindTheme` emits a full `prefers-color-scheme: dark` override (`lib/emit.ts:425`) while `renderCssVariables` — the fence that closes the markdown body — has none. **Two derived views of one report object with asymmetric coverage of `paletteDark`.** A consumer taking the `:root` fence gets a light-only system from a report that measured both.

### Acceptance Criteria

- [ ] Given a report **with** `paletteDark`, when `renderCssVariables` runs, then the fence includes a `@media (prefers-color-scheme: dark)` block redeclaring the shifted variables.
- [ ] Given a report **without** `paletteDark` (a single-scheme site), when `renderCssVariables` runs, then **no** dark block is emitted — the optional-lane contract holds, and the output is unchanged from today.
- [ ] Given the same report, when both derived views are compared, then the `:root` fence and `emitTailwindTheme` cover the same dark variables — no third source of truth, and every emitted value traces to a field already on the report.
- [ ] Given the change, when it lands, then **no schema surface is added** — both views remain pure renderings of existing fields.
- [ ] Given the change, when `npm run eval` runs, then it passes; if the emitted markdown for the `dark-mode` fixture changes, the diff is quoted in the PR description.

### Technical Notes

- `emitTailwindTheme`'s existing dark block is the reference for **which** variables shift — mirror its selection rather than inventing a second rule for what "counts" as dark.
- Sequence against **DIST-071**, which moves `emitTailwindTheme` out of `lib/emit.ts`. Landing DIST-071 first makes this a smaller diff.
- The `dark-mode` fixture exercises this path, so the change is covered by the existing corpus — unusual for this phase, and worth noting in the PR.
- Files: `lib/emit.ts`.

### Dependencies

- Blocked by: — *(sequence against DIST-071, same file)*
- Blocks: —

---

## [DIST-076] Skip the AI interpretation lane on `mode: "structure"` URL runs

**Type**: Enhancement
**GitHub Label**: `enhancement`
**Priority**: Low
**Complexity**: Small
**Phase**: PRD §12 Phase 8 / P3-3
**Labels**: `enhancement`, `ai-lane`, `performance`

### Description

As an **API consumer**, I want a `structure`-only URL request to skip the token-enrichment vision call, so I'm not paying latency and quota for output that is discarded.

### Context

Verified at `d619f19`: the image path deliberately gates it — `lib/analyze.ts:238` computes `const wantsTokenEnrichment = mode === "tokens" || mode === "both"` and only calls `enrichWithAI` when true (line 241). The URL path has no equivalent: `analyzeUrl` calls `enrichWithAI` unconditionally at line 349.

No user-visible impact today — the workbench always sends `both` — but a `structure`-only API consumer pays for a vision call whose output is discarded. On the Gemini free tier (~10 RPM, §14) that is a real cost: it halves the effective request budget for structure-only integrations.

### Acceptance Criteria

- [ ] Given `analyzeUrl` with `mode: "structure"`, when it runs with an API key set, then `enrichWithAI` is **not** called and no interpretation request is issued.
- [ ] Given `analyzeUrl` with `mode: "tokens"` or `"both"`, when it runs, then behavior is unchanged from today.
- [ ] Given `mode: "structure"`, when the response is built, then the design report is still returned as measured (the structure lane's `both`-mode token cross-link is unaffected), and `meta.aiApplied` honestly reflects that no token enrichment ran.
- [ ] Given the change, when the URL and image paths are compared, then they use the **same** gating predicate rather than two independently-written conditions.
- [ ] Given the change, when `npm run eval` runs, then it passes with `eval/baseline.json` untouched (the eval path never calls the AI lane).

### Technical Notes

- Reuse `wantsTokenEnrichment` (or hoist it) so the two paths share one predicate — writing a second, parallel condition here would re-create the divergence pattern this phase is otherwise closing.
- Check Stage 7's AI *naming* lane is unaffected: that is part of the structure lane and **should** still run in `structure` mode when a key is present. This story targets only `enrichWithAI` / `lib/interpret.ts`.
- Files: `lib/analyze.ts`.

### Dependencies

- Blocked by: —
- Blocks: —

---

## [DIST-077] Omit `text` rather than duplicating the background hex on single-cluster images

**Type**: Bug
**GitHub Label**: `bug`
**Priority**: Low
**Complexity**: Small
**Phase**: PRD §12 Phase 8 / P3-4
**Labels**: `bug`, `extraction`, `palette`

### Description

As a **designer**, I want a flat single-colour upload to report *no* text role, so I don't get a swatch claiming a role the image doesn't have — with a 1:1 contrast pair graded `fail`.

### Context

Verified at `d619f19`, `lib/extract/imagePalette.ts:219`: the `|| swatches.length === 1` arm fires on a single-cluster image, pushing a `text` swatch with `bgCluster.hex` — yielding a duplicate hex across two roles and a `text on background` contrast pair of 1:1, graded `fail`.

Honest in the sense that it is measured, but it reports a **role the image does not have**. Omission would match the `DegenerateImageError` precedent (§10: a `422` for an unreadable/transparent upload — the input is at fault, not the pipeline) and §2 principle 1: *omitted beats guessed*.

### Acceptance Criteria

- [ ] Given a single-cluster image, when the palette is built, then **no** `text` swatch is emitted and no `text on background` contrast pair appears.
- [ ] Given a multi-cluster image, when the palette is built, then text-role selection is unchanged from today.
- [ ] Given a report with no `text` role, when it is emitted, then the palette section, contrast pairs, and the CSS-variables block all render without a malformed or empty entry.
- [ ] Given a single-cluster image, when it is analyzed, then the request still succeeds — this is an omitted field, **not** a new error path; `DegenerateImageError` remains reserved for unreadable/transparent uploads.
- [ ] Given the change, when `npm run eval` runs, then it passes with `eval/baseline.json` untouched (no fixture exercises the image path).

### Technical Notes

- Verify the `!assignedHexes.has(bestTextCluster.hex)` arm still behaves as before; only the `|| swatches.length === 1` fallback is being removed.
- Check that `lib/emit.ts` and the workbench's swatch/contrast preview tolerate an absent `text` role — the optional-field contract says they should, but the image path is the least-exercised one in the codebase.
- Manual verification: a 1×1 or flat-fill PNG through `analyzeImages` is the smallest reproduction. Delete the scratch script afterwards.
- Files: `lib/extract/imagePalette.ts`.

### Dependencies

- Blocked by: —
- Blocks: —

---

## Validation checklist (PRD §12 Phase 8)

- [ ] Every Phase-8 PRD item maps to a story, or is recorded above as accepted-as-is (P2-3 only).
- [ ] No story exceeds ~1–2 days; DIST-062 is the largest (Large) and is deliberately so — it is the gate.
- [ ] Acceptance criteria are verifiable without asking the author; every one names the command or the observable output.
- [ ] Dependencies form a valid DAG: DIST-062 → DIST-063 is the only hard edge; DIST-071/DIST-075 and DIST-062/DIST-065 carry soft sequencing notes.
- [ ] Each story is independently reviewable and mergeable.
- [ ] The two unchecked §11 functional requirements are covered: *"The AI lane can never assign an evidence-gated role"* → DIST-064; *"Structure names are stable under realistic DOM shapes"* → DIST-063.
- [ ] `npm run lint` + `npm run typecheck` are required on every story; `npm run eval` with an **untouched** baseline is required on all but DIST-062, DIST-063, DIST-065, and (conditionally) DIST-072 and DIST-074.
