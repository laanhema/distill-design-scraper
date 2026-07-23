# Implementation Report

**Plan**: `.agents/plans/completed/dist-025-nav-buttons-navitem-plan.md`
**Branch**: `feature/dist-025-nav-buttons-navitem`
**Status**: COMPLETE

## Summary

Nav dropdown-trigger `<button>`s are now classified as NavItem instead of Button in the recipes stage. `classify()` in `lib/extract/recipes.ts` folds the two button-like branches (`<button>`, interactive `<input>`) into one `isButtonLike` check and routes `isButtonLike && inNav === true` to NavItem before the generic Button branch — mirroring the existing `<a inNav>` → NavItem rule. No `styleDump.ts` change was needed: the dump walk already stamps `inNav` on every node with a `nav`/`[role="navigation"]` ancestor (`lib/extract/styleDump.ts:269`), verified for buttons via the E2E fixture.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Route nav buttons to NavItem in `classify()` | `lib/extract/recipes.ts` | Done |
| 2 | E2E verification against synthetic nav-dropdown fixture | scratch script (deleted after use) | Done |

## Validation Results

| Check | Result |
|-------|--------|
| Type check (`npm run typecheck`) | Pass |
| Lint (`npm run lint`) | Pass |
| Eval (`npm run eval`) | Pass — clean-light 100%, dark-mode 100%, all gates passed, **no baseline refresh** |
| E2E scratch verification | Pass |

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/extract/recipes.ts` | UPDATE | +6/-2 |

## Deviations from Plan

None. The plan's prediction held: neither committed eval capture contains a nav `<button>`, so eval output was unchanged and no baseline update was required.

## Tests Written

No unit test framework exists in this project (per CLAUDE.md, `npm run eval` is the correctness gate). The change was exercised through:

- `npm run eval` (regression gate, passed unchanged), and
- a temporary scratch script (deleted after use, per project convention) that rendered a synthetic `file://` fixture — a `<nav>` with 2 links + 3 unstyled dropdown-trigger `<button>`s (`padding: 0`, transparent bg) and 2 real styled body buttons (`padding: 12px 24px`, brand bg) — through `capturePage` + `extractFromCapture`. Observed:
  - 3 nav `<button>` nodes carried `inNav: true` in the style dump; 2 body buttons did not.
  - Button recipe: `padding "12px 24px"`, `radius "8px"`, resolved bg role — reflecting only the real buttons (pre-fix, the 3 zero-padding nav triggers would have won the mode: `padding 0px`).
  - NavItem recipe present, absorbing the nav triggers alongside the nav links.
