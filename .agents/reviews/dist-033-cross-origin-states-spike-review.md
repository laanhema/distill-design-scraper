# Code Review: dist-033-cross-origin-states-spike

**Scope**: Branch `feature/dist-033-cross-origin-states-spike` vs `main` — docs-only spike artifacts (no production code): `.agents/plans/completed/dist-033-cross-origin-states-spike-plan.md`, `.agents/reports/cross-origin-states-spike.md`, `.agents/reports/dist-033-cross-origin-states-spike-report.md`
**Recommendation**: APPROVE (with one nit)

## Summary

Reviewed the three spike artifacts for issue #39 (DIST-033) on their own merits: factual accuracy of codebase references, fidelity of reported prototype evidence, conformance to the repo's spike house style (`motion-spike.md` precedent), and coverage of the issue's three acceptance criteria. The work is a time-boxed research spike with no `lib/`, schema, emit, or `eval/corpus/*` changes, which matches the issue scope exactly. All file:line references spot-checked against the current tree resolve correctly (`styleDump.ts:401-409` cross-origin skip, `states.ts:91` undefined-when-empty, `ingest.ts:171-180` dark-pass envelope, `ingest.ts:210-271` panorama scroll bookkeeping). Prototype outputs reproduced in the report are internally consistent (same-origin control parity, identical values across strategies A/B/C, 404 degradation, base-state restoration, plausible timings).

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions

- **Low — `.agents/reports/cross-origin-states-spike.md` §2 (Strategy A):** the a2 variant enumerates only top-level `document.styleSheets` hrefs, so a cross-origin sheet pulled in via `@import` inside an *inline* `<style>` block is discoverable (its `CSSImportRule.href` is readable in the same-origin sheet) but would not be re-fetched by the prototyped acquisition. The report documents the "don't follow `@import` inside fetched sheets" skip, but not this sibling case. Impact is minor — it degrades to omitted fields, consistent with the "measured, never faked" posture — but one sentence naming the gap would make the follow-up implementation story less likely to rediscover it. Not blocking for a spike write-up.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | PASS |
| Eval (`npm run eval`) | PASS — aggregate combined 100%, all gates passed, fixtures untouched |

Independently re-verified during review: the report's claim that `page.context().request` carries the browser context's cookies **and** user agent — confirmed true on the installed Playwright 1.61.1 via a scratch echo-server check (context UA and cookie both present on `ctx.request.get`). Also confirmed the Strategy C gotcha the report documents (`CSS.enable` requires `DOM.enable` first) — reproduced as a protocol error before the documented fix.

## What's Good

- Reproduction-first approach: the baseline failure is demonstrated with the *unmodified* production `collectStyleDump` before any candidate is prototyped, so every strategy is measured against real current behavior.
- All three candidates plus three rejected alternatives are assessed on exactly the axes the issue's acceptance criteria demand (capture-shape impact, offline replayability, failure degradation), with the load-bearing capture-time/extract-time constraint (`extractFromCapture` must stay browser-free) correctly identified as disqualifying any extract-time strategy by construction.
- Recommendation is the minimal-delta option and the estimate honors the fixture policy (coverage refresh in the same PR as the capture change).
- Honest-negative-case discipline throughout: 404 sheet, JS-guarded states, and `@import` skips are all treated as omitted fields, never errors or fabrications.

## Recommendation

Approve. Optionally fold the `@import`-in-inline-style note (above) into the spike report or the eventual follow-up story before merging; either way it should not block the PR.
