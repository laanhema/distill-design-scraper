# Implementation Report

**Plan**: `.agents/plans/completed/todo-15-stop-repeating-screenshots-in-analyze-response-plan.md`
**Branch**: `feature/todo-15-stop-repeating-screenshots-in-analyze-response`
**Status**: COMPLETE

## Summary

`POST /api/analyze` no longer sends a picture twice (GitHub issue #179, TODO-15, finding M9).

- `AnalyzeMeta` has no `viewportShot`. A URL response carries `meta.viewportShots` (the viewport shot, then the panorama when one was captured), each once.
- An image response carries no screenshots: `meta.viewportShots` is absent, not an empty array. The uploads are neither sent back nor held in the cache.
- The page keeps the preview's pictures in the `done` state as `sourceImages`. A URL result fills it from `meta.viewportShots`; an image result fills it from `submittedImages`, the selection as it stood at submit. `Preview` reads the prop and renders no `<img>` for an empty list.
- The verify driver checks the new shape, compares each preview `src` with the bytes of the uploaded file, and edits the form after the result to prove that the preview does not follow the live form.
- The README, the two architecture write-ups, the PRD response sample and the verify skill's Markdown describe the new response.

The code came from the plan's prototype patch, which applied cleanly on `main` at `b6f7699`. Nothing is committed: the work is left as uncommitted changes on the branch.

Both Open Questions were resolved by the owner before the run: the PRD sample is corrected (Task 4), and `meta.viewportShots` is absent for image input.

Measured in this run, AI lane off (no model call was made), against the plan's numbers for `main`:

| Request | `main` (plan) | This branch |
|---------|---------------|-------------|
| URL `clean-light` | 3 data URLs for 2 shots, 384.3 KiB | 2 for 2, 265.1 KiB |
| URL `dark-mode` | 3 for 2, 351.9 KiB | 2 for 2, 249.7 KiB |
| URL `adversarial-shell` | 3 for 2, 335.4 KiB | 2 for 2, 229.2 KiB |
| 2 images as data URLs (222.9 KiB request) | 345.8 KiB | 3.1 KiB |
| 1 image as a data URL (120.0 KiB request) | 242.8 KiB | 2.9 KiB |
| 1 image as raw base64, no name (102.9 KiB request) | 208.8 KiB | 2.9 KiB |
| Legacy `image` alias (119.9 KiB request) | 242.8 KiB | 2.9 KiB |

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 0 | Apply the prototype patch (`git apply --check`, then `git apply`) | `lib/api.ts`, `app/api/analyze/route.ts`, `app/page.tsx`, `.claude/skills/verify/scripts/drive.ts` | PASS |
| 1 | Describe the new response in the README | `README.md` | PASS |
| 2 | Describe the new response in the API route write-up | `docs/architecture/api-route.md` | PASS |
| 3 | Say where the preview's pictures come from | `docs/architecture/frontend.md` | PASS |
| 4 | Bring the PRD's response sample in line | `.agents/PRDs/PRD.md` | PASS |
| 5 | Correct the verify skill's Markdown | `.claude/skills/verify/SKILL.md`, `features/analyze-images.md`, `features/analyze-url.md`, `features/analyze-api.md` | PASS |
| 6 | Nothing reads the removed field; the patch is in place | read-only checks | PASS |
| 7 | Drive the app and the API | `.verify/` (git-ignored evidence) | PASS |
| 8 | Run the full gate | none | PASS |

## Validation Results

| Check | Result | Command / environment |
|-------|--------|-----------------------|
| Type check | PASS | `npm run typecheck` (also step 1 of `npm run check`) — host, Node v22 |
| Lint | PASS | `npm run lint` (also step 2 of `npm run check`) — host |
| Build | PASS | step 3 of `npm run check` — host; route `/` builds at 5.52 kB |
| Tests (eval gate) | PASS (3 fixtures at 100%, `✓ all gates passed`) | `npm run eval` as step 4 of `npm run check` — host; `eval/baseline.json` and `eval/corpus/*` untouched |
| Full gate | PASS (exit 0) | `test ! -e .verify/current.env && npm run check` — host |
| Task validations 1 to 5 | PASS | the `grep` commands of each task: 1, 1, 1, 1, and `2 2 2 2`; the negative greps print nothing |
| E2E step 1, static | PASS | `git apply --check -R <patch>` passes; `grep -rnE "meta\.viewportShot\b" app lib` and `grep -nE "^\s*viewportShot:" app/api/analyze/route.ts lib/api.ts` print nothing; `grep -c "viewportShots" app/api/analyze/route.ts` prints 2; `grep -nE "neutral-\|dark:" app/page.tsx app/layout.tsx` prints nothing |
| E2E step 2, `doctor` | PASS | `verify.sh up && verify.sh doctor` — every line `ok`, `head b6f7699-dirty`, `ai-lane off` |
| E2E step 2, `analyze-url` | PASS (13 checks) | `verify.sh drive analyze-url` — `all checks passed` |
| E2E step 2, `analyze-images`, two images | PASS (18 checks) | `verify.sh drive analyze-images` — `all checks passed` |
| E2E step 2, `analyze-images`, one image | PASS (14 checks) | `verify.sh drive analyze-images --fixtures clean-light --remove 0` — `all checks passed` |
| E2E step 2, `tabs-downloads` | PASS (22 checks) | `verify.sh drive tabs-downloads` — `all checks passed` |
| E2E step 2, evidence | PASS | `grep -c "viewportShot"` prints 0 for both `analyze-images-*/response.json`; the `analyze-url` response holds `"viewportShots": ["<122026 chars>", "<130814 chars>"]` and no `"viewportShot"` key; the ARIA tails end with `img "Source image 1 of clean-light.png +1 more"` and `img "Source image 2 of clean-light.png +1 more"` (two images) and `img "Screenshot of clean-light.png"` (one image); all four `console-errors.txt` are 0 bytes; `03-result-preview.png` and `04-form-edited-after-result.png` of the two-image run were opened: both show the two pictures side by side under the palette, the second with one thumbnail in the form |
| E2E step 3, API probe | PASS (24 checks, `all checks ok`, exit 0) | `node "$E/shots-probe.mjs" "$APP_URL" "$FIXTURE_URL" <inputs dir>` — sizes in the Summary table |
| E2E step 4, tree | PASS | `git status --short` lists only the files of the plan's Files to Change table, the plan and its patch; no verify instance is left up |

Evidence of the run (git-ignored): `.verify/runs/20261014-044828-893469/evidence/` — `analyze-url-044840`, `analyze-images-044852` (two images), `analyze-images-044904` (one image), `tabs-downloads-044908`, `api-044926` (`shots-probe.mjs` and `shots-probe.txt`).

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/api.ts` | UPDATE (patch) | +3/-2 |
| `app/api/analyze/route.ts` | UPDATE (patch) | +6/-15 |
| `app/page.tsx` | UPDATE (patch) | +24/-8 |
| `.claude/skills/verify/scripts/drive.ts` | UPDATE (patch) | +46/-8 |
| `README.md` | UPDATE | +1/-1 |
| `docs/architecture/api-route.md` | UPDATE | +1/-1 |
| `docs/architecture/frontend.md` | UPDATE | +1/-1 |
| `.agents/PRDs/PRD.md` | UPDATE | +1/-2 |
| `.claude/skills/verify/SKILL.md` | UPDATE | +2/-2 |
| `.claude/skills/verify/features/analyze-images.md` | UPDATE | +4/-3 |
| `.claude/skills/verify/features/analyze-url.md` | UPDATE | +1/-1 |
| `.claude/skills/verify/features/analyze-api.md` | UPDATE | +1/-1 |

## Deviations from Plan

- **Task 4, `Last Updated:` line of the PRD.** The plan says to set line 4 to the date of the change. On `main` that line already reads `Last Updated: 2026-10-14`, the date of this change, so it needed no edit. The PRD diff is two lines of the response sample (`+1/-2`), not three.
- **Build size.** The plan measured route `/` at 5.53 kB in the prototype worktree; this build prints 5.52 kB. No functional difference.

Nothing else differs: the patch applied without change, and the reverse check (`git apply --check -R`) still passes after the doc tasks, so the four patched files hold exactly what the patch wrote.

For `/update-prd` (out of this issue's scope, flagged as the plan's Risks ask): the PRD response sample still shows `"aiApplied": true` (`.agents/PRDs/PRD.md:261`); the field is `aiOutcome` since #172. The same stale name is in `.claude/skills/verify/SKILL.md` ("`aiApplied: true`" in the proof standards), which this plan did not list.

## Tests Written

The project has no unit test framework (`AGENTS.md`), so none was introduced. The change is covered by checks in the verify driver, which stay in the repo, and by an API probe kept with its output in the git-ignored evidence directory.

| Test File | Test Cases |
|-----------|------------|
| `.claude/skills/verify/scripts/drive.ts`, `checkDesignReport` (`analyze-url`, `tabs-downloads`) | `meta has no legacy viewportShot`; `meta.viewportShots holds the screenshots as PNG data URLs`; `Preview shows every viewportShots entry, in order` |
| `.claude/skills/verify/scripts/drive.ts`, `scenarioAnalyzeImages` | `response returns no screenshots (no viewportShot, no viewportShots)` (replaces `viewportShots has one entry per kept image`); `Preview shows the N uploaded image(s), in order`; `<file>.png thumbnail is gone after the analysis`; `Preview still shows the images held at submit time` |
| `.verify/runs/20261014-044828-893469/evidence/api-044926/shots-probe.mjs` (not tracked) | 24 checks over 3 URL requests and 4 image request shapes (2 data URLs, 1 data URL, raw base64 without a name, the legacy `image` alias): status, no `meta.viewportShot`, the screenshot fields, and the image bytes in each response |
