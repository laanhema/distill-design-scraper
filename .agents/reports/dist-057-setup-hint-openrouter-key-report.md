# Implementation Report

**Plan**: `.agents/plans/completed/dist-057-setup-hint-openrouter-key-plan.md`
**Branch**: `feature/dist-057-setup-hint-openrouter-key`
**Status**: COMPLETE

## Summary

Updated the workbench's setup-hint paragraph in `app/page.tsx` (`Preview` component, rendered when `!meta.aiApplied`) to name both `GEMINI_API_KEY` and `OPENROUTER_API_KEY` as ways to enable the AI lane, instead of naming only `GEMINI_API_KEY`. This brings the hint in line with `aiLaneAvailable()` (`lib/aiLane.ts:23-26`), which accepts either key, and with the wording precedent set by DIST-050's `structureUnavailableReason` message (`lib/analyze.ts:269`). The link text was changed from "Get a free key at" to "Get a free Gemini key at" to keep the link's scope (Google AI Studio only) unambiguous now that two providers are named. No other wording, structure, or styling changed.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Update the setup-hint copy to name both env vars | `app/page.tsx` | ✅ |
| 2 | Verify wording consistency and full-file correctness (inspection only) | n/a | ✅ |

## Validation Results

| Check | Result |
|-------|--------|
| Type check (`npm run typecheck`) | ✅ pass, zero errors |
| Lint (`npm run lint`) | ✅ pass, zero errors |
| Tests | N/A — project has no unit test framework (per `CLAUDE.md`); `npm run eval` not required per the plan since no `lib/extract/**`, `lib/emit.ts`, or `lib/analyze.ts` file was touched |
| Diff scope | ✅ confined to `app/page.tsx`, single line changed |

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `app/page.tsx` | UPDATE | +1/-1 |

## Deviations from Plan

None. The edit matches Task 1's specified text exactly, and Task 2's five acceptance checks were confirmed via read-through:
1. Both `GEMINI_API_KEY` and `OPENROUTER_API_KEY` named.
2. `aistudio.google.com/apikey` link and "free key" wording (now "free Gemini key") still present.
3. `.env.local` guidance still present.
4. Wording matches DIST-050's `lib/analyze.ts:269` "set GEMINI_API_KEY or OPENROUTER_API_KEY" phrasing verbatim.
5. Hint remains exactly one rendered paragraph/line, no added sentences.

## End-to-End Verification

- **Static read-through (primary gate, per plan)**: passed — see Task 2 checks above. The plan itself notes this is the primary gate for a pure-copy change with no branching logic.
- **Optional visual spot-check**: partially performed. Ran `npm run dev` with no AI key set in the shell, confirmed the app starts and the homepage returns HTTP 200 with no runtime errors introduced by the edit. Did not perform a full interactive submission (typing a URL/uploading an image and visually inspecting the rendered hint box), since the hint only renders inside the client-side result view after a report is generated, and the plan labels this check "optional," treating the static read-through as sufficient given the change is a pure JSX text edit with no logic branches. Dev server was stopped after the smoke check.

## Tests Written

None — no test framework in this repo; correctness gate is `npm run typecheck` + `npm run lint` (per plan) plus manual read-through, both of which passed. `npm run eval` was correctly not run since no extraction-lane files were touched.
