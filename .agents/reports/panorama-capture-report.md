# Implementation Report

**Plan**: `.agents/plans/completed/panorama-capture-plan.md`
**Branch**: `feature/panorama-capture`
**Status**: COMPLETE

## Summary

Replaced the gap-prone evenly-spaced `captureScrollShots` (≤4 fixed shots) with a
full-page panorama capture: contiguous viewport-tall tiles walked top-to-bottom
(safety-capped at 12 viewport-heights), stitched into one seamless PNG server-side
via `sharp`. The discrete tiles are kept at full resolution for the AI vision lane
(subsampled evenly across the full set so the AI gets genuine top/middle/bottom
coverage, capped at 4 images), while the single stitched panorama feeds the
pixel area-weight pass and the frontend gallery (reusing the existing
`meta.viewportShots` array — no frontend change).

## Tasks Completed

| #   | Task                                                                                                                                                                                        | File                       | Status       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------ |
| 1   | Replace `captureScrollShots` with `captureFullPageTiles`; thread `panoramaShot` through `capturePage`/`RenderResult`/`renderUrl`; comment `fullPageShot` as intentional non-panorama source | `lib/ingest.ts`            | ✅           |
| 2   | Add `panoramaShot` to `Capture`; route area-weight pixel pass through `panoramaShot`; add `subsampleEvenly` helper + use it in `analyzeUrl` AI-lane call                                    | `lib/analyze.ts`           | ✅           |
| 4   | Add `panoramaShot` to the `Capture` literal in `captureEntry`                                                                                                                               | `eval/capture.ts`          | ✅           |
| 5   | Build `viewportShots` from `panoramaShot` instead of `scrollShots` in the URL-mode branch                                                                                                   | `app/api/analyze/route.ts` | ✅           |
| 6   | Frontend — confirmed no change needed (existing grid handles any array length)                                                                                                              | `app/page.tsx`             | ✅ (no edit) |

## Validation Results

| Check                                 | Result                                                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Type check (`npm run typecheck`)      | ✅                                                                                                             |
| Lint (`npm run lint`)                 | ⚠️ Pre-existing — ESLint not configured in repo; `next lint` prompts for setup. Not introduced by this change. |
| Eval regression gate (`npm run eval`) | ✅ both corpus sites 100%, all gates passed, baseline unchanged                                                |
| E2E scratch (synthetic tall pages)    | ✅ all assertions passed (see below)                                                                           |

## E2E Verification

Per CLAUDE.md's "Manually verifying extraction changes" section, a scratch script
(temporary, deleted after use) drove `capturePage` against a local `http.createServer`
serving synthetic solid-color-band HTML, run via `npx tsx` from the project root:

- **Test 1 — truncation cap**: 15,000px page (15 viewports) → `console.warn`
  truncation fires, `panoramaShot` height = 12 × 900 = 10,800px (not the real
  15,000). ✅
- **Test 2 — non-multiple height + boundary continuity**: 3,150px page (3 full
  viewport bands + 450px remainder). Asserted:
  - `scrollShots.length === 3` (two loop tiles + one cropped remainder). ✅
  - `panoramaShot` height === 3,150, width === 1,440. ✅
  - Pixel rows read at every band boundary y (899↔900, 1799↔1800, 2699↔2700, 3149) show the correct adjacent band colors with no gap (white) and no
    duplication. ✅
- **Test 3 — short page (fits one viewport)**: `panoramaShot` and `scrollShots`
  both omitted — "omit, don't fabricate" invariant preserved. ✅
- **Test 4 — `subsampleEvenly` helper logic**: 10 items → 3 evenly spread
  (indices 0, 5-ish, 9), passthrough when `items.length <= maxCount`. ✅

## Files Changed

| File                       | Action | Lines    |
| -------------------------- | ------ | -------- |
| `lib/ingest.ts`            | UPDATE | +124     |
| `lib/analyze.ts`           | UPDATE | +31 / -1 |
| `eval/capture.ts`          | UPDATE | +2       |
| `app/api/analyze/route.ts` | UPDATE | +3       |

## Deviations from Plan

None — implementation matched the plan exactly. The plan's design decisions
(notably: keep AI lane on discrete full-resolution tiles, stitch only for
pixel-weight + gallery; safety cap at 12 viewports; reuse `viewportShots`;
leave Playwright's native `fullPage` shot as dead code with a one-line comment)
were followed as written.

One investigation note (not a deviation): during E2E verification the first
assertion run showed apparent tile-shift in the stitched panorama. Root cause
was a bug in the _scratch test's_ pixel-reader (3-channel stride on a 4-channel
PNG), not in the production code — `sharp.composite` with a `channels: 3` create
canvas correctly places tiles at their `top` offsets. The test was fixed to read
`meta.channels` for the stride and all assertions passed.

## Tests Written

| Test File                                         | Test Cases                                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scratch-panorama.ts` (temporary, deleted)        | Truncation cap height + warning; non-multiple remainder crop math + band-boundary continuity (8 boundary pixels); short-page omission; `subsampleEvenly` selection |
| `scratch-sharp-composite.ts` (temporary, deleted) | Isolated `sharp.composite` repro used to confirm the channel-stride test bug                                                                                       |

## Notes

- `eval/corpus/*/capture.json` were intentionally NOT regenerated — both committed
  fixtures are single-viewport-tall so `panoramaShot`/`scrollShots` are absent
  for them either way, and the repo's CLAUDE.md policy forbids touching captures
  for additive optional fields. `npm run eval` passes byte-for-byte unchanged.
- Lint (`next lint`) is unconfigured in this repo (pre-existing state, prompts for
  ESLint setup on first run); `npm run typecheck` is the rigorous gate and passes.
