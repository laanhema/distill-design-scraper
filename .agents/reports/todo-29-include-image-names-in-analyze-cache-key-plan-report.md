# Implementation Report

**Plan**: `.agents/plans/completed/todo-29-include-image-names-in-analyze-cache-key-plan.md`
**Branch**: `feature/todo-29-include-image-names-in-analyze-cache-key`
**Status**: COMPLETE

## Summary

`POST /api/analyze` now builds the analyzed image list once (`data` with the `data:image/...;base64,` prefix stripped, `name` or the `uploaded-image-N` fallback) and passes it to `analyzeImages`. An image request is keyed on `JSON.stringify({ images: imageInputs, mode })`, so the same bytes under another name are a cache miss and the response names the new file. A URL-only request keeps its old key string, `` `${url}::${mode}` ``. The architecture doc and the verify skill's two cache gotchas describe the new key.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Key image requests on their data and names | `app/api/analyze/route.ts` | PASS |
| 2 | Update the docs and verify gotchas | `docs/architecture/api-route.md`, `.claude/skills/verify/features/analyze-api.md`, `.claude/skills/verify/features/analyze-images.md` | PASS |

## Validation Results

| Check | Result | Command / environment |
|-------|--------|-----------------------|
| Type check | PASS | `npm run check` (step `tsc --noEmit`) — host, Node 22 |
| Lint | PASS | `npm run check` (step `eslint .`) — host |
| Build | PASS | `npm run check` (step `next build`, `✓ Compiled successfully`) — host, after `verify.sh down` |
| Tests (eval) | PASS (all four sites, `aggregate combined: 100%`, `✓ all gates passed`) | `npm run check` (step `tsx eval/run.ts`) — host |
| Doc grep (Task 2) | PASS (no match, exit 1) | `grep -n "not part of it\|not the file name\|hashes all image payloads" docs/architecture/api-route.md .claude/skills/verify/features/analyze-*.md` |
| E2E 1: instance up + doctor | PASS (all `ok`, `head 3bada90-dirty`, `ai-lane off`) | `verify.sh up`, `verify.sh doctor` — run `20261102-122452-1163453` |
| E2E 2: renamed upload / repeat | PASS: `b.json 200 0.08s`, `ok renamed upload names renamed.png` (`meta.finalUrl: renamed.png`), `a2.json 200 0.03s`, `ok repeat of first.png is byte-identical`, exit 0 | `/tmp/issue-222/repro.sh /tmp/issue-222/clean-light.png $RUN_DIR/evidence/api-repro-fixed` |
| E2E 3: missing name vs `uploaded-image-1` | PASS: `noname 200 0.079s`, `fallback 200 0.033s`, `cmp` identical, ref `uploaded-image-1` | curl, same evidence dir |
| E2E 4: URL cache unchanged | PASS: `url-1 200 3.73s`, `url-2 200 0.022s`, `cmp` identical, `structureReport: null` | `analyze-api.md` "Tokens mode and cache" recipe |
| Reproduction | PASS (red on HEAD `3bada90`: `FAIL renamed upload: report.source.ref is first.png`, exit 1, run `20261102-122256-1156014`; green after the fix, exit 0) | `/tmp/issue-222/repro.sh <png> <evidence-dir>` with a verify instance up |

No verify instance is left running (`.verify/current.env` absent, no `next dev` process).

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `app/api/analyze/route.ts` | UPDATE | +15/-10 |
| `docs/architecture/api-route.md` | UPDATE | +1/-1 |
| `.claude/skills/verify/features/analyze-api.md` | UPDATE | +1/-1 |
| `.claude/skills/verify/features/analyze-images.md` | UPDATE | +1/-1 |
| `.agents/issues/todo-issues.md` | pre-existing, not part of this work | untouched |

## Deviations from Plan

- E2E 2 expected the renamed post to take "seconds". On a warm instance a small PNG analyzes in about 0.08 s against 0.02-0.03 s for a hit; the 2.5 s of the HEAD run was the route's first compile. The miss is proven by `report.source.ref: renamed.png`, which a cache hit could not return.
- The image branch now tests `imageInputs.length > 0` instead of `images.length > 0` (same length; the list it analyzes).

## Tests Written

| Test File | Test Cases |
|-----------|------------|
| None (no unit test framework; `AGENTS.md`) | Scratch reproduction `/tmp/issue-222/repro.sh` outside the repo (renamed upload is a miss naming the new file; repeat is a byte-identical hit), plus curl checks for the name fallback and the URL cache |
