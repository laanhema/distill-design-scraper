# Implementation Report

**Plan**: `.agents/plans/completed/dist-051-drop-unused-fullpage-screenshot-plan.md`
**Branch**: `feature/dist-051-drop-unused-fullpage-screenshot`
**Status**: COMPLETE

## Summary

Removed the unused `fullPageShot` capture from `lib/ingest.ts`. Playwright's native
`page.screenshot({ fullPage: true })` call was being made on every render but the
result was never threaded into `Capture` or read by anything downstream (the
manual tile-and-composite `panoramaShot` path, built specifically to avoid the
native `fullPage` screenshot's fixed/sticky-element duplication at tile
boundaries, is the actual panorama source). This was a purely subtractive
change confined to `lib/ingest.ts`: the field was removed from `RenderResult`,
from `capturePage`'s return type, from the call site, and from both places it
was assigned, and the `panoramaShot` doc comment was expanded to preserve the
"why not native `fullPage`" warning without cross-referencing the now-deleted
field by name.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Remove `fullPageShot` from the `RenderResult` interface | `lib/ingest.ts` | Done |
| 2 | Expand and rewrite the `panoramaShot` doc comment | `lib/ingest.ts` | Done |
| 3 | Remove `fullPageShot` from `capturePage`'s return type, call site, and return object | `lib/ingest.ts` | Done |
| 4 | Remove `fullPageShot` from `renderUrl`'s `result` object | `lib/ingest.ts` | Done |
| 5 | Full-file consistency check (grep sweep + re-read) | `lib/ingest.ts` | Done |

## Validation Results

| Check | Result |
|-------|--------|
| Type check (`npm run typecheck`) | Pass |
| Lint (`npm run lint`) | Pass |
| Eval (`npm run eval`) | Pass — `clean-light` 100%, `dark-mode` 100%, aggregate 100%, baseline untouched (no `UPDATE_BASELINE=1` run) |
| `grep -rn "fullPageShot" lib/ app/ eval/` | No matches |

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/ingest.ts` | UPDATE | +14/-21 |

## Deviations from Plan

One addition beyond the plan's explicit task list, made under Task 5's "re-read
the whole file to confirm consistency" instruction: the `capturePage` doc
comment (originally "dismiss banners, nudge lazy content, capture both
screenshots, and read the computed-style dump...") still said "capture both
screenshots" after the second screenshot call was removed. Reworded to
"capture the viewport screenshot" so no stale reference to a second screenshot
remained. This is a comment-only change with no behavioral effect, consistent
with the plan's own emphasis on not leaving orphaned/stale comments behind.

No other deviations — all line numbers, function signatures, and object-literal
shapes referenced in the plan matched the actual file exactly.

## End-to-End Verification

Performed all three verification steps from the plan:

1. **Static grep sweep**: `grep -rn "fullPageShot" lib/ app/ eval/` returns no
   matches anywhere in the repo.
2. **Before/after scratch-script comparison**: wrote a temporary scratch script
   (per CLAUDE.md's "Manually verifying extraction changes" pattern) that spins
   up a local `http.createServer` serving an ~8-viewport-tall synthetic HTML
   page (with a sticky header, to exercise the exact duplication hazard the
   `panoramaShot` comment warns about) and drives `renderUrl` against it with
   `SSRF_ALLOWLIST_HOSTS=localhost`.
   - **After** (current code, 5 runs): `elapsedMs` = [5234, 5113, 5152, 5150, 5100], mean 5149.8ms. `"fullPageShot" in result === false`. `panoramaShot` present (369968 chars), `scrollShots` present (8 tiles).
   - **Before** (stashed back to pre-change `lib/ingest.ts` via `git stash`/`git stash pop`, 5 runs): `elapsedMs` = [5574, 5366, 5480, 5471, 5381], mean 5454.4ms. `fullPageShot` key present. `panoramaShot`/`scrollShots` byte-identical in length/count to the "after" run.
   - Every "before" run (min 5366ms) exceeded every "after" run (max 5234ms) — a consistent ~300ms (5.6%) improvement, not noise. `panoramaShot` and `scrollShots` were unchanged in shape/content between before and after, confirming no behavioral regression.
   - Scratch scripts deleted after use.
3. **Eval harness**: `npm run eval` combined score 100% (`clean-light`, `dark-mode`), matching the pre-change baseline exactly — no fixture churn, no `UPDATE_BASELINE=1` run performed.

All acceptance criteria in the plan are satisfied.

## Tests Written

No test framework exists in this repo (per CLAUDE.md, `npm run eval` is the
correctness gate for extraction/ingestion logic). Verification was performed
via the eval harness (unchanged, 100% pass) plus the temporary scratch script
described above (deleted after use, per repo convention).
