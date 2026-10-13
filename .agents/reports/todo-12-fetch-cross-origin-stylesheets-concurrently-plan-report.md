# Implementation Report

**Plan**: `.agents/plans/completed/todo-12-fetch-cross-origin-stylesheets-concurrently-plan.md`
**Branch**: `feature/todo-12-fetch-cross-origin-stylesheets-concurrently`
**Status**: COMPLETE

## Summary

`collectStyleDump` (`lib/extract/styleDump.ts`) now requests every cross-origin stylesheet at once, each under `CROSS_ORIGIN_SHEET_TIMEOUT_MS = 5_000`, and applies the returned texts one at a time in stylesheet order, so the merge rule of `main` (the first sheet that declares a change wins, and a value of the in-page pass is never overwritten) is unchanged. The requests live in a `CrossOriginSheetCache` (`Map<string, Promise<string | null>>`) that `capturePage` (`lib/ingest.ts`) creates once per capture and passes to both the light and the dark style dump, so the dark dump re-parses the text that the light dump fetched. A sheet that fails, times out or is empty resolves to `null`, is remembered for the capture, and is skipped silently with no retry.

The code of both `lib/` files came from the plan's prototype patch, which applied cleanly to `main` at `e52b4ca`. The two architecture write-ups were updated by hand. The dump that comes out is byte-identical to the one of `main` (pinned sha256 of the two-origin check); only the network behaviour changed.

The four Open Questions were resolved by the owner to the plan's proposed defaults, so the patch needed no edit: 5 s timeout, a failed sheet is not retried by the dark pass, a skipped sheet is not logged, and the two-origin check stays a scratch script.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 0 | Apply the prototype patch (`git apply --check`, then `git apply`) | `lib/extract/styleDump.ts`, `lib/ingest.ts` | PASS |
| 1 | Check the patched code against the decisions | `lib/extract/styleDump.ts`, `lib/ingest.ts` | PASS |
| 2 | Describe the new second pass in the tokens-lane write-up | `docs/architecture/tokens-lane.md` | PASS |
| 3 | Note the reuse in the ingestion write-up | `docs/architecture/ingestion.md` | PASS |
| 4 | Run the two-origin scratch check, then delete it | `scratch/xo-probe.mts` (scratch, deleted) | PASS |

Task 1, point by point:

- `fetchCrossOriginSheet` passes `{ timeout: CROSS_ORIGIN_SHEET_TIMEOUT_MS }` to `request.get`; a status that is not ok and an empty body return `null`, and the trailing `.catch(() => null)` covers a failed or timed-out request, so the promise never rejects.
- `collectStyleDump` awaits the texts of `dump.crossOriginHrefs` with one `Promise.all` and iterates the result in that array's order. The per-sheet `try`/`catch` around `page.evaluate`, the `data-distill-id` cleanup and `delete dump.crossOriginHrefs` are all still there.
- `grep -rn "collectStyleDump(" lib eval app .claude/skills/verify/scripts` lists exactly two callers, `lib/ingest.ts:186` (`captureDarkScheme`) and `lib/ingest.ts:311` (`capturePage`); both pass the `sheetCache` that `capturePage` creates at `lib/ingest.ts:310`.

## Validation Results

| Check | Result | Command / environment |
|-------|--------|-----------------------|
| Type check | PASS | `npm run typecheck` (also as step 1 of `npm run check`) — host, Node v22.23.1 |
| Lint | PASS | `npm run lint` (also as step 2 of `npm run check`) — host |
| Build | PASS | `next build` as step 3 of `npm run check` ("Compiled successfully") — host |
| Tests (eval gate) | PASS (3 fixtures at 100%, aggregate 100%, "all gates passed") | `npm run eval` as step 4 of `npm run check` — host |
| Full CI gate | PASS (exit 0) | `npm run check` — host, run after `verify.sh down` |
| E2E 1: two-origin scratch check | PASS (11 checks `ok`, "all checks passed", exit 0) | `npx tsx scratch/xo-probe.mts` — host, headless chromium, loopback only |
| E2E 2: real app, `analyze-url` | PASS (10 checks `ok`, `console-errors.txt` 0 bytes) | `verify.sh up` → `verify.sh drive analyze-url` → `verify.sh down` — host, AI lane off, head `e52b4ca-dirty` |
| E2E 3: full gate | PASS | `npm run check` — host |

