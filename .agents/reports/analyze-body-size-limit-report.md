# Implementation Report

**Plan**: `.agents/plans/completed/analyze-body-size-limit-plan.md`
**Branch**: `feature/analyze-body-size-limit`
**Status**: COMPLETE
**GitHub Issue**: #18 (DIST-012)

## Summary

`POST /api/analyze` now enforces an explicit request-body size limit before any processing. A `Content-Length` fast-path rejects declared-oversized bodies without touching the stream; otherwise the body is read incrementally and the stream is cancelled (not drained) the moment the running byte count exceeds the limit. Breaches return **413** before `JSON.parse`, base64 decode, `sharp`, or Playwright are ever reached. The limit is `MAX_REQUEST_BODY_BYTES = MAX_IMAGES × MAX_IMAGE_PAYLOAD_BYTES` (6 × 8 MiB = 48 MiB) with a rationale comment, per the issue's acceptance criteria. App Router route handlers don't apply the legacy `bodyParser` size config, so the limit is enforced by hand as the issue's technical notes prescribe.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Add `MAX_IMAGE_PAYLOAD_BYTES` / `MAX_REQUEST_BODY_BYTES` constants with rationale comment | `app/api/analyze/route.ts` | Done |
| 2 | Add `readBodyWithinLimit` streaming gate + 413 response; swap `request.json()` for gated read + `JSON.parse` | `app/api/analyze/route.ts` | Done |
| 3 | Scratch E2E verification (script deleted after use per CLAUDE.md policy) | `scratch-body-limit-check.ts` (deleted) | Done |

## Validation Results

| Check | Result |
|-------|--------|
| Type check (`npm run typecheck`) | Pass |
| Lint (`npm run lint`) | Pre-existing condition: repo has no ESLint config; `next lint` drops into an interactive setup prompt non-interactively. Not caused by this change. |
| Eval (`npm run eval`) | Pass — clean-light 100%, dark-mode 100%, aggregate 100%, all gates passed |

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `app/api/analyze/route.ts` | UPDATE | +50/-1 |

## Deviations from Plan

None of substance. The scratch script added a fifth check beyond the plan's four (an under-limit ~48 MiB valid-JSON body passes the gate and reaches normal validation), and the oversized-Content-Length case was exercised via a minimal Request-like object because fetch implementations recompute `Content-Length` for string bodies.

## Tests Written

No unit test framework exists in this repo (per CLAUDE.md, `npm run eval` is the correctness gate). The change was exercised end-to-end via a temporary scratch script calling the exported `POST` handler directly, then deleted:

| Check | Result |
|-------|--------|
| Oversized streamed body (no Content-Length, chunked) → 413 | Pass — stream cancelled after ~49 MiB (limit + 1 chunk) |
| Oversized declared Content-Length, tiny body → 413 | Pass |
| Small invalid-JSON body → 400 "Request body must be JSON." | Pass |
| Valid body, no url/images → 400 missing-input | Pass |
| Under-limit ~48 MiB valid JSON → not 413, reaches normal validation | Pass |
