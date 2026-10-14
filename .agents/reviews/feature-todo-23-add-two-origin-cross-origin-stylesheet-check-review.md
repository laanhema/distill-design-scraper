# Code Review: feature/todo-23-add-two-origin-cross-origin-stylesheet-check

**Scope**: branch `feature/todo-23-add-two-origin-cross-origin-stylesheet-check` vs merge base `a3dd6ef` (no commits; all changes uncommitted), checked against issue #196
**Recommendation**: APPROVE WITH NITS

## Summary

Reviewed the verify-skill changes that add a second fixture origin and the `verify.sh drive cross-origin` scenario: `fixture-server.mjs`, `verify.sh`, `drive.ts`, the three new `eval/fixtures/cross-origin*` files, the new feature entry, `SKILL.md`, `features/README.md`, `docs/architecture/tokens-lane.md` and the `AGENTS.md` rule row. The planning artifacts under `.agents/` were read as context. `.agents/issues/todo-issues.md` holds another session's uncommitted TODO-26 / #212 edits and was left out of scope. The change is small and does what it says. The scenario passes, its negative control fails as it should, and the "skipped" assertions do detect the defect they guard against. Only three documentation nits remain.

Acceptance criteria of #196:

- [x] **The fixture server serves a stylesheet from a second origin, and a fixture page links it.** Met. `doctor` printed `ok GET http://127.0.0.1:35621/cross-origin.css serves the second-origin sheet`, and the scenario's first check confirms that the served page links both `${FIXTURE_XO_URL}/cross-origin.css` and `cross-origin-stalled.css`.
- [x] **A `drive` scenario checks that the cross-origin hover/focus states and keyframes are in the report.** Met. My run gave 24/24 `ok`: hover `background-color → #0b3d91`, focus `border-color → #e8590c` and `@keyframes xo-rise` appear in the API report and on the `Design System Markdown` tab. Evidence: `.verify/runs/20261014-155631-1474677/evidence/cross-origin-155643`.
- [x] **The scenario fails with the cross-origin pass disabled, shown once.** Met. The implementer's evidence `.verify/runs/20261014-155036-1467101/evidence/cross-origin-155125/checks.json` dates from 15:51, after the last code edit at 15:49. It holds exactly the 5 expected `FAIL`s (hover, focus, API keyframes, tab colours, tab keyframes). The issue comment of 2026-10-14 12:54Z quotes the same output.
- [x] **A cross-origin sheet that never answers: the analysis completes and the sheet is skipped.** Met. The render took 7 961 ms, under the 20 s budget. The fixture log shows one `sec-fetch-dest=style` load and one `-` refetch for each sheet. I also checked that the absence checks can fail. A scratch server answered the "stalled" sheet normally, and `/api/analyze` then returned `xo-stalled-fade` in `motion.keyframes` and a hover `box-shadow` change. So `report.motion.keyframes leaves out …` and `report.states leaves out …` are real checks, not ones that always pass.
- [x] **The feature map and the `SKILL.md` scenario table list the new scenario.** Met. See `features/README.md:40`, `SKILL.md:64`, and the new `features/cross-origin-stylesheets.md`, which follows the four-section feature-entry contract.
- [x] **`npm run check` passes.** Met (exit 0, see Validation Results).

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions (Low)

- **L1** `.claude/skills/verify/scripts/drive.ts:23` — The `XO_RENDER_BUDGET_MS` comment says that without the timeout "a stalled sheet costs 30 s per style dump", but the cost is one 30 s timeout per capture. `capturePage` creates a single `CrossOriginSheetCache` and passes it to both the light and the dark dump (`lib/ingest.ts:310-320`), so the dark dump reuses the pending or failed promise. **Why:** A reader who sizes the budget from this comment expects about 60 s without the timeout, but the negative control measured 32.8 s. **Fix:** Reword it to "…without the timeout a stalled sheet costs Playwright's 30 s default once per analysis".
- **L2** `.claude/skills/verify/scripts/verify.sh:120` — `cmd_doctor` expands `$FIXTURE_XO_URL` bare under `set -u`, while `cmd_drive` (line 134) guards the same variable with `${FIXTURE_XO_URL:-}`. **Why:** If an instance was started before this change, `current.env` has no `FIXTURE_XO_URL`. `doctor` then aborts with `FIXTURE_XO_URL: unbound variable` instead of printing a `FAIL` line, and the feature entry's Gotcha only covers `drive`. **Fix:** Use `${FIXTURE_XO_URL:-}` in the doctor check, so that a stale run reports `FAIL GET /cross-origin.css …` and the user is pointed at `down`/`up`.
- **L3** `.claude/skills/verify/scripts/drive.ts:2` — The file's header docblock still says that `verify.sh drive` "supplies APP_URL, FIXTURE_URL, EVIDENCE_DIR and AI_LANE". It does not mention `FIXTURE_XO_URL`, which `SKILL.md:98` now lists. **Why:** The two lists of the env contract disagree. **Fix:** Add `FIXTURE_XO_URL` to the header sentence.

**Noted, not a finding**: The issue's Technical Notes accept that CI does not run the verify skill, so the check stays a manual gate, and the `AGENTS.md` row says so. The plan scoped out a headers-then-stall case and a request-log endpoint.

## Validation Results

| Check | Status | Notes |
|-------|--------|-------|
| Build / Type Check | PASS | `npm run check` (the CI command): its `tsc --noEmit` and `next build` steps; host, run with no verify instance up |
| Warnings | NONE | No warnings in the `npm run check` output (tsc, eslint, next build) |
| Lint | PASS | `npm run check`, its `eslint .` step; host |
| Tests | PASS | `npm run check`, its `npm run eval` step: clean-light, dark-mode and adversarial-shell all at 100%, aggregate 100%, `✓ all gates passed`. Skipped: `stripe`, `linear`, `vercel` (optional live entries with no capture, by design) |
| UI verification | PASS | `verify.sh up` → `doctor` (8/8 ok, head `a3dd6ef-dirty`, AI lane off) → `drive cross-origin` (24/24 ok, 1280×900, render 7 961 ms) → `down`. Evidence: `.verify/runs/20261014-155631-1474677/evidence/cross-origin-155643`. A scratch two-origin server (in the scratchpad, since deleted) confirmed that the stalled-sheet absence checks detect a sheet that is not skipped. The negative control (AC3) was checked from the implementer's `checks.json` and not re-captured |

## What's Good

- The design of the stalled sheet proves the skip without a request log. The browser-applied animation shows that the sheet loaded, and the missing keyframes and `box-shadow` show that the refetch was skipped. The 20 s budget separates the 5 s timeout from Playwright's 30 s default.
- `Sec-Fetch-Dest: style` cleanly separates the browser's load from the app's refetch, and `fileName` keeps `basename` path confinement on both origins.
- `?run=<ms>` defeats the response cache, so repeated runs on one instance exercise the pass again.
- Assertions check colour values and keyframe names rather than palette roles, and a Gotcha says why.
- The fixture is not in `eval/corpus.ts`, and `lib/`, captures and baseline are untouched, as the issue required.

## Recommendation

Merge after the optional nits, or as is. `/fix-findings .agents/reviews/feature-todo-23-add-two-origin-cross-origin-stylesheet-check-review.md L1 L2 L3` would close all three in a few lines.
