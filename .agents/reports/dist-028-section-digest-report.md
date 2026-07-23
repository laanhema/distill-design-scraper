# Implementation Report

**Plan**: `.agents/plans/dist-028-section-digest-plan.md`
**Branch**: `feature/dist-028-section-digest`
**Status**: COMPLETE
**GitHub Issue**: #34 (DIST-028)

## Summary

Built Stage 9 of the structure lane: a deterministic, measured-only section
digest. `buildSectionDigests` selects page bands (SiteHeader, each direct
child of MainContent, SiteFooter — keyed on measured landmark/tag with the
final component name only as a fallback) and joins each band's `band` (Stage
8a region metrics), `layout` (first multi-child flex/grid annotation
descending), `contents` (counted subtree summary), `tokens` (Stage 8b hints,
`both` mode only), and `responsive` (Stage 7b deltas) by subtree component
names. A collapsed repeated group (e.g. `ArticleCard ×3`) is one digest entry
carrying `instances`. Schema additions (plan step 1d) were already present as
uncommitted work and verified against the issue. Emit carries `sections` in
the machine block and a formatted `sectionsText`; the markdown body is
untouched (placement is DIST-029).

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Verify schema additions (1d) | `lib/extract/structureSchema.ts` | ✅ |
| 2 | Stage 9 digest builder + formatter (1c) | `lib/extract/structure/sections.ts` | ✅ CREATE |
| 3 | Orchestrate Stage 9 after Stage 8b | `lib/extract/structure/index.ts` | ✅ UPDATE |
| 4 | Emit wiring (machine block + `sectionsText`) | `lib/extract/structure/structureEmit.ts` | ✅ UPDATE |
| 5 | Commit + push (no PR) | — | ✅ |

## Validation Results

| Check | Result |
|-------|--------|
| `npm run typecheck` | ✅ pass |
| `npm run lint` | ✅ pass |
| `npm run eval` | ✅ pass — clean-light 100%, dark-mode 100%, **no baseline refresh** |
| E2E synthetic fixture | ✅ all assertions passed (see below) |

## End-to-End Verification

Temporary scratch script (local `http.createServer` synthetic page →
`renderUrl` with `SSRF_ALLOWLIST_HOSTS=localhost` → `captureFromRender` →
`extractStructureFromCapture`; run with `npx tsx` from project root, deleted
after use per CLAUDE.md). Verified:

1. Ordered digests: SiteHeader → Hero → ArticleCard ×3 → FlexContainer →
   SiteFooter, ordinals 1-based and sequential.
2. Repeated card group emitted as **one** entry with `instances: 3`.
3. `band: "sticky · h 64px"` on the header, `band: "padY 32px"` on the footer;
   the depth-2 hero section honestly omits `band` (Stage 8a annotates regions
   only — no guessing).
4. `layout` picks the real content grid (`grid · 2col` hero, `flex · space-between` header).
5. `contents` counts: `1 heading · 2 paragraphs · CtaRow (2 actions) · 1 image` on the hero.
6. `tokens` joined by subtree component names in `both` mode; entirely omitted
   in structure-only mode.
7. `sectionsText` populated; `machineBlock.sections` validates against the schema.

## Files Changed

| File | Action | Purpose |
|------|--------|---------|
| `lib/extract/structure/sections.ts` | CREATE (+219) | Stage 9 builder + `formatSectionDigests` |
| `lib/extract/structureSchema.ts` | UPDATE (+44/-0, pre-existing uncommitted) | `sectionDigestSchema`, optional `sections`, `sectionsText` |
| `lib/extract/structure/index.ts` | UPDATE (+9/-1) | Stage 9 orchestration |
| `lib/extract/structure/structureEmit.ts` | UPDATE (+11/-1) | `sections` input, machine block field, `sectionsText` |

## Deviations from Plan

- Scratch-fixture hero expectation adjusted: the plan's E2E listed `h 100vh`
  on the hero band, but a `<section>` inside `<main>` is a depth-2 non-region
  in the ontology, so Stage 8a never annotates it and the digest honestly
  omits `band`. This is the correct "measured, never faked" behavior — the
  assertion was changed to verify the omission rather than the value.
- Band-selection guard added beyond the plan text: header/footer nodes equal
  to the main node, or a footer nested inside main, are excluded from the band
  list (defensive, no behavioral change on real trees).

## Tests Written

No test framework exists in this project (per CLAUDE.md); correctness was
exercised through the project's stated gates: `npm run eval` (offline
regression harness, passed unchanged) plus the temporary synthetic-fixture
scratch script described above (7 assertion groups, all passed, script
deleted after use).
