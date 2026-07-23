# Code Review: feature/dist-025-nav-buttons-navitem

**Scope**: Branch `feature/dist-025-nav-buttons-navitem` diffed against `main`, including uncommitted changes (1 file: `lib/extract/recipes.ts`, +6/-2)
**Recommendation**: APPROVE (with minor observations)

## Summary

Small, well-scoped change to `classify()` in the recipes stage: button-like nodes (`<button>`, interactive `<input>`) with `inNav: true` now route to NavItem before the generic Button branch, mirroring the pre-existing `<a inNav>` → NavItem rule. The refactor into a single `isButtonLike` predicate preserves the original semantics for every non-nav node, and the order-sensitivity comment follows the file's established convention for order-dependent branches.

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions (Low)

1. `lib/extract/recipes.ts:20-25` — By folding interactive `<input>`s into `isButtonLike`, an `<input type="submit">` inside a `<nav>` (e.g. a search form embedded in the header nav) now classifies as NavItem rather than Button. This is a deliberate parity extension consistent with the grouping, but it goes slightly beyond the issue's literal ask (`<button>`s only); worth being aware that nav-embedded search-submit inputs move class.
2. Coverage — no committed eval fixture exercises the new `inNav`-button branch (neither corpus capture contains a nav `<button>`), so the regression gate cannot lock this behavior in. This complies with the project's stated policy (don't refresh fixtures just to exercise a new lane; verify via a synthetic scratch fixture), but a future capture-shape refresh could add a nav dropdown `<button>` to `eval/fixtures/clean-light.html` to make the behavior regression-guarded.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | PASS |
| Tests (`npm run eval`) | PASS — clean-light 100%, dark-mode 100%, all gates, no baseline change |

## What's Good

- Minimal diff that fixes the reported `Button: padding 0px` pollution at the correct layer (classification), not by special-casing padding math.
- The `isButtonLike` refactor removes duplication between the two Button branches rather than adding a third condition.
- Comments preserved/extended per the file's convention: the relocated `<input>` note stays attached to the predicate, and the new branch documents *why* order matters.
- No measured-never-faked violations: no new synthesized values, no schema surface change, no styleDump change (the `inNav` flag was already node-agnostic).

## Recommendation

Approve. The two Low observations are informational; no code changes required before commit/PR.
