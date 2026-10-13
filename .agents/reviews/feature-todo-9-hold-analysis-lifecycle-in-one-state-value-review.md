# Code Review: feature/todo-9-hold-analysis-lifecycle-in-one-state-value

**Scope**: branch `feature/todo-9-hold-analysis-lifecycle-in-one-state-value` (vs merge base `a347bd5`, including uncommitted changes)
**Recommendation**: APPROVE WITH NITS

## Summary

Reviewed the changes on `feature/todo-9-hold-analysis-lifecycle-in-one-state-value` against GitHub issue #173's acceptance criteria. The eight individual `useState` hooks in `app/page.tsx` were successfully consolidated into a single `AnalysisState` discriminated union, eliminating compound render guards and making lifecycle transitions atomic. `deriveHost` was cleanly extracted as a pure helper anchored to `sourceName` captured in `state` at completion rather than live form inputs.

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions (Low)
- **L1** `app/page.tsx:151` — Inflight `inputMode` toggle during request execution can cause `sourceName` to derive from the newly selected tab's state rather than the response's actual source type. **Why:** If a user submits a URL analysis and toggles to the image tab (with previously selected images) while the analysis is in flight, `sourceName` derives from `images[0].file.name` instead of the URL. **Fix:** Derive `sourceName` using `data.report.source.type === "url"` or capture `submittedMode` at form submission.

## Validation Results

| Check | Status | Notes |
|-------|--------|-------|
| Build / Type Check | PASS | `npm run build` (including `tsc --noEmit`); host |
| Warnings | NONE | Next.js production build finished with 0 warnings |
| Lint | PASS | `npm run lint` (`eslint .`); host |
| Tests | PASS | `npm run eval`: 3/3 required fixtures passed at 100% combined score (clean-light, dark-mode, adversarial-shell); host |
| UI verification | PASS | `verify.sh drive` (`analyze-url`, `tabs-downloads`, `analyze-images`, `tab-layout` across 1280, 1024, 768, 390px viewports); all assertions passed; run `20261013-183318-4051845` |

## What's Good

- Complete and clean replacement of the 8 separate `useState` hooks with a single discriminated union (`AnalysisState`) covering `idle`, `loading`, `error`, and `done`.
- Render guards simplified so `state.result` is accessed safely with no `status === "done" && report && meta` guards.
- State transitions in `analyze` are atomic (single `setState` dispatch per transition).
- `deriveHost` is now a pure top-level helper taking `sourceName` and `defaultHost`, decoupling download filename derivation from live form inputs once an analysis finishes.
- Full offline eval and E2E Playwright verification scenarios pass cleanly without regressions.

## Recommendation

Ready to merge after addressing or accepting the minor suggestion L1.
