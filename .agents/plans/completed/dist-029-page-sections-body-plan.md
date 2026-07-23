# Plan: DIST-029 — Lead the structure body with "Page sections"; demote the skeleton

## Summary

Reorder the structure report's markdown body so it opens with one block per Stage 9
section digest (`## Page sections`), demote the exhaustive ASCII tree to a
depth-capped (~3 levels) `## Skeleton (detail)` section, and filter the `## Components`
body list down to `region` / `content-block` / `composite` entries (atoms and generic
containers stay machine-block-only). All changes are confined to
`lib/extract/structure/structureEmit.ts` — the machine block, the `skeletonAscii`
field, and the schema are untouched, so the no-drift invariant and `scoreStructure`
keep working exactly as before.

## User Story

As a reader of the structure report
I want the body to open with one block per page section and push the exhaustive tree into detail/machine sections
So that the report reads as "here's the navbar pattern, here's the hero pattern" instead of a 24-node nested dump

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT |
| Complexity | MEDIUM |
| Systems Affected | Structure lane emit (body rendering only) |
| GitHub Issue | #35 |

---

## Patterns to Follow

### Conditional body section (omit, never render empty)
```
// SOURCE: lib/extract/structure/structureEmit.ts:56-57, 109-111
const hasResponsive = Boolean(responsive && Object.keys(responsive).length > 0);
const hasSections = Boolean(sections && sections.length > 0);
...
const responsiveSection = hasResponsive
  ? `\n\n## Responsive\n\n${buildResponsiveSectionText(responsive!)}`
  : "";
