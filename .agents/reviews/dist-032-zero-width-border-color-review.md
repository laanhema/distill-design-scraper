# Code Review: feature/dist-032-zero-width-border-color

**Scope**: Branch `feature/dist-032-zero-width-border-color` — diff against `main` (commit `1d1b6d8`, plus working tree)
**Recommendation**: APPROVE

## Summary

One-file change to `lib/extract/styleDump.ts`: the `border` color channel is now sourced from the node's widest *visible* border side (width > 0, style ≠ `none`/`hidden`) instead of unconditionally from `border-top-color`. This closes the leak where a zero-width side's default `currentColor` (typically `#000000`) claimed the border channel on nodes with single-sided visible borders, which then won `borderScore` in the palette. The change is small, well-commented, self-contained inside the `page.evaluate` callback (no imports, plain DOM APIs — the load-bearing constraint for this file), and leaves the dump shape untouched so all consumers (`palette.ts`, `recipes.ts`, `states.ts`) and frozen eval fixtures are unaffected.

## Issues Found

### Critical

None

### High Priority

None

### Medium Priority

None

### Suggestions

- `lib/extract/styleDump.ts:282` (pre-existing, out of scope): the CSSOM hover/focus `STATE_PROPS` map still reads the `from` baseline for `border-color` from `border-top-color`. If a node's top side is zero-width, a reported hover border delta's `from` can show the invisible side's default color. Same class of issue, much lower impact (only surfaces in the `states` lane for interactive elements with declared hover border rules). Worth a follow-up note, not a blocker.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | PASS |
| Tests (`npm run eval`) | PASS — unchanged, no baseline refresh (aggregate combined 100%) |
| Synthetic fixture (scratch Playwright script, deleted) | PASS — only the visible side's color observed; `#000000`/`#ff0000` absent |

## What's Good

- Root cause fixed at the right layer (dump level), so every downstream consumer benefits without any of them changing.
- Widest-side selection is a sensible tie-break for multi-sided borders; first-visible-side ordering keeps ties deterministic (top wins).
- `hidden` excluded alongside `none` — both paint nothing; correct semantic.
- Transparent widest side handled: `opaqueColor` returning null doesn't poison `bestWidth`, so a narrower opaque side still wins.
- Honest-measurement invariant preserved: a visible border whose color genuinely *is* `currentColor`/black is still reported black — only unpainted sides are excluded.
- Comment explains the failure mode and why `hidden` is treated like `none`.

## Recommendation

Approve. Proceed to PR; optionally file the hover-`from` baseline observation as a low-priority follow-up.
