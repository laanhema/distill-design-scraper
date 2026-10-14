# Implementation Report

**Plan**: `.agents/plans/completed/todo-23-add-two-origin-cross-origin-stylesheet-check-plan.md`
**Branch**: `feature/todo-23-add-two-origin-cross-origin-stylesheet-check`
**Status**: COMPLETE

## Summary

Added a permanent, one-command manual check of the cross-origin stylesheet pass of `collectStyleDump` (TODO-23, #196). The verify skill's fixture server now listens on a second port of `127.0.0.1` (a second origin) and serves the fixtures' `*.css` there with no CORS headers. A new fixture page, `eval/fixtures/cross-origin.html`, links two sheets from that origin: `cross-origin.css`, which holds every hover/focus state and `@keyframes` on the page, and `cross-origin-stalled.css`, which the server answers for the browser's own load (`Sec-Fetch-Dest: style`) and never for the app's refetch. The new `verify.sh drive cross-origin` scenario analyzes the page through the real UI. It asserts that the first sheet's states and keyframes reach the API report and the `Design System Markdown` tab, that the stalled sheet's keyframes and hover change are skipped while its animation is still measured, and that the render stays under 20 s. The code and fixtures come from the plan's prototype patch, applied unchanged. The verify `SKILL.md`, the feature map, a new feature entry, `docs/architecture/tokens-lane.md` and the `AGENTS.md` rules table document the scenario. `lib/`, `eval/corpus.ts`, the committed captures and `eval/baseline.json` are unchanged.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 0 | Apply prototype patch (`git apply --check` passed on HEAD `a3dd6ef`) | `drive.ts`, `fixture-server.mjs`, `verify.sh`, `eval/fixtures/cross-origin*` | PASS |
| 1 | Check the patched code against the Decisions (no `__XO_ORIGIN__` in other fixtures, no CORS header on the second origin, `${FIXTURE_XO_URL:-}` in `cmd_drive`, no role assertions) | `.claude/skills/verify/scripts/*`, `eval/fixtures/cross-origin*` | PASS (no edits needed) |
| 2 | Document the second origin and the scenario | `.claude/skills/verify/SKILL.md` | PASS |
| 3 | Feature entry + feature map | `.claude/skills/verify/features/cross-origin-stylesheets.md`, `.claude/skills/verify/features/README.md` | PASS |
| 4 | Name the scenario in the tokens-lane write-up | `docs/architecture/tokens-lane.md` | PASS |
| 5 | Rule row | `AGENTS.md` | PASS |
| 6 | Negative control: scenario fails with the pass disabled; edit reverted | `lib/extract/styleDump.ts` (temporary) | PASS |

## Validation Results

| Check | Result | Command / environment |
|-------|--------|-----------------------|
| Type check | PASS | `npm run typecheck`, and the `tsc --noEmit` step of `npm run check` (host, Node v22) |
| Lint | PASS | `npm run lint`, and the `eslint .` step of `npm run check` (host) |
| Shell syntax | PASS | `bash -n .claude/skills/verify/scripts/verify.sh` (host) |
| Build | PASS | `next build` step of `npm run check`, run after `verify.sh down` (host) |
| Tests (eval gate) | PASS (3/3 fixtures 100%, aggregate 100%, `✓ all gates passed`; same as baseline) | `npm run check` (exit 0) (host) |
| E2E 1: `verify.sh up` + `doctor` | PASS (every line `ok`, including `GET http://127.0.0.1:36763/cross-origin.css serves the second-origin sheet`) | `.claude/skills/verify/scripts/verify.sh up`, `… doctor` (host, AI lane off, head `a3dd6ef-dirty`) |
| E2E 1: `drive cross-origin` (first run) | PASS (24/24 ok, exit 0, render 7 916 ms, `console-errors.txt` empty) | `verify.sh drive cross-origin` → `.verify/runs/20261014-155036-1467101/evidence/cross-origin-155049` |
| E2E 1: `drive cross-origin` (second run, same instance) | PASS (24/24 ok, render 7 803 ms) | `…/evidence/cross-origin-155101` |
| E2E 1: fixture log | PASS (per run: one `sec-fetch-dest=style` and one `sec-fetch-dest=-` line for each of the two sheets) | `grep sec-fetch-dest "$RUN_DIR/logs/fixture.log"` |
| E2E 2: negative control, pass disabled (Task 6) | PASS (exit 1, exactly the 5 expected `FAIL`s; reverted, `git diff --quiet -- lib/`) | `if (false && …)` at `lib/extract/styleDump.ts:655` → `…/evidence/cross-origin-155125` |
| E2E 2: negative control, refetch timeout removed (optional) | PASS (exit 1, only `render finished within 20000 ms despite the stalled sheet — 32876 ms` fails; reverted) | `request.get(href)` at `lib/extract/styleDump.ts:137` → `…/evidence/cross-origin-155140` |
| E2E 2: re-run after revert | PASS (24/24) | `…/evidence/cross-origin-155222` |
| E2E 3: existing scenarios | PASS (`analyze-url` 13/13, `analyze-images` 18/18) | `verify.sh drive analyze-url`, `verify.sh drive analyze-images` |
| E2E 4: full gate + tree state | PASS (`npm run check` exit 0; `lib/`, `eval/corpus.ts`, `eval/corpus/`, `eval/baseline.json` unchanged; no scratch file; no `next dev`/fixture process left) | `npm run check`, `git status --short` |

Negative control output (pass disabled), verbatim `FAIL` lines:

```
FAIL  report.states has the cross-origin hover change — []
FAIL  report.states has the cross-origin focus change — []
FAIL  report.motion.keyframes has the cross-origin @keyframes xo-rise
FAIL  tokens tab shows the cross-origin hover and focus colours
FAIL  tokens tab shows @keyframes xo-rise

5 check(s) failed — evidence: /home/lauri/github/distill-design-scraper/.verify/runs/20261014-155036-1467101/evidence/cross-origin-155125
```

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `.claude/skills/verify/scripts/drive.ts` | UPDATE (patch) | +62/-0 |
| `.claude/skills/verify/scripts/fixture-server.mjs` | UPDATE (patch) | +37/-3 |
| `.claude/skills/verify/scripts/verify.sh` | UPDATE (patch) | +9/-3 |
| `eval/fixtures/cross-origin.html` | CREATE (patch) | +48 |
| `eval/fixtures/cross-origin.css` | CREATE (patch) | +17 |
| `eval/fixtures/cross-origin-stalled.css` | CREATE (patch) | +10 |
| `.claude/skills/verify/SKILL.md` | UPDATE | +7/-5 |
| `.claude/skills/verify/features/cross-origin-stylesheets.md` | CREATE | +31 |
| `.claude/skills/verify/features/README.md` | UPDATE | +2/-1 |
| `docs/architecture/tokens-lane.md` | UPDATE | +1/-1 |
| `AGENTS.md` | UPDATE | +1/-0 |

Pre-existing, not part of this work: `.agents/issues/todo-issues.md` was already modified on `main` by another session (TODO-26 / #212). It was carried onto the branch untouched, and was not staged or edited.

## Deviations from Plan

- **`SKILL.md`, two edits beyond Task 2's list**: line 31 now says all three ports are random unless `APP_PORT`, `FIXTURE_PORT` or `FIXTURE_XO_PORT` is set (it said "Both ports"), and the `drive.ts` helper line lists `FIXTURE_XO_URL` among the env vars `verify.sh drive` sets. Both statements went stale with the patch.
- **Task 4 wording**: the plan's "one sentence" was two sentences. They are joined with a semicolon into one sentence at the end of the paragraph, with the same content.
- **Open Questions**: the orchestrator adopted all four proposed defaults, so Task 1 needed no edit for them.
- **Tests**: the project has no test framework (`AGENTS.md`). The new scenario is the test, exercised as above together with its two negative controls. No scratch script was needed.

## Tests Written

| Test File | Test Cases |
|-----------|------------|
| `.claude/skills/verify/scripts/drive.ts` (`scenarioCrossOrigin`) | 24 checks: page links both second-origin sheets; 13 shared design-report/UI checks; hover `#0b3d91` and focus `#e8590c` in `report.states`; `@keyframes xo-rise` in `report.motion.keyframes`; stalled sheet's animation measured; its `@keyframes` and hover `box-shadow` left out; render < 20 000 ms; tokens tab shows both colours and `@keyframes xo-rise`, and leaves out `@keyframes xo-stalled-fade` |
| `.claude/skills/verify/scripts/verify.sh` (`cmd_doctor`) | second origin serves `cross-origin.css` |