```
The issue's technical note: conditional rendering follows the project's
`if (report.<field>)` convention — an absent `sections` field means the heading is
omitted, never rendered empty.

### Conditional field population on the returned report
```
// SOURCE: lib/extract/structure/structureEmit.ts:154-156
// Body placement of the digest (`## Page sections`) is DIST-029 — here we
// only carry the formatted text, derived from the same digest objects.
...(hasSections ? { sectionsText: formatSectionDigests(sections!) } : {}),
```
`sectionsText` is already populated (DIST-028); this plan only places it in the body.

### Digest text formatting (already exists — reuse, don't reformat)
```
// SOURCE: lib/extract/structure/sections.ts:233-245
export function formatSectionDigests(digests: SectionDigest[]): string {
  return digests
    .map((d) => {
      const lines = [`${d.ordinal}. ${d.name}${d.instances ? ` ×${d.instances}` : ""}`];
      if (d.band) lines.push(`   band: ${d.band}`);
      ...
```

### Machine block stays the full contract
```
// SOURCE: lib/extract/structure/structureEmit.ts:76-94
const machineBlock: StructureMachineBlock = {
  ...
  tree: treeNodes,
  components: mergedComponents,   // ALL components — body filtering must not touch this
};
structureMachineBlockSchema.parse(machineBlock);
```

### Downstream consumers that constrain what may change
```
// SOURCE: eval/scoreStructure.ts:38 — greps report.skeletonAscii for region names,
// so the FIELD must stay fully populated (only the markdown body rendering is capped).
const emittedAscii = report.skeletonAscii;

// SOURCE: app/page.tsx:154,161,375 — the UI only reads structureReport.markdown and
// .header; componentMapText/sectionsText are not consumed outside structureEmit.ts.
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/extract/structure/structureEmit.ts` | UPDATE | Reorder/filter body sections; depth-cap the rendered skeleton |

No schema changes, no new files, no eval fixture changes.

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Depth-cap support in `buildAsciiSkeleton`

- **File**: `lib/extract/structure/structureEmit.ts`
- **Action**: UPDATE
- **Implement**: Add an options parameter (e.g. `maxDepth?: number`) to
  `buildAsciiSkeleton` (structureEmit.ts:233). Depth 1 = the root line. When a node at
  the cap still has children, render a single `…` child line (using the same
  `└─ `/`├─ ` connector style) instead of recursing, so the truncation is visible
  rather than silent. The existing recursive call chain passes depth + 1 down.
  The top-level call for the `skeletonAscii` *field* (structureEmit.ts:70) keeps NO
  cap — full tree, unchanged. Only the markdown body uses a capped rendering
  (`maxDepth: 3`).
- **Mirror**: `buildAsciiSkeleton` itself (structureEmit.ts:233-257) — same connector/prefix logic
- **Validate**: `npm run typecheck`

### Task 2: Filter the `## Components` body list to region/content-block/composite

- **File**: `lib/extract/structure/structureEmit.ts`
- **Action**: UPDATE
- **Implement**: In `buildComponentMapText` (structureEmit.ts:259), skip entries whose
  `def.type` is not one of `"region"`, `"content-block"`, `"composite"` (a module-level
  `const BODY_COMPONENT_TYPES = new Set(["region", "content-block", "composite"])` —
  or a plain array + `.includes`, matching codebase style). `mergedComponents` and the
  machine block are untouched — atoms/containers remain machine-block-only.
  `componentMapText` (the returned field) is the body artifact and nothing outside
  structureEmit.ts consumes it, so filtering it directly is correct. If the filtered
  text is empty, the `## Components` body block (heading + intro line) is omitted
  entirely — omit, never render empty (same convention as `responsiveSection`).
- **Mirror**: `buildResponsiveSectionText` conditional-omit pattern (structureEmit.ts:109-111)
- **Validate**: `npm run typecheck`

### Task 3: Reassemble the markdown body — Page sections first, skeleton demoted

- **File**: `lib/extract/structure/structureEmit.ts`
- **Action**: UPDATE
- **Implement**: In `emitStructureReport`'s markdown template (structureEmit.ts:113-140):
  1. When `hasSections`, insert `## Page sections\n\n${sectionsText}` (use the already
     computed `formatSectionDigests(sections!)` value — compute it once into a local
     and reuse for both the body and the returned `sectionsText` field so the body and
     field cannot drift) as the FIRST body section, right after the header fence.
     When `!hasSections` (old capture, vision-inferred lane), no heading appears and
     the report renders without error.
  2. Rename `## Skeleton` → `## Skeleton (detail)` and render the depth-capped ASCII
     from Task 1 (the full ASCII still goes to the `skeletonAscii` field).
  3. Keep `## Responsive` and `## Machine block` in their current relative positions
     (after components / at the end).
  Final body order: header fence → `## Page sections` (conditional) →
  `## Skeleton (detail)` → `## Components` (conditional on non-empty) →
  `## Responsive` (conditional) → `## Machine block`.
- **Mirror**: existing template assembly (structureEmit.ts:113-140)
- **Validate**: `npm run typecheck && npm run lint`

### Task 4: Full validation + end-to-end check

- **File**: —
- **Action**: VERIFY
- **Implement**: Run the gates below, then the end-to-end verification.
- **Validate**: `npm run typecheck && npm run lint && npm run eval` — eval must pass
  with NO baseline refresh (the change never leaves the emit layer; eval scores are
  palette/typography + constant structure score).

---

## Validation

```bash
# Type check / Build
npm run typecheck

# Lint
npm run lint

# Tests
npm run eval
```

## End-to-End Verification

Write a temporary scratch script (delete afterwards, per CLAUDE.md "Manually verifying
extraction changes") run with `npx tsx` from the project root that replays a committed
eval capture offline:

1. Load `eval/corpus/clean-light/capture.json` and call
   `extractStructureFromCapture(capture)` from `lib/analyze.ts` (pass the measured
   `report` from `extractFromCapture(capture)` to exercise `both`-mode token hints if
   cheap — optional).
2. Assert on `structureReport.markdown`:
   - `## Page sections` appears, and its index in the string is BEFORE
     `## Skeleton (detail)`, which is before `## Machine block`.
   - `## Skeleton` (bare, without `(detail)`) does NOT appear as a heading.
   - The skeleton block contains a `…` truncation line when the tree is deeper than
     3 levels.
   - No `### …\`atom\`` or `### …\`container\`` heading appears under `## Components`;
     the machine block JSON still contains those entries (grep the fenced json for a
     known atom/container name).
   - `structureReport.skeletonAscii` is longer than / deeper than the body's capped
     rendering (field stays full).
3. Also verify the negative path with a synthetic minimal `StructureEmitInput` that
   omits `sections` (old-capture shape): no `## Page sections` heading, no error.
4. Delete the scratch script.

Expected: all assertions hold; `npm run eval` passes unchanged.

---

## Acceptance Criteria

- [ ] `## Page sections` renders first, one block per digest, only when `sections` exist
- [ ] Skeleton renders depth-capped (~3 levels) under `## Skeleton (detail)`; `skeletonAscii` field stays fully populated
- [ ] `## Components` body shows only `region`/`content-block`/`composite`; atoms/containers remain machine-block-only
- [ ] Report without `sections` renders with no `## Page sections` heading and no error
- [ ] `npm run typecheck`, `npm run lint`, `npm run eval` pass with no baseline refresh
- [ ] Follows existing patterns (conditional-omit, single derived artifact reused for field + body)

## Risks

| Risk | Mitigation |
|------|------------|
| Body/field drift if digest text is formatted twice | Compute `formatSectionDigests(sections!)` once into a local; use it for both the markdown body and `sectionsText` |
| Vision-inferred lane (`structureFromImage.ts`) breaks | It calls the same `emitStructureReport` without `sections` — conditional rendering covers it; verify with typecheck + the negative-path scratch assertion |
| Depth cap hides region names eval greps for | The cap applies ONLY to the markdown body; `skeletonAscii` field is built from an uncapped call — `scoreStructure` is unaffected |
| Filtering leaves an empty `## Components` section | Omit the whole block when the filtered text is empty (project's omit-don't-render-empty convention) |