Output of the two-origin scratch check:

```
phase 1: no stalled sheet
  capturePage 2621 ms, refetches {"/xo1.css":1,"/missing.css":1,"/xo2.css":1}
  ok   each cross-origin sheet is refetched once per analysis
  ok   light + dark states and keyframes equal the dumps recorded on main (03b64334c378b4131ef96efd8d22631c43a01b2996ad32608d5398b94c23a986)
  ok   the first sheet wins a conflict although the second one arrives first
  ok   the dark dump holds the dark base colour, re-scanned from the reused CSS text
  ok   no data-distill-id attribute is left on the page
phase: 2 sheet(s) whose refetch stalls (no response)
  capturePage 7093 ms, refetches {"/xo1.css":1,"/missing.css":1,"/xo2.css":1,"/stall0.css":1,"/stall1.css":1}
  ok   capturePage returns within 15000 ms (7093 ms)
  ok   a stalled sheet is requested once and not retried by the dark pass
  ok   the other sheets still yield the same states and keyframes
phase: 1 sheet(s) whose refetch stalls (headers, then a body that never ends)
  capturePage 7037 ms, refetches {"/xo1.css":1,"/missing.css":1,"/xo2.css":1,"/stall0.css":1}
  ok   capturePage returns within 15000 ms (7037 ms)
  ok   a stalled sheet is requested once and not retried by the dark pass
  ok   the other sheets still yield the same states and keyframes

all checks passed
```

Eval scores from `npm run check`: `clean-light` 100%, `dark-mode` 100%, `adversarial-shell` 100%, `aggregate combined: 100%`, the same as the baseline on `main`. `eval/baseline.json` is unchanged.

Evidence of the `analyze-url` run: `.verify/runs/20261014-005803-483443/evidence/analyze-url-010135/` (git-ignored).

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/extract/styleDump.ts` | UPDATE | +146/-100 |
| `lib/ingest.ts` | UPDATE | +15/-5 |
| `docs/architecture/tokens-lane.md` | UPDATE | +1/-1 |
| `docs/architecture/ingestion.md` | UPDATE | +1/-1 |

Nothing is committed or staged: the four files are uncommitted changes on the branch, per the project's git policy.

## Deviations from Plan

None in the code or the documents. Two notes on how the checks were run:

- `npm run eval` was not run as a separate command; it ran as the fourth step of `npm run check`, the single command that CI runs. `npm run typecheck` and `npm run lint` were additionally run on their own after Task 1.
- `verify.sh up` was started with its output piped through `tail`, and the shell call did not return within 200 s because the detached server processes kept the pipe open. The instance itself was up: `verify.sh doctor` printed `ok` on all seven checks before the scenario was driven, and `verify.sh down` stopped it before `npm run check`.

## Tests Written

The project has no test framework (`AGENTS.md`), and `npm run eval` replays frozen captures that never call `collectStyleDump`, so no permanent test was added (Open Question 4, resolved: the check stays a scratch script).

| Test File | Test Cases |
|-----------|------------|
| `scratch/xo-probe.mts` (scratch, verbatim from the plan, deleted after the run; `scratch/` removed too) | 11 checks over 3 `capturePage` runs against two loopback origins: each cross-origin sheet refetched once per analysis (404 sheet included); light + dark states and keyframes hash to the value pinned on `main`; the first sheet wins a conflict although it answers 400 ms later; the dark dump holds the dark base colour; no `data-distill-id` left on the page; with 2 sheets that never answer and with 1 that stalls in its body, `capturePage` returns within 15 s, the stalled sheet is requested once, and the other sheets yield the same dumps |

`fetchCrossOriginSheet` is covered through `capturePage` by that script (success, 404, connect stall, body stall, cache hit from the dark pass). The empty-body branch is not exercised by the script.
