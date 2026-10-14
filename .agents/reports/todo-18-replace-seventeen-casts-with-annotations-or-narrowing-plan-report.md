# Implementation Report

**Plan**: `.agents/plans/completed/todo-18-replace-seventeen-casts-with-annotations-or-narrowing-plan.md`
**Branch**: `feature/todo-18-replace-seventeen-casts-with-annotations-or-narrowing`
**Status**: COMPLETE

## Summary

Issue #182 (finding L3 of `.agents/reviews/codebase-analysis-review.md:34`) names seventeen type assertions. Fifteen still existed on `main` at `a61cfd5`; the other two (`lib/analyze.ts:242` and `:359`) were removed by #172. This run replaced the fifteen, in eleven files, with a declared type and an annotation, a `typeof` test, an `in` test, or a wider parameter type. The prototype patch applied cleanly (`git apply --check`), and the working tree is byte-identical to it (`git apply -R --check` passes at the end of the run).

No recorded output changed: the scratch check compared 61 outputs of the unchanged code (a detached worktree of `a61cfd5`) with the changed code, and all 61 are identical. The trial lint rule reports 23 assertions, down from 38, and none of the fifteen. Nothing is committed or pushed: the work is uncommitted changes on the branch.

## Decision on Open Question 1: adopted by the `/do` run, not by an owner comment

The issue's second acceptance criterion says that `lib/extract/styleDump.ts:351` and `lib/extract/structure/harvester.ts:52`, `:54` "narrow with `instanceof`". The issue's description says "no behaviour changes". The two conflict, and the `/do` run resolved the conflict under the issue's own "no behaviour changes" rule. No owner comment decided it.

The measured reason: in headless Chromium, an element that a script creates in an `<iframe>`'s document and moves into the page is no instance of the page's own `Element` or `HTMLInputElement`. Both effects were measured in this run on the check's synthetic page, each by putting `instanceof` at the site and comparing with the snapshot:

- `child instanceof Element` in `collectVisibleText`: 2 of 61 cases differ. The `textSnippet` `section: Moved in from a framemoved lead moved…` becomes `section: Moved in from a frame`, and `div: moved lead moved span moved tail` becomes `div: moved lead moved tail`.
- `el instanceof HTMLInputElement` in `isInteractive`: 2 of 61 cases differ. The interactive nodes of the synthetic page go from 8 to 7: the moved submit input (`input 24,379 states:hover`) is lost, and its `:hover` state with it.

So the second criterion is met in its purpose (no cast, a narrowing that the compiler checks) and not in its wording at these three sites:

| Site on `main` at `a61cfd5` | Issue's reference | What the code does now |
|---|---|---|
| `lib/extract/styleDump.ts:393` (`isInteractive`) | `lib/extract/styleDump.ts:351` | keeps the `tagName === "INPUT"` test and narrows with an `in` test for `type` |
| `lib/extract/structure/harvester.ts:52` (`collectVisibleText`) | `lib/extract/structure/harvester.ts:52` | takes a `Node` and reads `nodeName`, so no child is narrowed to `Element` |
| `lib/extract/structure/harvester.ts:54` (`collectVisibleText`) | `lib/extract/structure/harvester.ts:54` | the recursive call passes the `Node` on, with no cast |

The owner can still choose the wording: the plan's Open Question 1 describes that alternative and what it costs.

## Decision on Open Question 2: adopted by the `/do` run

`callModel` keeps the throw for a malformed provider reply, with a clearer message. A `null` reply now throws `OpenRouter reply is null, not a JSON object.` (before: `Cannot read properties of null (reading 'choices')`), and a `content` that is set and is no string throws `OpenRouter reply's message content is not a string.` (before: `text.trim is not a function`). For all 36 reply shapes of the check, what is returned, whether the call throws, and the line that `warnAiFailure` logs are identical to the unchanged code. Only the wording of the `Error` differs.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 0 | Apply the prototype patch | the eleven files below | PASS |
| 1 | Take the snapshot of the unchanged code | scratch `casts-check.mts`, detached worktree of `a61cfd5` | PASS |
| 2 | Check the patched code against the issue, site by site | the eleven files below | PASS |
| 3 | Prove that no result changed | scratch `casts-check.mts` | PASS |
| 4 | Drive the real app | none (verify skill) | PASS |
| 5 | Run the full gate | none | PASS |

## Validation Results

