# Implementation Report

**Plan**: `.agents/plans/completed/dist-027-recipe-variant-label-plan.md`
**Branch**: `feature/dist-027-recipe-variant-label`
**Status**: COMPLETE

## Summary

Recipe entries now carry an optional, measured `variant` label derived from the DIST-026 background-role cluster key (`primary`-style palette role, raw hex, or `transparent` for the no-background cluster). The label is stamped only when an element class kept more than one variant cluster, so single-variant classes — and every old committed capture — produce entries and rendered lines byte-identical to before. `renderRecipes` shows the label as `**Button (transparent)** — …`.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Add optional `variant` to `recipeEntrySchema` + doc comment | `lib/schema.ts` | ✅ |
| 2 | Carry cluster keys through `kept`; stamp `variant` when >1 cluster survives; surface `NO_BACKGROUND_KEY` as `transparent` | `lib/extract/recipes.ts` | ✅ |
| 3 | Render `**Element (variant)**` when `variant` present | `lib/emit.ts` | ✅ |

## Validation Results

| Check | Result |
|-------|--------|
| Type check (`npm run typecheck`) | ✅ |
| Lint (`npm run lint`) | ✅ |
| Eval (`npm run eval`, no baseline refresh) | ✅ (clean-light 100%, dark-mode 100%, all gates passed) |
| E2E scratch script | ✅ (see below) |

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/schema.ts` | UPDATE | +5/-1 |
| `lib/extract/recipes.ts` | UPDATE | +17/-5 |
| `lib/emit.ts` | UPDATE | +2/-1 |

## Deviations from Plan

None.

## Tests Written

No unit test framework exists in this repo (per CLAUDE.md, `npm run eval` is the correctness gate). The change was exercised via:

- `npm run eval` — passes unchanged with no baseline refresh (recipes are not scored by `eval/score.ts`, and old captures produce no `variant` field, confirming the "nothing fabricated" acceptance criterion).
- A temporary scratch E2E script (deleted after use, per CLAUDE.md policy): local `http.createServer` fixture with 4 filled + 4 ghost buttons and links, driven through `renderUrl` (`SSRF_ALLOWLIST_HOSTS=localhost`) → `captureFromRender` → `extractFromCapture`. Verified:
  - two `Button` entries, one with a bg-role-derived `variant` and one with `variant: "transparent"`;
  - markdown renders `**Button (surface)**` / `**Button (transparent)**`;
  - the single-cluster `TextLink` entry has no `variant` and renders with no parenthesized suffix (byte-identical to pre-change output).
