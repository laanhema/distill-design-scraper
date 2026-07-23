# Plan: DIST-028 — Deterministic Section Digest (Stage 9) + Schema Fields

## Summary

Build Stage 9 of the structure lane: a deterministic, measured-only per-section
digest (`SectionDigest[]`) emitted from the metrics-annotated tree after Stage
8b. One digest per top-level band — `SiteHeader`, each direct child of
`MainContent` (a collapsed repeated group like `SectionCard ×7` is **one** entry
with `instances: 7`), `SiteFooter`. Every field is joined from an
already-measured upstream artifact (Stage 8a region metrics, Stage 7b responsive
deltas, Stage 8b token hints); an absent input yields an omitted field, never a
guess. Schema additions (plan step 1d) are already present as uncommitted
changes to `lib/extract/structureSchema.ts` and are kept as-is. Emit changes
beyond `sectionsText` (the `## Page sections` body section) are **DIST-029** and
explicitly out of scope — the markdown body does not change in this issue.

## User Story

As a builder planning a new site from a source site
I want an ordered, measured per-section digest (name, band, layout, contents, tokens, responsive deltas)
So that the report can describe each page section once, at intent altitude

## Metadata

| Field | Value |
|-------|-------|
| Type | NEW_CAPABILITY |
| Complexity | HIGH |
| Systems Affected | structure lane (`lib/extract/structure/`), structure schema |
| GitHub Issue | #34 |

---

## Patterns to Follow

### Optional-field schema convention (additive, never breaking)

```
// SOURCE: lib/extract/structureSchema.ts:106-114 (existing `responsive` field)
  /** Per-component layout-annotation deltas across captured viewports ... Only
   *  present when secondary-viewport harvests ran and produced at least one
   *  real delta. */
  responsive: z.record(z.string(), z.record(z.string(), z.string())).optional(),
```

### Conditional spread in emit (omit when absent, never emit empty)

```
// SOURCE: lib/extract/structure/structureEmit.ts:80-81
    ...(contentMaxWidth !== undefined ? { contentMaxWidth } : {}),
    ...(hasResponsive ? { responsive } : {}),
```

### Stage orchestration in the pipeline (each stage takes/returns derived data)

```
// SOURCE: lib/extract/structure/index.ts:99-110
  // Stage 8a: Region Metrics ...
  const metricsRoot = annotateRegionMetrics({ root: labeledRoot, ... });

  // Stage 8b: Token Link — only when the design-tokens lane ran alongside us.
  const tokenHints =
    dump && report ? linkComponentsToTokens(metricsRoot, dump, report) : undefined;
```

### Band-segment classification (structural vs. band annotation segments)

```
// SOURCE: lib/extract/structure/responsive.ts:23-31
const NON_STRUCTURAL_SEGMENT = /^(sticky|fixed|h \d+px|h 100vh|padY \d+px)$/;
function structuralPart(annotation: string | undefined): string | undefined { ... }
```
Stage 9 needs the inverse split too (band segments only). Reuse the same regex
shape locally in `sections.ts` — do not export from responsive.ts (it is a
private helper there; a tiny duplicated regex is consistent with the codebase's
"tiny local helper" style, e.g. `nearestScaleValue` exists in both
`regionMetrics.ts` and `tokenLink.ts`).

### Validation commands

