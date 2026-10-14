# Code Review: feature/todo-15-stop-repeating-screenshots-in-analyze-response

**Scope**: branch `feature/todo-15-stop-repeating-screenshots-in-analyze-response` against its merge base `main` at `b6f7699` (the branch tip equals `main`; all of the work is uncommitted in the working tree: 12 modified files, 3 untracked files), for GitHub issue #179
**Recommendation**: APPROVE

## Summary

The change removes `meta.viewportShot` from the `/api/analyze` response, stops returning the uploads for image input, and has the page keep the preview's pictures in the `done` state as `sourceImages` (a URL result takes them from `meta.viewportShots`, an image result from the selection as it stood at submit). The code, the verify driver and the docs agree with each other and with the running app, and the review found no defect. All 12 modified files were read in full around the changed hunks; the untracked plan, prototype patch and implementation report were read as supporting documents (the patch reverse-applies cleanly on the tree, so the four patched files hold exactly what it wrote).

Acceptance criteria of #179:

| # | Criterion | Met | How I know |
|---|-----------|-----|------------|
| 1 | The response has no `viewportShot`; the page reads `viewportShots[0]` | Yes | `lib/api.ts:20-23` has no singular field; `app/api/analyze/route.ts:236-242` sets only `viewportShots`; `app/page.tsx:161-164` fills `sourceImages` from `meta.viewportShots` and `:659-665` renders `sourceImages[0]`. A repo-wide search finds no reader of `meta.viewportShot`. My API probe: a URL response has `metaKeys=[finalUrl,title,elapsedMs,bannerDismissed,aiOutcome,capturedAt,viewportShots]`, 2 data URLs in the body for 2 distinct shots. `analyze-url` check `meta has no legacy viewportShot`: ok |
| 2 | In image mode the response returns no screenshots, and the preview shows the images captured at submit time | Yes | `app/api/analyze/route.ts:187-200` builds the image payload without screenshots. My API probe over 4 image request shapes (2 data URLs, raw base64 without a name, the legacy `image` alias, `url` + `images`): 0 data URLs in each body, 2.9 to 3.0 KiB, `viewportShots` absent; the cache hit is byte-identical. `analyze-images` checks `Preview shows the 2 uploaded image(s), in order` (each `src` compared with the bytes of the uploaded file) and `Preview still shows the images held at submit time` (after removing image 1 from the form): ok, for two images and for one |
| 3 | `README.md` and `docs/architecture/api-route.md` describe the new response | Yes | `README.md:59` and `docs/architecture/api-route.md:3`; both statements match the probe. `docs/architecture/frontend.md:3`, the PRD response sample and the verify skill's Markdown were brought in line too |
| 4 | `/verify` (`analyze-url`, `analyze-images`) passes, with the `viewportShots` check in `drive.ts` updated | Yes | Run by this review at `b6f7699-dirty`, `ai-lane off`: `analyze-url` 13 of 13, `analyze-images` 18 of 18 (two images) and 14 of 14 (one image). The old check `viewportShots has one entry per kept image` is replaced at `.claude/skills/verify/scripts/drive.ts:313-321` |

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
- The removal of `meta.viewportShot` and of the uploads in an image response breaks an outside API client that reads either. The owner decided both removals on 2026-10-13 (issue description), and the README and `docs/architecture/api-route.md` state the new shape.
- `.agents/PRDs/PRD.md:261` and `.claude/skills/verify/SKILL.md:84` still name `aiApplied: true` (the field is `aiOutcome` since #172). Both lines are the same on `main`, and the implementation comment on #179 hands them to `/update-prd`.
- The plan's Metadata names the prototype patch at `.agents/plans/…-prototype.patch`, and the file is in `.agents/plans/completed/`. Every completed plan with a prototype patch in this repo has the same pre-move path, so this is the repo's convention, not a defect of this change.

## Validation Results

| Check | Status | Notes |
|-------|--------|-------|
| Build / Type Check | PASS | `npm run check` (the command CI runs), host, no verify instance up: `tsc --noEmit` and `next build` pass; route `/` builds at 5.52 kB |
| Warnings | NONE | The full `npm run check` log holds no `warning` line (typecheck, eslint and a fresh `next build`) |
| Lint | PASS | `eslint .` as step 2 of `npm run check`, host; covers `.claude/skills/verify/scripts/drive.ts` |
| Tests | PASS | `npm run eval` as step 4 of `npm run check`, host: `clean-light`, `dark-mode`, `adversarial-shell` at 100%, `all gates passed`. Skipped by design: `stripe`, `linear`, `vercel` (optional entries without a committed capture). The eval gate replays captures through the extractors and never loads the route or the page, so it cannot see this change; the UI verification row is the gate for the behavior. The repo has no unit test framework |
| UI verification | PASS | `verify.sh up`, `doctor` (all `ok`, `head b6f7699-dirty`, `ai-lane off`, no paid model call), then `drive analyze-url` (13 ok), `drive analyze-images` (18 ok), `drive analyze-images --fixtures clean-light --remove 0` (14 ok), `drive tabs-downloads` (22 ok), `drive tab-layout` (41 ok; 1280, 1024, 768 and 390 px), `drive error` (5 ok), then `verify.sh down`. Viewports: 1280×900 for every scenario, plus the URL result's preview at 1024, 768 and 390 px through `tab-layout` (at 390 px the two pictures stack, no overflow). Not covered: the image result's preview at a phone width, because `analyze-images` runs only at 1280×900; its markup and classes are the ones the URL result uses. `console-errors.txt` is 0 bytes for every scenario but `error`, whose one line is the expected 400. Captures opened: `analyze-images-045400/04-form-edited-after-result.png` (one thumbnail in the form, two pictures in the preview), `analyze-images-045404/02-result-preview.png` (one picture), `tab-layout-045419/11-tab-bar-390-preview.png`. Evidence: `.verify/runs/20261014-045341-903782/evidence/`. An API probe of 7 requests ran from the scratchpad against the same instance (results in the Summary table) |

No pre-change run was made in a worktree: no criterion asks for a before/after comparison, and that the new checks fail on `main` follows from the code (`main` sets `viewportShot` on both paths and `viewportShots` on the image path).

## What's Good

- The preview's pictures follow the pattern that `sourceName` set in #173: a value that belongs to a result is captured when the result is made. The request body, `sourceName` and `sourceImages` all read one snapshot, `submittedImages`, so they cannot disagree.
- For image input the field is absent, not an empty array, which follows the repo's rule that a signal the server does not have is an omitted field.
- `Preview` now renders no `<img>` for an empty list. On `main` the fallback branch rendered an `<img>` without a `src`.
- The route lost the `cleaned` array, whose two halves existed only to rebuild the echoed data URLs; `analyzeImages` receives the same `{ data, name }` values as before.
- The driver checks prove the behavior, not the wiring: each preview `src` is compared with the bytes of the uploaded file, and the form is edited after the result to show that the preview does not follow it. `slim` names no field, so an absent field stays absent in `response.json`.
- Every doc that described the old response was found and corrected, including the ones the issue did not name.

## Recommendation

Nothing to fix. The branch is ready for its PR: `/issue-flow-done 179`.
