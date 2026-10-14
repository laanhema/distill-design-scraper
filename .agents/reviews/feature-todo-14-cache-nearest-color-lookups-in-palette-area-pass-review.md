# Code Review: feature/todo-14-cache-nearest-color-lookups-in-palette-area-pass

**Scope**: branch `feature/todo-14-cache-nearest-color-lookups-in-palette-area-pass` against its merge base with `main` (`3fd3cde`). The branch tip equals `main`, so the whole change is the uncommitted working tree: `lib/extract/palette.ts` (+36/-11) and two untracked documents (the plan and the implementation report). GitHub issue #178.
**Recommendation**: APPROVE WITH NITS

## Summary

The pixel loop of `assignAreaWeights` (`lib/extract/palette.ts:134-236`) now takes each pixel's nearest canonical color from a per-call `Map<number, number>` keyed by the 24-bit RGB value, with -1 for "no canonical color within `PIXEL_MATCH_LAB`", and a ceiling of 65,536 entries after which the map is emptied and filled again. The change is correct: the canonical colors after the area pass are identical to those of `main`, to the last bit of the unrounded area weights, on every input I ran, and the palette lane is about 4 times faster on the three committed captures. One Medium finding: on a screenshot whose pixels are mostly distinct RGB values, the pass is now slower than on `main`, and a fixed-size typed-array cache removes that cost.

Acceptance criteria of issue #178 (the owner's comments change none of them):

1. **The area pass takes each pixel's nearest canonical color from a per-call cache keyed by its RGB value, and computes Lab only on a miss: met.** `lib/extract/palette.ts:163` declares the map inside the call, `:169-171` build the key and look it up, and `labTriple` (`:173`) and the scan over `canon` (`:177-183`) run only inside `if (match === undefined)`. A pixel whose cached value is -1 still reaches `farCount++` and its `farBuckets` entry (`:192-200`), as the owner's technical note requires.
2. **Area weights and image-sourced colors are identical to before for the three committed captures: met.** Checked by me, not taken from the implementation report. A scratch script outside the repository loaded `main`'s `palette.ts` and the working tree's side by side, each with `collectCanonical` and `assignAreaWeights` exported, and compared the whole canonical array (hex, unrounded `areaWeight`, `imageSourced`, Lab, order) and the `extractPalette` output. Identical for the panorama, the viewport shot, the dark-scheme viewport shot and the scroll shot of `clean-light`, `dark-mode` and `adversarial-shell` (12 inputs). None of these produces an image-sourced color, so that path was checked on 400 seeded synthetic pages (397 with at least one image-sourced canonical color), on four screenshots that hold more than 65,536 distinct values (so the reset runs), and on greyscale PNGs: all identical. The same script with the key changed to `(r << 16) | (g << 8)` failed on all 12 capture inputs and on many synthetic pages, so the check can fail.
3. **`npm run eval` prints the same scores, with the baseline untouched: met.** The working tree and a `git archive main` export in the scratchpad both print `combined 100%  roles 100%  type 100%  ΔE 0.0` for the three fixtures, `aggregate combined: 100%` and `✓ all gates passed`. `git diff --stat -- eval/` prints nothing.

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
- **M1** `lib/extract/palette.ts:171` — On a screenshot whose pixels are mostly distinct RGB values, the `Map` lookup at `:171` and the store at `:186-187` cost more than they save, so the area pass is slower than on `main`. **Why:** the issue exists to shorten a synchronous pass on the server's one thread, and for photograph-heavy pages the change lengthens it: `extractPalette` took 1,139-1,263 ms against 927-1,017 ms on `main` for 1.5 M pixels of noise (23-30 % more in each of three runs, best of 5), and 911-1,078 ms against 818-935 ms for a 1.5 M pixel photograph-like gradient with mild noise (6-26 % more). Both inputs are synthetic, and a 12-viewport panorama samples about twice as many pixels. The plan assumed that such a value "is computed as it is today" and guarded only at 1.5 × the time; the implementation report names the cost for the owner, and no owner comment accepts it. **Fix:** replace the `Map` with a fixed-size direct-mapped cache in typed arrays: `const slotKey = new Int32Array(1 << 16).fill(-1)` and a value array of the same length (`Int32Array`, or `Int16Array` if `canon.length` is known to stay below 32,768), `const slot = Math.imul(rgbKey, 0x9e3779b1) >>> 16`, a hit when `slotKey[slot] === rgbKey`, and on a miss the existing Lab code followed by a write to both arrays. Then `NEAREST_CACHE_MAX`, the `clear()` and the part of the comment at `:46-52` about emptying the map go away. Measured in the scratchpad with the same script: canonical colors identical to `main` on every input above; noise at 929-1,034 ms (0-6 % over `main`); the photograph-like gradient at 702-824 ms (4-14 % under `main`); the three captures at 31-41 ms (the `Map` gives 33-52 ms); a noise hero above flat UI at 278-305 ms (the `Map` gives 340-383 ms, `main` 1,857-2,089 ms). It still meets criterion 1 (a per-call cache keyed by the RGB value), although the owner's technical note names a `Map<number, number>`. If the owner prefers the `Map`, an owner comment on the issue that accepts the cost closes this finding instead.

