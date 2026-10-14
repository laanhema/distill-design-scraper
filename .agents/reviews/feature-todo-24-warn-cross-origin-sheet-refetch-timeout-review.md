# Code Review: feature/todo-24-warn-cross-origin-sheet-refetch-timeout

**Scope**: branch `feature/todo-24-warn-cross-origin-sheet-refetch-timeout` vs merge base `1ef9fd4` (no commits yet; uncommitted changes to `lib/extract/styleDump.ts` and `docs/architecture/tokens-lane.md`), checked against issue #197
**Recommendation**: APPROVE

## Summary

The change replaces `.catch(() => null)` in `fetchCrossOriginSheet` (`lib/extract/styleDump.ts:147-154`) with a catch that logs one `console.warn` when the error is Playwright's `errors.TimeoutError`, and still resolves to `null` on every path. The doc comments and `docs/architecture/tokens-lane.md:5` describe the warning. The change is small, correct, and follows the `console.warn` pattern of the best-effort passes in `lib/ingest.ts`. The unrelated working-tree changes (`.agents/issues/todo-issues.md`, `README.md`, the deletion of `TECHSTACK.md`, the untracked `PROJECT-GUIDE.md`) were excluded from the review. The untracked plan and implementation report were read as context; they agree with the code.

Acceptance criteria of #197:

- [x] **A timed-out refetch produces a `console.warn` naming the sheet URL and the timeout.** Met. An independent scratch run of the real `capturePage` against a second origin logged `Cross-origin stylesheet refetch timed out after 5000 ms; skipping its hover/focus states and keyframes: http://127.0.0.1:<port>/stalled.css`. It also warned for a sheet whose refetch got headers and then a stalled body; a request-level probe confirmed that case also rejects with `errors.TimeoutError`.
- [x] **A non-ok status or an empty body is skipped without a log line.** Met. The same run logged nothing for `missing.css` (404), `empty.css` (empty 200) or `ok.css`. These resolve in `.then` (`styleDump.ts:143-146`) and never reach the catch. A refused connection and a DNS failure reject with a plain `Error` (probe: `ECONNREFUSED`, `ENOTFOUND`, not `TimeoutError`), so they also stay silent, as the technical notes in the owner comment require.
- [x] **The warning appears once per sheet per analysis; the dark-scheme pass does not repeat it.** Met. The run logged exactly one warning per stalled sheet across the light and dark dumps. The warning sits inside the promise that `CrossOriginSheetCache` stores (`styleDump.ts:155`), and the only cache is created once per capture at `lib/ingest.ts:310` and passed to both dumps (`lib/ingest.ts:186`, `:311`).
- [x] **The analysis still completes and the report is the same as without the warning.** Met. The capture completed with a dark pass on both trees. The keyframes + `states` fingerprint of the light and dark dumps was `3951b619cc4b` on the branch and on a pre-fix `git worktree` at `HEAD`, which logged no warning.
- [x] **`npm run check` passes.** Met (see Validation Results).

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions (Low)
None

**Noted, not a finding**: No permanent check asserts the warning: `npm run eval` never runs the refetch path, and the `verify.sh drive cross-origin` scenario does not read the server log. The plan scoped this out as a possible follow-up, and no acceptance criterion asks for a committed test or for the gap to be filed. Refused connections and DNS failures remain silent by the owner's design (issue #197 technical notes).

## Validation Results

| Check | Status | Notes |
|-------|--------|-------|
| Build / Type Check | PASS | `npm run check` (typecheck `tsc --noEmit` then `next build`); host, no `verify.sh` instance running |
| Warnings | NONE | `npm run check` log grepped for `warn`/`error`: no hits from tsc, eslint or `next build` |
| Lint | PASS | `eslint .` inside `npm run check`; host |
| Tests | PASS | `npm run eval` inside `npm run check`: `clean-light`, `dark-mode`, `adversarial-shell` 100% each, `✓ all gates passed`. Skipped: `stripe`, `linear`, `vercel` (optional live entries with no committed capture). Eval does not exercise the changed path, so a scratch `npx tsx` script in the scratchpad (with its own `tsconfig` alias mapping) ran the real `capturePage` against local servers on the branch tree and on a pre-fix worktree at `HEAD`: branch logged one warning each for `stalled.css` and `slowbody.css`, none for the 404/empty/ok sheets; pre-fix logged none; identical fingerprints. Worktree removed afterwards |
| UI verification | N/A | No markup, styles or client behaviour changed; the change only adds a server-log line |

## What's Good

- `instanceof errors.TimeoutError` tells a timeout from other failures without parsing the message, and the installed Playwright 1.61.1 reports both the no-headers stall and the stalled-body case as `TimeoutError`.
- The warning is placed inside the cached promise, so the once-per-analysis guarantee comes from the existing cache rather than from extra bookkeeping.
- The promise still never rejects, so the best-effort contract of the refetch pass is unchanged.
- The value import of `errors` is safe: `playwright` is in `serverExternalPackages` and no client file imports `styleDump.ts`.
- The doc comments and `tokens-lane.md` state exactly which failures log and which do not.

## Recommendation

Ready to merge as is. Commit only `lib/extract/styleDump.ts`, `docs/architecture/tokens-lane.md` and the plan/report artifacts, and leave the unrelated working-tree changes out of the commit.
