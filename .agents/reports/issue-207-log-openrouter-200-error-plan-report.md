# Implementation Report

**Plan**: `.agents/plans/completed/issue-207-log-openrouter-200-error-plan.md`
**Branch**: `feature/issue-207-log-openrouter-200-error`
**Status**: COMPLETE

## Summary

OpenRouter answers HTTP 200 with a body that holds only `{ error: { code, message, metadata? } }` when a call fails after the provider accepted it. `firstChoiceText` in `lib/aiLane.ts` now throws on any reply with a non-null `error` field, before it looks for `choices`. The new `providerError` builds the message `OpenRouter API error (code <code> in an HTTP 200 reply): <message>` and attaches the raw error object as `cause`, so Node's `console.warn(err)` also prints the `metadata`. The error reaches `retryOnce`'s `onError` on both attempts, and `warnAiFailure` classifies it the way it classifies a non-2xx status with the same code. `retryOnce`, `warnAiFailure`, and the three lanes are unchanged. `docs/architecture/orchestration.md` states the behavior.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Throw on an `error` body in a 200 reply; update the `firstChoiceText` and `callModel` doc comments | `lib/aiLane.ts` | PASS |
| 2 | Document the behavior | `docs/architecture/orchestration.md` | PASS |

## Validation Results

| Check | Result | Command / environment |
|-------|--------|-----------------------|
| Type check | PASS | `npm run typecheck` (also step 1 of `npm run check`): host, Node v22 |
| Lint | PASS | `npm run lint` (also step 2 of `npm run check`): host |
| Build | PASS | `npm run check` step 3 (`next build`, "Compiled successfully"): host |
| Tests (eval) | PASS: clean-light, dark-mode, adversarial-shell at 100%, `✓ all gates passed` | `npm run check` step 4 (`npm run eval`): host. Eval never runs `callModel` |
| Reproduction / E2E (offline probe) | PASS: exit 1 with 5 failed checks before the fix, exit 0 with all 8 checks passing after it | `npx tsx scratch-openrouter-200-error.ts` from the project root (script verbatim in the plan's End-to-End Verification), deleted after each run: host |

### Offline probe

The probe sets a dummy `OPENROUTER_API_KEY` and replaces `globalThis.fetch` with a stub that returns a canned `Response`, so it makes no network call. It records `console.warn` and drives the real chain the lanes use: `retryOnce(() => callModel(...), (err, attempt) => warnAiFailure("Probe lane", attempt, err))`. It checks these reply shapes:

| Reply | Before the fix (HEAD) | After the fix |
|-------|-----------------------|---------------|
| 200 + `error` 429 "Rate limit exceeded" | `null`, 2 requests, **0 warnings** | `null`, 2 requests, 2 warnings: `Probe lane failed (429 Rate Limit / Quota Exceeded, attempt 1): OpenRouter API error (code 429 in an HTTP 200 reply): Rate limit exceeded` (and attempt 2) |
| 200 + `error` 429 vs. status 429 classification | none vs. `429 Rate Limit / Quota Exceeded` | both `429 Rate Limit / Quota Exceeded` |
| 200 + `error` 400 vs. status 400 | none vs. `400 Bad Request` | both `400 Bad Request` |
| 200 + `error` 502 vs. status 502 | none vs. `error` | both `error` |
| 200 + `choices` with text, no `error` | text, 1 request, 0 warnings | unchanged |
| 200 with neither `choices` nor `error` | `null`, 2 requests, 0 warnings | unchanged |
| 200 + blank `content` | `null`, 2 requests, 0 warnings | unchanged |

A separate `node -e` check confirmed that `console.warn` of an `Error` with this `cause` prints `[cause]: { … metadata: { error_type: 'rate_limit_exceeded' } }`.

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/aiLane.ts` | UPDATE | +25/-7 |
| `docs/architecture/orchestration.md` | UPDATE | +1/-1 |

## Deviations from Plan

None. The `fields` narrowing in `providerError` typechecked as planned, with no casts.

## Tests Written

The project has no unit test framework (`AGENTS.md`), and eval does not reach the AI lane, so the offline probe above stood in for tests. It ran from the project root and was deleted after use; the plan keeps its source verbatim.

| Test File | Test Cases |
|-----------|------------|
| `scratch-openrouter-200-error.ts` (scratch, deleted) | 8 checks: the 200 error makes 2 requests and logs 2 warnings; the warnings carry the code and message; classification parity for 429, 400, and 502; `choices` text unchanged; neither shape → `null`; blank content → `null` |
