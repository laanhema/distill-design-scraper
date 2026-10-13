# Code Review: feature/todo-12-fetch-cross-origin-stylesheets-concurrently

**Scope**: branch `feature/todo-12-fetch-cross-origin-stylesheets-concurrently` (diff against `main` merge base `e52b4ca`; the branch has no commits of its own, so the whole change is uncommitted work in the tree), checked against GitHub issue #176
**Recommendation**: APPROVE

## Summary

Reviewed the 4 modified files (`lib/extract/styleDump.ts` +146/-100, `lib/ingest.ts` +15/-5, and one paragraph each in `docs/architecture/tokens-lane.md` and `docs/architecture/ingestion.md`) and the 3 untracked workflow files (plan, prototype patch, implementation report). `collectStyleDump` now starts every cross-origin stylesheet refetch at once under a 5 s timeout, applies the texts sequentially in stylesheet order, and shares one per-capture `CrossOriginSheetCache` between the light and the dark style dump. All five acceptance criteria of #176 are met, and I confirmed each one with my own two-origin run against both this tree and a throwaway worktree of `main` at `e52b4ca`. No findings.

### Acceptance criteria of #176

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Fetched concurrently, each with an explicit timeout of a few seconds | Met | `lib/extract/styleDump.ts:666-670` (`Promise.all` over `dump.crossOriginHrefs`), `:137` (`timeout: CROSS_ORIGIN_SHEET_TIMEOUT_MS`, 5 000 ms at `:114`). Measured: 31 cross-origin sheets, one of them answering after 3 s, in 5.4 s (`main`: 22.0 s); 2 sheets that never answer in 7.1 s; 1 sheet that stalls in its body in 7.1 s |
| 2 | Rules applied in the original stylesheet order | Met | `lib/extract/styleDump.ts:671` iterates the `Promise.all` result, which keeps the order of `dump.crossOriginHrefs`. Measured: 25 sheets with scrambled response delays yield keyframes `k0…k24` in sheet order, and a sheet that answers 3 s later than the 25 after it still wins the `:hover` `color` conflict |
| 3 | The dark pass reuses the CSS text of the light pass | Met | `lib/ingest.ts:310-311` and `:320` pass one cache to both dumps; `lib/extract/styleDump.ts:133-146` returns the stored request. Measured: every sheet refetched 1 time per `capturePage` (`main`: 2), and the dark dump holds dark-specific `from` values (`rgb(40, 40, 40)`), so text is reused, not results |
| 4 | A sheet that fails or times out is skipped without failing the analysis | Met | `lib/extract/styleDump.ts:138-143` resolves to `null` on a non-ok status, an empty body, a failed request and a timeout; `:672` skips it. Measured with a 404, a whitespace-only body, a connect stall and a body stall: `capturePage` returns, `darkCapture` is present, the other sheets yield the same dump, 0 unhandled rejections |
| 5 | Same hover/focus states and keyframes as before, on a page with a cross-origin sheet | Met | The slimmed light + dark dumps (every node's `states`, the `keyframes`, the node count) are deep-equal between `main` at `e52b4ca` and this tree on two fixtures: the plan's 3-sheet page plus one button, and a 31-sheet page with a duplicate `href`, a 302 redirect, an empty sheet and a slow sheet |

The issue's technical notes also hold: the pass stays best-effort and merge-only (the merge block at `lib/extract/styleDump.ts:738-776` is the one of `main`, re-indented), and the refetch still goes through `page.context().request.get`, so its relation to the SSRF guard is unchanged.

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
- No permanent regression check covers the changed path: `npm run eval` replays frozen captures and never calls `collectStyleDump`. The plan raised this as Open Question 4 and the owner resolved it (the two-origin check stays a scratch script).
- A sheet that fails or times out is skipped with no log line, and the dark pass does not retry it (Open Questions 2 and 3, resolved by the owner). A slow but healthy host that needs more than 5 s loses its states and keyframes, which the plan accepts as an honest omission (Open Question 1).
- The number of concurrent requests has no cap, and the cache holds every sheet's text until `capturePage` returns. The plan scopes both out: the count is bounded by the page's own `<link>`s, which the browser already loaded in parallel.
- The plan's Metadata row cites the patch at `.agents/plans/todo-12-…-prototype.patch`, while the file is in `.agents/plans/completed/`. The workflow moves both files after the plan is executed, and the merged plan of todo-11 carries the same pre-move path. The patch itself reverse-applies cleanly to the tree, so the code is exactly the prototype.

## Validation Results

| Check | Status | Notes |
|-------|--------|-------|
| Build / Type Check | PASS | `npm run check` (the command CI runs), host, Node v22.23.1: `tsc --noEmit` clean, `next build` "Compiled successfully", exit 0 |
| Warnings | NONE | No warning in the output of `tsc`, `eslint` or `next build` in that run |
| Lint | PASS | `eslint .` as step 2 of `npm run check`, host |
| Tests | PASS | `npm run eval` as step 4 of `npm run check`, host: 3 required fixtures (`clean-light`, `dark-mode`, `adversarial-shell`) at 100%, aggregate 100%, "all gates passed". Skipped by design: the optional live entries `stripe`, `linear`, `vercel` (no committed capture). The eval does not execute the changed code; the two-origin run below does |
| Two-origin check (reviewer's own) | PASS | Scratch script outside the repository, run with `npx tsx` from the project root and from a `git worktree` of `e52b4ca` (both removed afterwards), headless chromium, loopback only. 4 `capturePage` runs on this tree (plain, 31-sheet, connect stall, body stall) and 2 on `main` (plain, 31-sheet). Results are in the acceptance-criteria table. The plan's pinned sha256 was not reproduced, because my fixture has one more button; the dumps of the two trees were compared directly instead |
| UI verification | N/A | The change alters no markup, style or client behaviour. The implementer's `verify.sh drive analyze-url` evidence (`.verify/runs/20261014-005803-483443/evidence/analyze-url-010135/`, captured 01:01, after the last code edit at 00:57) shows 10 of 10 checks `ok` and an empty `console-errors.txt` |

## What's Good

- The cache stores the request promise, so one lookup serves the concurrent start, the reuse by the dark pass, and the memory of a failure. The promise can never reject, which keeps `Promise.all` from failing the capture and leaves no unhandled rejection.
- The cache is a required parameter of `collectStyleDump`, so the compiler makes a future caller decide where its cache comes from. Both existing callers are in `lib/ingest.ts` and share the one that `capturePage` creates.
- Only the fetch is concurrent. The apply loop and its per-sheet `try`/`catch` are unchanged, which is why the dump is identical to the one of `main`.
- The cache is not added to `CaptureArtifacts`, so the `capture.json` shape and the eval fixtures stay as they are.
- Both architecture write-ups describe the new behaviour accurately, including the "first sheet wins" rule and the no-retry decision.

## Recommendation

Ready to merge. Next step: `/issue-flow-done 176`.
