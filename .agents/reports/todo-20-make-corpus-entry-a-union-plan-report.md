# Implementation Report

**Plan**: `.agents/plans/completed/todo-20-make-corpus-entry-a-union-plan.md`
**Branch**: `feature/todo-20-make-corpus-entry-a-union`
**Status**: COMPLETE

## Summary

`CorpusEntry` in `eval/corpus.ts` is now an unexported `CorpusEntryBase` (slug, bucket, optional) joined to a union of `{ fixture: string }` and `{ url: string }`, so an entry with neither field no longer compiles. `eval/capture.ts` narrows with `"fixture" in entry`: one narrowing yields both the render target and `source.ref`, which removes `entry.url!` and `entry.fixture!`, and the default fixture-only filter in `selectEntries` uses `"fixture" in e`. `AGENTS.md` gained one Rules & Enforcements row (Types, Level 2).

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Make `CorpusEntry` a union | `eval/corpus.ts` | PASS |
| 2 | Narrow with `in` in the capture script | `eval/capture.ts` | PASS |
| 3 | Record the rule | `AGENTS.md` | PASS |
| 4 | Prove it and run the full check | none (scratch checks) | PASS |

## Validation Results

| Check | Result | Command / environment |
|-------|--------|-----------------------|
| Type check | PASS | `npm run typecheck` (and the typecheck step of `npm run check`): host, Node 22 |
| Lint | PASS | `npm run lint` (and the lint step of `npm run check`): host |
| Build | PASS | build step of `npm run check`: host, no `verify.sh` instance up |
| Tests (eval gate) | PASS (3 sites at combined 100%, `✓ all gates passed`; stripe, linear, vercel skipped as optional) | `npm run eval` step of `npm run check`: host |
| Full check | PASS (exit 0) | `npm run check`: host |
| Assertions removed | PASS (prints `0`; `2` on `main`) | `grep -cE 'entry\.(url|fixture)!' eval/capture.ts` |
| E2E 1: type-level probe | PASS (exit 0, no output; on `main`: exit 2 with `TS2578` and two `TS2322`) | `probe-corpus-types.sh` from the plan, run with the project's `tsc` 5.9.3 on a scratch file outside the repo |
| E2E 2: scratch capture run | PASS (`Capturing clean-light… ok (42 nodes)`, `dark-mode… ok (43 nodes)`, `adversarial-shell… ok (33 nodes)`, no live entry; `clean-light` capture has `source.ref` `clean-light.html` and `finalUrl` `file:///…/eval/fixtures/clean-light.html`) | a scratch copy `eval/capture-probe.scratch.ts` of the changed script, writing to the session scratchpad, run with `npx tsx` from the project root and deleted right after; headless Chromium, `file://` fixtures only |
| E2E 3: corpus untouched | PASS (prints nothing) | `git diff --stat -- eval/corpus eval/baseline.json eval/fixtures` |

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `eval/corpus.ts` | UPDATE | +12/-5 |
| `eval/capture.ts` | UPDATE | +6/-5 |
| `AGENTS.md` | UPDATE | +1/-0 |

## Deviations from Plan

None.

## Tests Written

The project has no unit test framework (AGENTS.md), and `npm run eval` does not import `eval/capture.ts`. The change was exercised by two scratch checks, both deleted after use: a type-level probe whose `@ts-expect-error` requires an entry with neither field to fail and whose `"fixture" in e ? e.fixture : e.url` requires narrowing to `string` on both branches (red on `main`, green after), and a scratch capture run of the changed script against the three committed fixtures, with output in the scratchpad. The URL branch of `captureEntry` is covered only by the type-level probe, since capturing a live entry would hit the network.