| Check | Result | Command / environment |
|-------|--------|-----------------------|
| Type check | PASS | `npm run typecheck` (also as step 1 of `npm run check`) — host, Node v22 |
| Lint | PASS | `npm run lint` (also as step 2 of `npm run check`) — host |
| Build | PASS | step 3 of `npm run check` (`next build`, `✓ Compiled successfully`) — host |
| Tests (eval gate) | PASS (3 fixtures at `combined 100%`, `aggregate combined: 100%`, `✓ all gates passed`) | `npm run eval` (also as step 4 of `npm run check`) — host |
| Full gate | PASS (exit 0; run twice, the second time on the final tree) | `npm run check` — host, no verify instance up |
| Trial lint rule | PASS (`✖ 23 problems (23 errors, 0 warnings)`; in the eleven files only the two of the `__name` shim) | `npx eslint . --rule '{"@typescript-eslint/consistent-type-assertions":["error",{"assertionStyle":"never"}]}'` — host |
| E2E step 1: snapshot of the unchanged code | PASS (`info the trial lint rule finds 38 assertions`, `snapshot written: … (61 cases)`, exit 0) | `npx tsx casts-check.mts snapshot before.json` — detached worktree of `a61cfd5` |
| E2E step 1: the check fails on the unchanged code | PASS (four identity lines `ok`; `FAIL … 38 found, 15 not expected, 0 expected and gone`; exit 1) | `npx tsx casts-check.mts compare before.json` — detached worktree of `a61cfd5` |
| E2E step 2: compare after the change | PASS (five `ok` lines, `all checks ok`, exit 0: measured lane 10, image path 9, provider reply 36, in-page walkers 6 cases identical; 23 found, 0 not expected, 0 expected and gone) | `npx tsx casts-check.mts compare before.json` — repository root |
| E2E step 3: the identity check can fail | PASS (`FAIL in-page walkers: 6 cases identical to the snapshot: 2 differ`, naming `synthetic page: style dump and harvests` and `synthetic page: text snippets`, exit 1; after the restore `all checks ok`) | the same command, with `child instanceof Element` in `collectVisibleText` |
| E2E step 4: verify `analyze-url` | PASS (13 checks, `all checks passed`, `console-errors.txt` empty) | `.claude/skills/verify/scripts/verify.sh drive analyze-url` — AI lane off |
| E2E step 4: verify `analyze-images` | PASS (18 checks, `all checks passed`, `console-errors.txt` empty) | `verify.sh drive analyze-images` — AI lane off |
| E2E step 4: verify `tabs-downloads` | PASS (22 checks, `all checks passed`, `console-errors.txt` empty) | `verify.sh drive tabs-downloads` — AI lane off |
| E2E step 4: verify `error` | PASS (5 checks, `all checks passed`) | `verify.sh drive error` — AI lane off |
| E2E step 4: cache recipe | PASS (`200 3.511291s`, then `200 0.021979s`; `cmp` prints nothing; both bodies 244292 bytes) | the `curl` loop of `.claude/skills/verify/features/analyze-api.md:22` |
| E2E step 5: tree state | PASS (`git status --short` lists the eleven files and the plan and patch files only; `git diff --stat -- eval/baseline.json eval/corpus` prints nothing; one worktree; no verify instance) | `git status --short`, `git diff --stat`, `git worktree list` |

Verify evidence: run `20261014-052427-985318`, `doctor` printed `head a61cfd5-dirty  ai-lane off` and every line `ok`. Evidence is under `.verify/runs/20261014-052427-985318/evidence/` (`analyze-url-052438`, `analyze-images-052445`, `tabs-downloads-052449`, `error-052453`, `api-052503`). The `console-errors.txt` of `error` holds the browser's own line for the expected `400` and nothing else. `verify.sh down` ran before `npm run check`.

No paid model call was made: the verify AI lane stayed off, `npm run eval:ai` did not run, and the scratch check replaces `fetch` for its whole run. No key of `.env.local` was read or printed.

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `app/api/analyze/route.ts` | UPDATE | +1/-1 |
| `app/page.tsx` | UPDATE | +6/-1 |
| `eval/score.ts` | UPDATE | +8/-4 |
| `lib/aiLane.ts` | UPDATE | +29/-5 |
| `lib/analyze.ts` | UPDATE | +16/-10 |
| `lib/cache.ts` | UPDATE | +4/-2 |
| `lib/color.ts` | UPDATE | +1/-1 |
| `lib/extract/imagePalette.ts` | UPDATE | +9/-5 |
| `lib/extract/states.ts` | UPDATE | +17/-10 |
| `lib/extract/structure/harvester.ts` | UPDATE | +9/-6 |
| `lib/extract/styleDump.ts` | UPDATE | +5/-3 |

Total: 11 files, +105/-48. `eval/baseline.json` and `eval/corpus/*` are untouched.

## Deviations from Plan

The code matches the plan and the prototype patch byte for byte. What differs is in how the checks ran, and in how the result relates to the issue's text:

- **Both Open Questions were resolved by the `/do` run with the plan's proposed defaults, not by the owner.** See the two decision sections above.
- **One measurement beyond the plan.** Step 3 asks for the `instanceof Element` change in `collectVisibleText` only. This run also put `instanceof HTMLInputElement` in `isInteractive` and compared, to measure the reason for Open Question 1 at all three sites. The comparison used a snapshot of the patched tree, whose 61 cases are identical to those of `a61cfd5`. Both changes were restored, and `git diff` was compared byte for byte with the diff saved before them.
- **Scratch directory.** The session's scratch directory was used in place of `mktemp -d` (the plan allows it), with `TMPDIR` pointed into it so that the check's synthetic page was written there too. The two `node_modules` links were removed with `rm` before the worktree and the directory were deleted.
- **The issue's third criterion asks for `Map<string, …>`, and `byRole` is a `Map<string | undefined, string>`.** This is the plan's decision: `Swatch.role` is optional, so `Map<string, string>` would need a filter that changes which entries the map holds. The `as never` is gone, and `gotByToken` is a `Map<string, number>`.
- **The issue names seventeen casts and this run replaced fifteen.** #172 had already removed `lib/analyze.ts:242` and `:359`.
- **Two branches are compiled and not executed**, as the plan states: the `catch` arm of the image path's structure lane (it runs only if `structureFromImages` throws, which its own comment rules out) and the new reject branch of `readFileAsDataURL` (`readAsDataURL` always leaves a string).

## Tests Written

The project has no unit test framework, so none was introduced and no test file was added.

| Test File | Test Cases |
|-----------|------------|
| scratch `casts-check.mts` (from the plan; deleted after use) | 61 before/after cases: 10 of the measured lane (the report and Markdown of the three committed captures, `buildStates` over seeded deltas, `scorePalette` and `scoreTypography` with a matching and a missing spec, `hue` of eight colors), 9 `analyzeImages` calls, 36 provider replies through `callModel` (they cover the new `firstChoiceText`), 6 of the in-page walkers on four pages in headless Chromium; and 1 check that the trial lint rule finds exactly the 23 assertions that #182 leaves in place |
| verify skill (no file added) | 58 checks in four scenarios, and the cache recipe |