- `npm run typecheck` (tsc --noEmit)
- `npm run lint` (next lint)
- `npm run eval` (offline regression gate — must pass with **no baseline refresh**)

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/extract/structureSchema.ts` | KEEP (already updated, uncommitted) | `sectionDigestSchema`, optional `sections` on `structureMachineBlockSchema`, `sectionsText` on `StructureReport` (plan step 1d) |
| `lib/extract/structure/sections.ts` | CREATE | Stage 9 digest builder + text formatter (plan step 1c) |
| `lib/extract/structure/index.ts` | UPDATE | Orchestrate Stage 9 after Stage 8b, pass digests into emit |
| `lib/extract/structure/structureEmit.ts` | UPDATE | Accept optional `sections`, add to machine block + populate `sectionsText` |

---

## Tasks

### Task 1: Verify the schema additions (plan step 1d)

- **File**: `lib/extract/structureSchema.ts`
- **Action**: KEEP — already present as uncommitted changes (verified against the
  issue's acceptance criteria: all three additions are additive + optional, old
  captures simply omit them). Confirm no further schema change is needed:
  `sectionDigestSchema` fields (`name`, `ordinal`, `instances?`, `band?`,
  `layout?`, `contents?`, `tokens?`, `responsive?`) match the issue's field
  table; `sections?: SectionDigest[]` on the machine block; `sectionsText?` on
  `StructureReport`.
- **Validate**: `npm run typecheck`

### Task 2: Stage 9 digest builder — `lib/extract/structure/sections.ts` (CREATE)

- **File**: `lib/extract/structure/sections.ts`
- **Action**: CREATE
- **Implement**:
  - `buildSectionDigests(input: { root: PrunedNode; tokenHints?: Map<string, string>; responsive?: ResponsiveDeltas }): SectionDigest[] | undefined`
  - **Band selection** (robust to AI renaming — use measured landmarks first,
    heuristic names as fallback): DFS for the first node with
    `landmark === "banner"`/`tagName === "header"` or `componentName === "SiteHeader"`;
    same for `"main"`/`MainContent` and `"contentinfo"`/`footer`/`SiteFooter`.
    Bands = `[header?]` + children of the main node (or, when no main node is
    found, nothing — omit the digest rather than guessing band identity) +
    `[footer?]`, in document order. A repeated-group child carries
    `instanceCount > 1` → one digest entry with `instances: N`.
  - **Per-band fields**:
    - `name` = final `componentName`; `ordinal` = 1-based position; `instances`
      only when `instanceCount > 1`.
    - `band` = segments of the node's **own** `layoutAnnotation` matching
      `/^(sticky|fixed|h \d+px|h 100vh|padY \d+px)$/` (the Stage 8a output),
      joined ` · `; omitted when none.
    - `layout` = first annotation found on a DFS descent (starting at the band
      node itself, so a squashed section's own grid counts) whose structural
      part (annotation minus band segments) is non-empty **and** that has more
      than one child; omitted when none.
    - `contents` = counted subtree summary, segments joined ` · `, in this
      order, each omitted when zero: `N heading(s)` (tagName h1–h4),
      `N paragraph(s)` (tagName p), `CtaRow (N action(s))` (when a subtree node
      is named `CtaRow`; N = interactive descendants within CtaRow subtrees),
      `N image(s)` (`isImageOrSvg`), then one `Name ×N` per repeated-group node
      (`instanceCount > 1`). Singular/plural handled. Omitted entirely when
      every count is zero.
    - `tokens` = for each unique `componentName` in the subtree (document
      order) with a hit in `tokenHints`: `Name: hint`, joined ` · `. Only runs
      when `tokenHints` is present (`both` mode); omitted otherwise — never
      guessed.
    - `responsive` = for each unique `componentName` in the subtree with an
      entry in `responsive`: `Name: 390px \`grid · 1col\` → 1440px \`grid · 3col\``
      (narrowest-first, same wording as `buildResponsiveSectionText`), joined
      ` · `. Omitted when no deltas.
  - Return `undefined` when the band list is empty (header/main/footer all
    absent) so emit omits the field.
  - `formatSectionDigests(digests: SectionDigest[]): string` — one block per
    digest for `sectionsText`: header line `1. Name (×N)` then `band:`,
    `layout:`, `contents:`, `tokens:`, `responsive:` lines for each populated
    field. Pure formatting; the markdown body placement is DIST-029.
- **Mirror**: `lib/extract/structure/tokenLink.ts` (Map-keyed-by-name join,
  best-effort/never-guess posture) and `lib/extract/structure/responsive.ts`
  (segment classification, narrowest-first wording)
- **Validate**: `npm run typecheck`

### Task 3: Orchestrate Stage 9 — `lib/extract/structure/index.ts` (UPDATE)

- **File**: `lib/extract/structure/index.ts`
- **Action**: UPDATE
- **Implement**: after Stage 8b (`tokenHints`), before `emitStructureReport`:
  ```ts
  // Stage 9: Section Digest (#34 / DIST-028) — ordered measured per-band summary.
  const sections = buildSectionDigests({ root: metricsRoot, tokenHints, responsive });
  ```
  Pass `sections` into `emitStructureReport`. Note: `responsive` here is the
  `ResponsiveDeltas` already computed at Stage 7b (currently passed straight to
  emit) — reuse it; guard: Stage 9 joins only when the delta map is non-empty.
- **Mirror**: `lib/extract/structure/index.ts:99-110` (Stage 8a/8b block)
- **Validate**: `npm run typecheck`