### Suggestions (Low)
None

**Noted, not a finding**:
- No committed check guards the area weights: `npm run eval` scores role names and ΔE, and the project's rules have scratch scripts deleted after use. This gap exists on `main` too, and the plan states it.
- The plan (`.agents/plans/completed/todo-14-cache-nearest-color-lookups-in-palette-area-pass-plan.md:17,59,61`) describes a map that stops taking entries when full; the code empties and refills it. The implementation report records this as Deviation 1 with its measurements, so the two documents do not contradict each other unexplained.
- The implementation report says the implementer ran `git stash` and `git stash pop` in the owner's tree to retake the snapshot. The owner's stash `WIP: PRD.md phase 8 sweep` is still the only entry of `git stash list`.

## Validation Results

| Check | Status | Notes |
|-------|--------|-------|
| Build / Type Check | PASS | `npm run check` (the command CI runs) on the host, Node v22.23.1, exit 0: its `tsc --noEmit` and `next build` steps. No `verify.sh` instance was running. |
| Warnings | NONE | The log of `npm run check` holds no line with "warn" or "error" (tsc, eslint, `next build`). |
| Lint | PASS | The `eslint .` step of `npm run check`, host. |
| Tests | PASS | The `npm run eval` step of `npm run check`, host, offline: 3 required fixtures at `combined 100%`, `aggregate combined: 100%`, `✓ all gates passed`, the same lines as a `git archive main` export in the scratchpad prints. Skipped by the runner, as on `main`: the optional entries `stripe`, `linear` and `vercel` (no committed capture). Eval does not score area weights, so criterion 2 rests on the scratch check below. `npm run eval:ai` was not run (no paid model call). |
| Before/after identity (scratch) | PASS | `npx tsx --tsconfig <scratch>/tsconfig.json check.mts`, host, no browser, no network, three runs: `main`'s `palette.ts` against the working tree's, 12 capture inputs, 400 synthetic pages, 4 screenshots above the cache ceiling, 2 greyscale PNGs, 6 timed inputs. All identical. Fails as intended with a wrong cache key. Captures, best of 5: `clean-light` 155-168 ms before and 33-40 ms after, `dark-mode` 194-199 ms and 35-52 ms, `adversarial-shell` 135-161 ms and 34-44 ms. The scratch files were deleted. |
| UI verification | N/A | No markup, style or client code changed, and the report output is byte-identical, so there is nothing a browser could show. |

## What's Good

- The change is the smallest that does the job: one constant, one map, and the existing Lab code moved inside the miss branch unchanged. The far branch is untouched, so `farCount` and the first-seen `r`/`g`/`b` of each `farBuckets` entry cannot move.
- `bestDist <= PIXEL_MATCH_LAB_SQ ? best : -1` is equivalent to the old `best >= 0 && bestDist <= PIXEL_MATCH_LAB_SQ`, because `canon` is not empty at this point (`:138`).
- The comment at `:157-162` states the one condition the cache depends on (`canon` must not change during the loop) and where the image-sourced colors are appended.
- The implementer measured past the plan, found that a map that stops taking entries gains nothing below a hero photograph, changed the policy, and reported the remaining cost openly on the issue. The claims of the implementation report that I re-ran (identity, the eval lines, the capture timings, the noise slowdown) all hold.

## Recommendation

Mergeable as it is: every acceptance criterion is met and the full gate passes. Before the merge, either fix M1 with `/fix-findings .agents/reviews/feature-todo-14-cache-nearest-color-lookups-in-palette-area-pass-review.md M1` and repeat the before/after identity check, or have the owner accept the measured cost on issue #178.
