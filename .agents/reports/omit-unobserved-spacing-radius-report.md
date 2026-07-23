# Implementation Report

**Plan**: `.agents/plans/completed/omit-unobserved-spacing-radius-plan.md`
**Branch**: `feature/omit-unobserved-spacing-radius`
**Issue**: #16 (DIST-010)
**Status**: COMPLETE

## Summary

`extractSpacing` and `extractRadius` no longer fall back to hardcoded default scales stamped `provenance: "measured"` when the style dump contained no observable values — they now return `undefined`, and the lane is omitted end-to-end (frontmatter, body section, CSS-variables block). `ExtractedTokens.spacing`/`.radius` became optional; all downstream plumbing (`buildReport` conditional spreads, gated `renderSpacing`/`renderRadius`, optional-chained structure-lane consumers) already handled absence, so no other file needed a code change.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | `extractSpacing` returns `undefined` on empty scale (removed `[4, 8, 16, 24, 32, 48, 64]` fallback) | `lib/extract/tokens.ts` | Done |
| 2 | `extractRadius` returns `undefined` on empty scale (removed `["4px","8px","16px","9999px"]` fallback) | `lib/extract/tokens.ts` | Done |
| 3 | `ExtractedTokens.spacing`/`.radius` made optional | `lib/extract/tokens.ts` | Done |
| 4 | Verify plumbing through `lib/analyze.ts` → `buildReport` | `lib/analyze.ts` | Verified — no edit needed (typecheck clean) |
| 5 | Eval gate | — | Passed, scores unchanged |

## Validation Results

| Check | Result |
|-------|--------|
| Type check (`npm run typecheck`) | Pass |
| Lint (`npm run lint`) | Pre-existing failure: repo has no ESLint config, `next lint` prompts interactively (not caused by this change) |
| Eval (`npm run eval`) | Pass — clean-light 100%, dark-mode 100%, aggregate 100%, all gates passed (unchanged vs. baseline) |
| E2E (synthetic offline capture) | Pass — see below |

## End-to-End Verification

Scratch script (run via `npx tsx` from project root, deleted after use) built two synthetic captures and ran `extractFromCapture`:

- **No observations** (nodes without layout data): `spacing`/`radius` absent from the report object, no `spacing:`/`radius:` in YAML frontmatter, no `## Spacing`/`## Radius` body sections, no `--space-*`/`--radius-*` CSS variables.
- **Real observations** (margins/paddings of 8/16px, 6px border-radius): `spacing.scale = [8, 16]`, `radius.scale = ["6px"]` — measurements still flow through.

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/extract/tokens.ts` | UPDATE | +13/-6 |

## Deviations from Plan

None.

## Tests Written

No unit test framework exists in this repo (per CLAUDE.md, `npm run eval` is the correctness gate). Verification was done via the eval gate plus the synthetic E2E scratch script described above, which was deleted after use per project convention.