### Task 4: Emit wiring — `lib/extract/structure/structureEmit.ts` (UPDATE)

- **File**: `lib/extract/structure/structureEmit.ts`
- **Action**: UPDATE
- **Implement**:
  - Add `sections?: SectionDigest[]` to `StructureEmitInput`.
  - Machine block: `...(sections && sections.length > 0 ? { sections } : {})`
    (conditional-spread pattern, source line 80-81).
  - Return object: `...(sections && sections.length > 0 ? { sectionsText: formatSectionDigests(sections) } : {})`.
  - **Do not** touch the markdown body — `## Page sections` placement is
    DIST-029. The vision lane (`structureFromImage.ts`) never passes
    `sections`, so inferred reports simply omit it.
- **Mirror**: `lib/extract/structure/structureEmit.ts:74-84, 134-148`
- **Validate**: `npm run typecheck && npm run lint`

### Task 5: Commit + push

- Stage only: `lib/extract/structureSchema.ts`, `lib/extract/structure/sections.ts`,
  `lib/extract/structure/index.ts`, `lib/extract/structure/structureEmit.ts`,
  `.agents/plans/dist-028-section-digest-plan.md`, the report file.
- Branch: already on `feature/dist-028-section-digest` (correct per naming
  convention `feature/dist-NNN-slug` seen in `git log`).
- Commit style from `git log`: `feat: <imperative summary> (#34)`.
- Push `feature/dist-028-section-digest` to origin. **No PR** (separate step).

---

## Validation

```bash
npm run typecheck
npm run lint
npm run eval   # must pass with NO baseline refresh
```

## End-to-End Verification

Synthetic fixture per CLAUDE.md ("Manually verifying extraction changes"): a
scratch script run with `npx tsx` from the project root (deleted afterwards)
that serves a small page via `http.createServer` — sticky `<header>` (h 64px),
`<main>` with a near-100vh hero (wrapper-chain nesting → squashed), a repeated
card grid (`×3`), a logo strip, and a `<footer>` — then drives Playwright
directly like `eval/capture.ts` (or `SSRF_ALLOWLIST_HOSTS=localhost` +
`renderUrl`) through `captureFromRender` + `extractStructureFromCapture`.
Assert on the returned report:

1. `machineBlock.sections` exists with entries in order: SiteHeader, hero,
   card-grid band (single entry, `instances: 3`), logo strip, SiteFooter.
2. `band` on the header reads `sticky · h 64px`; hero band reads `h 100vh`.
3. `layout` on the card-grid band reads the grid annotation (e.g. `grid · 3col`).
4. `contents` counts are sane (headings/paragraphs/images/`CardName ×3`).
5. `sectionsText` is populated.
6. Re-run without the tokens lane (`structure`-only mode path: no `dump`/
   `report`) → digests still emitted, `tokens` field absent.

Then `npm run eval` must pass unchanged (old captures replay identically;
`sections` is additive).

---

## Acceptance Criteria

- [ ] Stage 9 emits ordered `SectionDigest[]` (header, MainContent children, footer); repeated group = one entry with `instances`
- [ ] `band` from Stage 8a, `layout` = first multi-child flex/grid annotation descending, `contents` = counted subtree summary, `tokens`/`responsive` joined by subtree component names — measured only
- [ ] Schema additions additive + optional; old captures omit without erroring
- [ ] Absent input (tokenHints / responsive deltas) → field omitted, not guessed
- [ ] `npm run typecheck`, `npm run lint`, `npm run eval` pass with no baseline refresh
- [ ] Committed + pushed on `feature/dist-028-section-digest`; no PR created

## Risks

| Risk | Mitigation |
|------|------------|
| AI labelling renames `SiteHeader`/`MainContent`/`SiteFooter`, breaking name-based band lookup | Band selection keys on measured `landmark`/`tagName` first; names are only a fallback |
| A main node missing (no `<main>`/landmark) | Omit the whole `sections` field rather than guessing band identity |
| Repetition-collapsed child bounds skew `contents` counts | Counts come from the representative subtree only; the `×N` entry carries the repetition — no extrapolation, which stays honest |
| Eval regression from emit changes | Emit change is conditional-spread only; eval replays old captures whose pipeline now produces `sections` — machine block gains a field but `scoreStructure.ts` scores `components`/skeleton, not the new field; verify with a full `npm run eval` |
