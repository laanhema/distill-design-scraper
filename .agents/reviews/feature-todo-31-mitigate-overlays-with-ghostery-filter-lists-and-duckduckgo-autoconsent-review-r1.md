# Code Review: feature/todo-31-mitigate-overlays-with-ghostery-filter-lists-and-duckduckgo-autoconsent

**Scope**: branch `feature/todo-31-mitigate-overlays-with-ghostery-filter-lists-and-duckduckgo-autoconsent` vs `main` (commit base `24496f4`, uncommitted changes; `.agents/issues/todo-issues.md` excluded as unrelated per caller instruction)
**Recommendation**: APPROVE

## Summary

Re-reviewed overlay and consent mitigation implementation introducing Ghostery adblocker filter lists and DuckDuckGo autoconsent into the URL rendering pipeline (`lib/mitigation/`, `lib/ingest.ts`, `package.json`, `package-lock.json`) following fixes for findings H1, M1, and M2. The premature 500ms top-window evaluate check in `waitForAutoconsent` has been eliminated so consent dialogs in iframes are not cut short, consent action regexes now strictly verify positive results (`\s+true\b`), and `CaptureAccess.mitigations` provenance only stamps filter lists when the engine actually initialized them. Validation passed cleanly across typecheck, lint, Next.js build, and offline eval (100% aggregate score).

Acceptance criteria assessment:
- **`@ghostery/adblocker-playwright` and `@duckduckgo/autoconsent` added to dependencies**: Met. Both packages are added to `dependencies` in `package.json` (`^2.20.3` and `^17.2.0`) and locked in `package-lock.json`.
- **Ghostery blocker initialized once per process from cached/serialized filter lists and enabled in `page` before navigation**: Met. Handled via module singleton `blockerPromise` and serialized binary cache at `node_modules/.cache/distill/filters.bin` (~38ms load), enabled prior to `page.goto`.
- **Autoconsent bundle injected via `page.addInitScript` before navigation, and waits after navigation for an `autoconsentDone` message, no-CMP result, or short timeout cap**: Met. Bundle injected via `page.addInitScript`; `waitForAutoconsent` polls across all frames until completion or the 1500ms timeout cap, with prior finding H1 resolved.
- **Applied filter lists and consent actions recorded as `Mitigation` entries in `CaptureAccess.mitigations`**: Met. Filter lists are only stamped when active (resolving M2), and consent actions are only recorded when matching `\s+true\b` (resolving M1).
- **Network filter-list fetching runs with retries or reads cached copies; filter engine initialization does not stall the request path**: Met. `fetchWithRetry` performs retries with backoff, cache deserialization loads in ~38ms, and offline initialization falls back safely to an empty blocker without throwing.
- **`npm run check` passes**: Met. Verified cleanly on host.

## Fix Verification

| ID | Status | Evidence |
|----|--------|----------|
| H1 | fixed | `lib/mitigation/consent.ts:70-76` — removed premature 500ms top-window evaluate check; loop polls until `tracker.isDone \|\| tracker.noCmp` or timeout cap (1500ms) |
| M1 | fixed | `lib/mitigation/consent.ts:34-43` — opt-out and opt-in regexes now require `\s+true\b`, preventing failed actions from registering as mitigations |
| M2 | fixed | `lib/mitigation/engine.ts:48-92`, `lib/mitigation/index.ts:21-23` — engine tracks `filterListsActive` and `collectMitigations` checks `isFilterEngineActive()` before recording `APPLIED_FILTER_LISTS` |

## Issues Found

### Critical

None

### High Priority

None

### Medium Priority

None

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

- Direct, clean fixes for H1, M1, and M2 that preserve architectural boundaries and adhere strictly to the "measured, never faked" principle.
- Blocker deserialization from cache is fast (~38ms) and resilient offline.
- Additive wiring into `CaptureAccess.mitigations` without changing offline eval behavior or fixture expectations.

## Recommendation

APPROVE. All acceptance criteria and prior review findings are satisfied.
