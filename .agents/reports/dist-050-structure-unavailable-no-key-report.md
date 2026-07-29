# Implementation Report

**Plan**: `.agents/plans/completed/dist-050-structure-unavailable-no-key-plan.md`
**Branch**: `feature/dist-050-structure-unavailable-no-key`
**Status**: COMPLETE

## Summary

Fixed `analyzeImages` (`lib/analyze.ts`) so that a keyless request for image structure (`mode: "structure"` or `"both"`) sets an explicit `structureUnavailableReason` naming both provider env vars, instead of silently dropping the structure pane. Previously `wantsStructure` conjoined the mode check with `aiLaneAvailable()`, so the whole `Promise.all` branch short-circuited to its `else` arm (`structureUnavailableReason: undefined`) when no key was configured — contradicting the doc comment and the frontend's generic rendering of that field. Also fixed the image-branch caching gate in `app/api/analyze/route.ts`, which previously treated any non-empty `structureUnavailableReason` as transient (never cached); it now distinguishes a persistent no-key reason (safe to cache) from a genuine transient vision-call failure (still skipped from cache), re-deriving the distinction via `aiLaneAvailable()`.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Split `wantsStructure` from the AI-availability check | `lib/analyze.ts` | ✅ |
| 2 | Nest the availability check inside the structure branch, with the no-key reason | `lib/analyze.ts` | ✅ |
| 3 | Make the image-branch caching gate distinguish persistent vs. transient reasons | `app/api/analyze/route.ts` | ✅ |
| 4 | Manually verify all three acceptance-criteria paths (scratch script) | n/a (scratch, deleted after use) | ✅ |
| 5 | Confirm route-level caching decision statically (code inspection) | n/a | ✅ |

## Validation Results

| Check | Result |
|-------|--------|
| Type check (`npm run typecheck`) | ✅ |
| Lint (`npm run lint`) | ✅ |
| Eval (`npm run eval`) | ✅ (aggregate combined 100%, unchanged; `stripe`/`linear`/`vercel` skipped as before — no capture/expected committed for those slugs, pre-existing and unrelated to this change) |

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/analyze.ts` | UPDATE | +25/-13 |
| `app/api/analyze/route.ts` | UPDATE | +10/-2 |

## Deviations from Plan

None in the shipped code — the diff matches the plan's "Patterns to Follow" snippets exactly for both files.

One process deviation in Task 4: the plan suggested writing the scratch script under `/tmp/claude-*/scratchpad/` per the session's scratchpad convention, but CLAUDE.md's "Manually verifying extraction changes" note ("running from outside the project fails to resolve `node_modules` — tsx/esbuild resolves relative to the script's own location") turned out to apply here too — the script imports `sharp` and `@/lib/analyze` via the `@/*` path alias, both of which only resolve when the script lives inside the project tree. Running from `/tmp/.../scratchpad/verify-dist-050.ts` failed with `Cannot find module 'sharp'`. Fix: copied the script to the project root as `scratch-verify-dist-050.ts`, ran it with `npx tsx scratch-verify-dist-050.ts` from the project root, then deleted it immediately after (`git status` confirms no residue). No committed source was affected.

## Tests Written

No unit test framework exists in this repo (per CLAUDE.md, `npm run eval` is the correctness gate for extraction logic, and this change lives outside `lib/extract/**`). Per the plan and CLAUDE.md's "Manually verifying extraction changes" pattern, verification was done via a throwaway `npx tsx` scratch script (deleted after use, not committed):

| Scratch script (deleted) | Assertions |
|---|---|
| `scratch-verify-dist-050.ts` | 1. `analyzeImages(images, "structure")` with both `GEMINI_API_KEY`/`OPENROUTER_API_KEY` unset → `structureUnavailableReason === "Structure inference for images requires an AI key — set GEMINI_API_KEY or OPENROUTER_API_KEY."` and `structureReport === undefined`. 2. `analyzeImages(images, "tokens")` with no key → `structureUnavailableReason === undefined` (structure never requested). Both assertions passed (console.assert with no failures + explicit "All assertions passed." log); no `DegenerateImageError` and no network call observed (expected, since `structureFromImages` is never invoked on the no-key path). |

Static walkthrough (Task 5) of the `app/api/analyze/route.ts` diff confirmed all three caching-gate outcomes by inspection:
- reason `undefined` → `structureFailureIsTransient` false → cached (unchanged).
- reason set + key present (real vision-call failure) → `structureFailureIsTransient` true → not cached (unchanged).
- reason set + no key (new case) → `structureFailureIsTransient` false → now cached (deliberate new behavior).

## Acceptance Criteria

- [x] `mode: "structure"` or `"both"` + image input + no key → `structureUnavailableReason` names both missing keys — verified by scratch script
- [x] Reason renders in the workbench — `app/page.tsx:347-351` unchanged, already renders the field generically
- [x] `mode: "tokens"` + image input + no key → `structureUnavailableReason` stays `undefined` — verified by scratch script
- [x] Image-branch caching gate distinguishes persistent (no-key, cached) vs. transient (vision failure, not cached) — verified by static walkthrough, with explanatory comment in code
- [x] `npm run typecheck` and `npm run lint` both pass
- [x] `npm run eval` passes unchanged (100% aggregate, same as baseline)
- [x] No scratch verification scripts left in the repo
