# Code Review: feature/dist-048-dedupe-cssom-state-scanners

**Scope**: Diff of `feature/dist-048-dedupe-cssom-state-scanners` against `main`, including uncommitted changes (working tree matches branch tip — no commits ahead of `main` yet).
**Recommendation**: APPROVE

## Summary

The change consolidates the two independently-drifted `:hover`/`:focus-visible` CSSOM scanners in `lib/extract/styleDump.ts` (same-origin walk + cross-origin re-fetch pass) into one module-scope `createStateScanner()` factory, shipped into both `page.evaluate` calls via `.toString()` + `new Function` reconstruction. This fixes a real bug (the cross-origin copy's `STATE_PROPS` mapped to camelCase computed-property names that `getComputedStyle().getPropertyValue()` silently never matches, so only `color` ever survived there) and, as an explicitly-documented side effect, applies the same-origin pass's `record.interactive` gate to the cross-origin pass too (previously ungated). Only `lib/extract/styleDump.ts` changed; no other files in the repo were touched.

Independently verified: `npm run typecheck`, `npm run lint`, and `npm run eval` all pass clean, and `eval/baseline.json` is untouched (git diff empty), confirming the same-origin scan path — the only one committed eval fixtures exercise — is behaviorally unchanged. Also independently tested the one real risk this refactor introduces (a page-side `new Function(...)` call inside `page.evaluate`, which is new to this file): built a throwaway Playwright script against a page serving `Content-Security-Policy: script-src 'self'` and confirmed `new Function` inside `page.evaluate` still executes — Playwright's CDP-driven evaluation bypasses page CSP, so this is not a regression risk for CSP-strict target sites. Scratch script deleted after the check.

## Issues Found

### Critical
None.

### High Priority
None.

### Medium Priority
None.

### Suggestions
None. (Considered and rejected two potential nits: (1) the shared scanner re-declares keyframe-shape object types inline rather than reusing the file's exported `KeyframeDef`/`KeyframeStep` — but this duplication predates the branch, verified present in `main` at the same call sites, so it's not a regression introduced here; (2) whether `getRecord` creating throwaway `recordsById` entries for non-interactive cross-origin matches before the interactive check is wasteful — negligible, and results are filtered before return, so no observable effect.)

## Validation Results

| Check | Status |
|-------|--------|
| Type Check | PASS |
| Lint | PASS |
| Eval (regression gate) | PASS — clean-light 100%, dark-mode 100%, aggregate 100%, baseline untouched |

## What's Good

- The interactive-gate behavior change (a real, separate bug beyond the literal STATE_PROPS ask) is explicitly called out in the plan, the implementation report, and the code comments rather than silently smuggled in — matches the "measured, never faked" / no-hidden-behavior-change ethos of this codebase.
- The self-containment constraint on `createStateScanner` (no closures over anything outside its own body, since only its serialized text crosses the page boundary) is respected — verified `STATE_PROPS`/`resolveVarRefs`/`applyRule`/`scanRules` are each defined exactly once, all inside the factory.
- Merge-only semantics at the Node-side merge point (same-origin value always wins; cross-origin only fills in missing properties) are untouched, as required.
- A live two-origin Playwright render (documented in `.agents/reports/dist-048-dedupe-cssom-state-scanners-report.md`) was used to prove the fix, since no committed eval capture exercises cross-origin stylesheets — the correct verification path per this repo's `CLAUDE.md` ("Manually verifying extraction changes"), and the scratch script was deleted afterward (`git status` confirms no stray scratch files).

## Recommendation

Approve as-is. No changes requested.
