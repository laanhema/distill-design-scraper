# Implementation Report

**Plan**: `.agents/plans/completed/dist-033-cross-origin-states-spike-plan.md`
**Branch**: `feature/dist-033-cross-origin-states-spike`
**Status**: COMPLETE

## Summary

Executed the time-boxed cross-origin states capture spike (issue #39 / DIST-033). Built a two-origin synthetic fixture that reproduces the silent cross-origin CSSOM skip at `lib/extract/styleDump.ts:401-409` with the existing, unmodified `collectStyleDump`, then prototyped three candidate strategies that survive it: (A) fetching cross-origin stylesheets through the Playwright context and re-parsing in a detached same-origin document (both acquisition variants — route interception and `context.request` re-fetch), (B) CDP `CSS.forcePseudoState` + computed-style diff, and (C) CDP CSS-domain `getStyleSheetText`. All three recovered the cross-origin `:hover`/`:focus-visible` deltas in prototype; the write-up at `.agents/reports/cross-origin-states-spike.md` assesses each against the "measured, never faked" invariant, `capture.json` shape impact, eval offline-replayability, and failure degradation, and recommends **Strategy A (a2, `context.request` re-fetch)** with a ~1–2 day follow-up estimate. No `lib/`, `eval/corpus/*`, or `lib/schema.ts` changes — deliverable is the report only, per spike scope.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Two-origin fixture reproducing the cross-origin skip | `states-fixture.mts` (scratch, deleted) | ✅ |
| 2 | Prototype Strategy A (route interception + `context.request` re-fetch, detached-document re-parse) | `states-prototype-a.mts` (scratch, deleted) | ✅ |
| 3 | Prototype Strategy B (CDP `CSS.forcePseudoState` + computed-style diff, restoration + timing checks) | `states-prototype-b.mts` (scratch, deleted) | ✅ |
| 4 | Prototype Strategy C (CDP CSS-domain `getStyleSheetText`) | `states-prototype-c.mts` (scratch, deleted) | ✅ |
| 5 | Rejected alternatives + assessment matrix | folded into report §2/§3 | ✅ |
| 6 | Write `.agents/reports/cross-origin-states-spike.md` | `.agents/reports/cross-origin-states-spike.md` | ✅ |
| 7 | Delete scratch artifacts, confirm no repo pollution | — | ✅ |

## Validation Results

| Check | Result |
|-------|--------|
| Type check (`npm run typecheck`) | ✅ clean |
| Lint (`npm run lint`) | ✅ clean |
| Eval (`npm run eval`) | ✅ unaffected — `aggregate combined: 100%`, all gates passed, fixtures unchanged |
| E2E (plan's prototype chain) | ✅ reproduction confirmed; A (both variants) and B and C all recovered cross-origin deltas; 404-sheet negative case degraded to omitted fields with no throw; B restored base state (`restoredToBase: true`) |

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `.agents/reports/cross-origin-states-spike.md` | CREATE | The spike deliverable |
| `states-fixture.mts`, `states-prototype-{a,b,c}.mts` | CREATE, then DELETE | Scratch prototypes/fixtures; deleted after validating findings, not committed |

## Deviations from Plan

None. All three issue-#39 acceptance-criteria bullets are answered by the report (§2 candidate strategies with trade-offs + rejected alternatives, §3 per-candidate impact matrix, §4 recommendation + rough estimate). Two scratch-script fixes during prototyping were mechanical, not scope deviations: a `*/` sequence inside a JSDoc comment terminated the block early, and `CSS.enable` requires `DOM.enable` first (the latter is documented in the report as a Strategy C implementation gotcha).

## Tests Written

None — this is a research spike per its Metadata table (`Type: SPIKE`); validation was the prototypes' own inline checks (same-origin control parity, 404 degradation, base-state restoration, timing), run via `npx tsx` from the project root and inspected manually, then discarded per the plan's scratch-file convention. `npm run eval` passed unchanged, confirming no prototype code leaked into the committed extraction path.
