# Code Review: feature/todo-29-include-image-names-in-analyze-cache-key

**Scope**: branch `feature/todo-29-include-image-names-in-analyze-cache-key` vs merge base `3bada90` (no commits on the branch; uncommitted changes only), checked against issue #222
**Recommendation**: APPROVE WITH NITS

## Summary

Reviewed the uncommitted changes to `app/api/analyze/route.ts` (the cache key now hashes `JSON.stringify({ images: [{data, name}], mode })` for image requests and keeps `` `${url}::${mode}` `` for URL requests), `docs/architecture/api-route.md`, and the verify skill's `features/analyze-api.md` and `features/analyze-images.md`; the untracked plan and implementation report were read as context. `.agents/issues/todo-issues.md` has unrelated uncommitted changes and was left out of the review at the caller's request. The fix is correct and minimal: the route builds the analyzed list once, so the key and `analyzeImages` read the same `{data, name}` values, including the `uploaded-image-N` fallback and the merged deprecated `image`/`imageName` alias. One verify-skill line elsewhere still describes the old key.

Acceptance criteria:
- **Same bytes under a different name is a miss and `report.source.ref` names the new file** — met. Implementer evidence `.verify/runs/20261102-122452-1163453/evidence/api-repro-fixed/b.json` (written 12:25:08, after the last edit of `route.ts` at 12:24:37) has `report.source.ref` and `meta.finalUrl` `renamed.png` and a `capturedAt` later than `a1.json`'s, so it was a fresh analysis; the pre-fix run `20261102-122256-1156014` returned `first.png`.
- **Identical request is still a hit with a byte-identical body** — met. `a1.json` and `a2.json` are byte-identical (`cmp`), including `capturedAt`, which a fresh analysis would change; `noname.json` and `fallback.json` share `capturedAt` too, so a missing name and `uploaded-image-1` share one entry.
- **Key can't join different name/data pairs into one string** — met. `route.ts:155-159` hashes `JSON.stringify({ images: imageInputs, mode })`; a URL key always ends in `::<mode>` and a JSON key ends in `}`, so the two kinds can't collide either.
- **URL requests cache exactly as before** — met. With no images, the old template `` `${url || ""}:${""}:${mode}` `` and the new `` `${url || ""}::${mode}` `` are the same string (`route.ts:158`); `url-1.json`/`url-2.json` in the same evidence directory are byte-identical.
- **Verify skill gotchas in `analyze-api.md` and `analyze-images.md` updated** — met (`analyze-api.md:32`, `analyze-images.md:36`).

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions (Low)
- **L1** `.claude/skills/verify/features/README.md:18` — The verify skill's driving conventions still say "The in-memory cache is keyed on the URL or image bytes plus `mode`", which leaves out the file names that the key now covers. **Why:** an agent driving the UI reads this line before the per-feature gotchas and would expect a re-upload of the same bytes under another name to be a cache hit, contradicting `analyze-images.md:36`. **Fix:** reword to "keyed on the URL plus `mode`, or each image's bytes and file name plus `mode`".

**Noted, not a finding**: `TODO.md:12` is still unchecked; ticking it belongs to the done step (`/update-todo`), not this change. The plan's accepted risk that hashing up to 6 × 8 MiB of JSON costs one extra string copy (and `stripDataUrlPrefix` now runs before the cache lookup, not only on a miss) is not measured here as a problem.

## Validation Results

| Check | Status | Notes |
|-------|--------|-------|
| Build / Type Check | PASS | `npm run check` (steps `tsc --noEmit`, `next build`: `✓ Compiled successfully`); host, Node 22.23.1; no verify instance running |
| Warnings | NONE | No warning lines in the `npm run check` output (tsc, eslint, next build) |
| Lint | PASS | `npm run check` (step `eslint .`); host |
| Tests | PASS | `npm run check` (step `tsx eval/run.ts`): 4 sites at combined 100%, `✓ all gates passed`. Skipped: `stripe`, `linear`, `vercel` (no capture/expected; live-URL entries). Eval does not exercise the route; the route's behaviour is proven by the verify-harness evidence above |
| UI verification | N/A | API-only change (no markup, styles, or client code). API behaviour checked from the implementer's `/verify` evidence in `.verify/runs/20261102-122452-1163453/evidence/api-repro-fixed/`, captured after the last source edit and inspected independently (`jq` on `report.source.ref`, `meta.finalUrl`, `meta.capturedAt`; `cmp` on the repeat pairs) |

## What's Good

- The analyzed image list is built once and shared by the key and `analyzeImages`, so the key's name fallback can't drift from the report's.
- The URL key string is preserved byte-for-byte, so URL caching is unaffected by construction rather than by test alone.
- The new comment states why names are in the key and why JSON is used; the docs were updated in the same change.
- The implementer showed red on the pre-fix head and green after, with the hit/miss proved by `capturedAt` and `report.source.ref` rather than by timing alone.

## Recommendation

Merge after optionally fixing L1 (a one-line doc reword): `/fix-findings .agents/reviews/feature-todo-29-include-image-names-in-analyze-cache-key-review.md L1`.
