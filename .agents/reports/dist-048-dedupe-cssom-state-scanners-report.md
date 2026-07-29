# Implementation Report

**Plan**: `.agents/plans/dist-048-dedupe-cssom-state-scanners-plan.md`
**Branch**: `feature/dist-048-dedupe-cssom-state-scanners`
**Status**: COMPLETE

## Summary

`lib/extract/styleDump.ts` had two independently-drifted copies of the `:hover`/`:focus-visible` CSSOM scanner: the same-origin pass (inside the main `page.evaluate`) and the cross-origin re-fetch pass (a separate `page.evaluate` per re-fetched stylesheet). The cross-origin copy's `STATE_PROPS` mapped to camelCase computed-property names (`backgroundColor`, `borderColor`, `boxShadow`), but `getComputedStyle().getPropertyValue()` only accepts kebab-case, so `from` was always `""` for those three properties and only `color` ever survived. `resolveVarRefs` had also drifted (3-pass vs 5-pass, different fallback regex).

The fix consolidates `STATE_PROPS`, `resolveVarRefs`, `applyRule`, and `scanRules` into one new module-scope function, `createStateScanner()`, defined once above `collectStyleDump`. Its source is captured via `.toString()` and reconstructed inside both `page.evaluate` calls via `new Function("return (" + scannerSrc + ")")()()`. Each call site still supplies its own way of locating "the record for this element" via a `getRecord` callback — a live `Map` lookup in the same-origin pass, a `data-distill-id`-keyed lookup (with lazily-created records) in the cross-origin pass — preserving the merge-only invariant and each pass's different DOM reality while the scanning logic now exists exactly once.

As an explicitly-scoped side effect (per the plan and issue AC), unifying `applyRule` also closed a second, latent bug: the cross-origin pass previously matched *any* element with a `data-distill-id`, interactive or not, never checking `record.interactive`. It now shares the same interactive gate as the same-origin pass.

`resolveVarRefs`: per the plan's explicit instruction, the same-origin 3-pass variant (including its exact regex) was kept as the sole survivor over the cross-origin 5-pass variant, both because the instruction was unambiguous and because it's the only choice that guarantees the same-origin path stays byte-identical for `npm run eval`.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Define `createStateScanner()` shared scanner factory at module scope | `lib/extract/styleDump.ts` | ✅ |
| 2 | Wire the reconstructed scanner into the same-origin pass | `lib/extract/styleDump.ts` | ✅ |
| 3 | Wire the reconstructed scanner into the cross-origin pass (incl. interactive-gate fix) | `lib/extract/styleDump.ts` | ✅ |
| 4 | Full-file review pass | `lib/extract/styleDump.ts` | ✅ |
| 5 | Regression gate — same-origin path byte-identical | n/a (verification) | ✅ |
| 6 | Live two-origin render verification | scratch `dist-048-verify.mts` (created, then deleted) | ✅ |

## Validation Results

| Check | Result |
|-------|--------|
| `npm run typecheck` | ✅ pass, zero errors |
| `npm run lint` | ✅ pass, zero errors/warnings |
| `npm run eval` | ✅ pass — `clean-light` 100%, `dark-mode` 100%, aggregate 100%, `eval/baseline.json` untouched (no `UPDATE_BASELINE` run) |
| Live two-origin render (Task 6, scratch script) | ✅ pass — see below |

### Live two-origin render output (Task 6)

Two local `http.createServer` instances stood up on ports 4001 (page) and 4002 (stylesheet, no CORS headers), page rendered via `renderUrl` with `SSRF_ALLOWLIST_HOSTS=localhost`. Result on `render.styleDump.nodes`:

- `#btn` (a `<button>`, interactive) — hover state captured all four properties with distinct, non-empty `from`/`to`:
  - `background-color`: `rgb(17, 17, 17)` → `rgb(255, 0, 0)`
  - `color`: `rgb(51, 51, 51)` → `rgb(255, 255, 255)`
  - `border-color`: `rgb(34, 34, 34)` → `rgb(0, 255, 0)`
  - `box-shadow`: `none` → `rgb(0, 0, 255) 0px 0px 10px`
- `#nonhover` (a plain `<div>`, non-interactive) — `states` was `undefined`, confirming the interactive gate now applies on the cross-origin path too.
- No `__name is not defined` error — the existing shim (which runs before both `page.evaluate` calls and persists on `globalThis`) covered the reconstructed function without new plumbing.

Scratch script deleted after use; `git status` confirmed clean (only `lib/extract/styleDump.ts` modified).

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/extract/styleDump.ts` | UPDATE | +244/-249 |

No other files changed — `NodeStyle.states` shape, `Capture`/`StyleDump` types, and every downstream consumer (`states.ts`, `motion.ts`, `eval/scoreStructure.ts`, etc.) are unaffected, as anticipated by the plan.

## Deviations from Plan

None of substance. Implementation followed the plan's task breakdown, code shapes, and the maintainer's explicit `resolveVarRefs` 3-pass choice exactly. Minor mechanical differences from the plan's illustrative snippets (e.g. exact variable/type annotation placement, a `StateRecord` type alias declared locally inside `createStateScanner` for the `applyRule`/`scanRules` parameter types) were needed to satisfy `tsc --noEmit` under the project's strict settings, but they implement the same contract the plan specified — one scanner definition, reconstructed via `new Function` at both call sites, `getRecord`/`onKeyframe` callback seams replacing the old closures.

## Tests Written

No unit test framework exists in this project (per `CLAUDE.md`); the plan-specified correctness gates were used instead:

| Verification | Coverage |
|--------------|----------|
| `npm run eval` | Regression gate proving the same-origin scan path (the only path committed eval fixtures exercise) is byte-identical to before the refactor |
| Scratch script `dist-048-verify.mts` (deleted after use) | Live two-origin Playwright render exercising the cross-origin re-fetch path directly — the only way to reproduce the bug and prove the fix, since no committed capture exercises cross-origin stylesheets |
