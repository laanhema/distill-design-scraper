# Code Review: feature/todo-31-mitigate-overlays-with-ghostery-filter-lists-and-duckduckgo-autoconsent

**Scope**: branch `feature/todo-31-mitigate-overlays-with-ghostery-filter-lists-and-duckduckgo-autoconsent` vs `main` (commit base `24496f4d`, uncommitted changes; `.agents/issues/todo-issues.md` excluded as unrelated per caller instruction)
**Recommendation**: NEEDS CHANGES

## Summary

Reviewed overlay and cookie mitigation implementation introducing Ghostery adblocker filter lists and DuckDuckGo autoconsent into the URL rendering pipeline (`lib/mitigation/`, `lib/ingest.ts`, `package.json`, `package-lock.json`). Validation passed cleanly across typecheck, lint, Next.js build, and offline eval (100% aggregate score). However, `waitForAutoconsent` introduces a premature 500ms early-exit check evaluating only the top-level window, which cuts the wait loop short before the configured timeout cap and abandons waiting for consent managers inside iframes (such as Sourcepoint), directly impacting a primary objective of issue #227.

Acceptance criteria assessment:
- **`@ghostery/adblocker-playwright` and `@duckduckgo/autoconsent` added to dependencies**: Met. Both packages are added to `dependencies` in `package.json` (`^2.20.3` and `^17.2.0`) and locked in `package-lock.json`.
- **Ghostery blocker initialized once per process from cached/serialized filter lists and enabled in `page` before navigation**: Met. Handled via module singleton `blockerPromise` and serialized binary cache at `node_modules/.cache/distill/filters.bin`, enabled prior to `page.goto`.
- **Autoconsent bundle injected via `page.addInitScript` before navigation, and waits after navigation for an `autoconsentDone` message, no-CMP result, or short timeout cap**: Unmet (see H1). Hardcoded 500ms top-window check aborts the wait loop before the timeout cap and ignores iframes.
- **Applied filter lists and consent actions recorded as `Mitigation` entries in `CaptureAccess.mitigations`**: Met with nits (see M1, M2). Recorded properly in `CaptureAccess.mitigations`, but failed opt-out actions (`result: false`) are recorded as valid mitigations, and fallback empty blockers still stamp list names.
- **Network filter-list fetching runs with retries or reads cached copies; filter engine initialization does not stall the request path**: Met. `fetchWithRetry` performs retries with backoff, cache deserialization loads in ~23ms, and initialization is deferred to render calls.
- **`npm run check` passes**: Met. Verified cleanly on host.

## Issues Found

### Critical

None

### High Priority

- **H1** `lib/mitigation/consent.ts:76` — `waitForAutoconsent` aborts waiting after 500ms when `page.evaluate()` finds no CMP in the top-level window, ignoring iframes and cutting the wait short before the timeout cap. **Why:** If a CMP is hosted in an iframe (such as Sourcepoint) or takes slightly more than 500ms to detect, the top window's `autoconsentStandalone.messages` has no CMP detected at 500ms; `hasCmp === false` triggers an immediate loop `break`, abandoning the consent negotiation and failing acceptance criterion 3. **Fix:** Remove the premature 500ms top-window `page.evaluate` early exit, or check across all frames and only abort when `Date.now() - start >= cap` or when autoconsent explicitly signals completion / no-CMP.

### Medium Priority

- **M1** `lib/mitigation/consent.ts:35` — `setupAutoconsent` parses `autoconsent opt-out result:` without verifying whether the result was `true`. **Why:** `@duckduckgo/autoconsent` logs `autoconsent opt-out result: <cmp> <boolean>`; when opt-out fails (`false`), regex `/autoconsent opt-out result:\s*([^\s]+)/` still matches and populates `tracker.detectedCmp` and `tracker.action`, causing Distill to record a successful consent mitigation in `CaptureAccess.mitigations` despite failed dismissal, violating the "measured, never faked" principle. **Fix:** Require `true` in the match pattern (e.g., `/autoconsent opt-out result:\s*([^\s]+)\s+true/i` or parse the boolean result argument).
- **M2** `lib/mitigation/index.ts:20` — `collectMitigations` unconditionally records `APPLIED_FILTER_LISTS` even when `initBlocker()` in `engine.ts` fell back to `PlaywrightBlocker.empty()`. **Why:** When remote fetching fails offline and no cache exists, Ghostery initialization falls back to `PlaywrightBlocker.empty()`, yet `CaptureAccess.mitigations` still stamps `{ kind: "filterLists", lists: APPLIED_FILTER_LISTS }` as if filter lists were active. **Fix:** Track whether the blocker engine loaded filter lists successfully versus falling back to empty, and only record the `"filterLists"` mitigation entry when lists are actually active.

### Suggestions (Low)

None

**Noted, not a finding**:
- Following the architectural spike in `.agents/reports/overlay-mitigation-spike.md`, multi-tile re-checks, dialog closing, and generic overlay hiding heuristics (Option C) were explicitly scoped out of issue #227 and scheduled for follow-up issue #228 (TODO-32).

## Validation Results

| Check | Status | Notes |
|-------|--------|-------|
| Build / Type Check | PASS | `npm run check` (`tsc --noEmit`, Next.js 15.5.20 build) — host |
| Warnings | NONE | 0 warnings across typecheck, lint, build, and eval |
| Lint | PASS | `npm run check` (`eslint .`) — host |
| Tests | PASS | `npm run check` (`eval/run.ts` — 5/5 corpus fixtures, 100% aggregate combined score) — host |
| UI verification | N/A | No user interface components, styles, or client-side markup touched (`lib/` only) |

## What's Good

- Clean architectural separation of mitigation logic into `lib/mitigation/` submodules (`engine.ts`, `consent.ts`, `index.ts`), keeping `lib/ingest.ts` focused on orchestration.
- Disk serialization via `filters.bin` provides fast (~23ms) engine loading while keeping large GPLv3 filter lists out of repository version control.
- Lazy blocker initialization prevents unnecessary network fetches or filesystem reads during `next build` static export and offline eval execution.
- Additive `CaptureAccess.mitigations` wiring preserves 100% compatibility with existing offline corpus fixtures.

## Recommendation

Address finding H1 to ensure consent managers in iframes and slower-loading CMPs are not abandoned prematurely at 500ms, and update M1 and M2 to maintain strict "measured, never faked" provenance reporting in `CaptureAccess.mitigations`.
