# Code Review: feature/issue-207-log-openrouter-200-error

**Scope**: branch `feature/issue-207-log-openrouter-200-error` vs. its merge base with `main` (`949dc12`), including uncommitted changes (no commits on the branch yet), checked against issue #207
**Recommendation**: APPROVE WITH NITS

## Summary

Reviewed `lib/aiLane.ts` (`firstChoiceText`, the new `providerError`, the `callModel` doc comment, and the unchanged `retryOnce` / `warnAiFailure` that consume the thrown error) and the one-sentence addition to `docs/architecture/orchestration.md`. The untracked plan and implementation report were read as context; neither contradicts the code. The fix is small, cast-free, and placed in the right seam: the three lanes need no change, and the thrown message mirrors the non-2xx message so that `warnAiFailure`'s substring classification treats both paths alike. One cosmetic nit.

Acceptance criteria:

- [x] **200 + `error` body throws with code and message; both attempts log one `warnAiFailure` line.** Met. Re-ran the plan's offline probe (stubbed `fetch`, dummy key) against the branch: a 200 + `error` 429 body gives `null`, 2 requests, 2 warnings, each `Probe lane failed (429 Rate Limit / Quota Exceeded, attempt N): OpenRouter API error (code 429 in an HTTP 200 reply): Rate limit exceeded`. Against HEAD's `lib/aiLane.ts` the same probe gives 2 requests and 0 warnings (5 of 8 checks fail), so the probe detects the defect.
- [x] **Classified like a non-2xx reply with the same code.** Met. Probe: codes 429, 400, and 502 classify as `429 Rate Limit / Quota Exceeded`, `400 Bad Request`, and `error` on both paths.
- [x] **`choices` without `error` unchanged; neither still `null`.** Met. Probe: `choices` text returns on 1 request with 0 warnings; `{ id }` and blank content return `null` after 2 silent requests, as on HEAD. An extra check confirms `{ choices, error: null }` still returns the text.
- [x] **Offline probe described in the implementation report.** Met: `.agents/reports/issue-207-log-openrouter-200-error-plan-report.md`, "Offline probe" section, with the script verbatim in the plan.
- [x] **`npm run check` passes.** Met (see Validation Results).

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions (Low)

- **L1** `lib/aiLane.ts:62` — The edited `callModel` doc comment line runs to 116 characters while the rest of the comment wraps at about 78. **Why:** the paragraph reads unevenly and the next diff of it will reflow anyway. **Fix:** rewrap lines 60-64 to the comment's existing width.

**Noted, not a finding**: (1) A reply that carries both `choices` and an `error` now throws instead of returning the partial text; the plan chose this deliberately (OpenRouter pairs such an `error` with `finish_reason: "error"`), and the issue's criteria cover only `choices` without `error`. (2) An `error` nested inside `choices[0]` (with `finish_reason: "error"` and empty content) is still read silently as an empty reply (extra probe: 2 requests, 0 warnings); the issue scopes the bug to an `error` object in place of `choices`, and this run did not confirm that OpenRouter sends the per-choice shape on non-streaming replies, so it is a follow-up candidate, not a defect of this change. (3) `warnAiFailure`'s substring matching can misclassify a message that happens to contain `400`/`429`; the non-2xx path shares it, and the plan scoped it out. (4) The `RESOURCE_EXHAUSTED` / `INVALID_ARGUMENT` strings stay, as the issue allows when the classification lines are not touched.

## Validation Results

| Check | Status | Notes |
|-------|--------|-------|
| Build / Type Check | PASS | `npm run check` (the command CI runs), steps `tsc --noEmit` and `next build` ("Compiled successfully"); host |
| Warnings | NONE | `npm run check` output on host showed no type, lint, or build warnings |
| Lint | PASS | `npm run check`, `eslint .` step; host |
| Tests | PASS | `npm run check`, `npm run eval` step: clean-light, dark-mode, adversarial-shell at 100%, "all gates passed"; stripe/linear/vercel skipped as optional live entries. Eval never calls `callModel`, so the gate for the change is the offline probe: 8/8 checks pass on the branch, 5/8 fail on HEAD's `lib/aiLane.ts` (run with `npx tsx` from the scratchpad, `node_modules` symlinked, deleted afterwards). Extra edge probe: `error` as a string, `{}`, or with a string code throws with `code unknown` / the raw text; `error: null` with `choices` returns the text |
| UI verification | N/A | No UI or client-side change; server-side logging only |

## What's Good

- The throw sits in `firstChoiceText`, before the `choices` check, so the fix covers every lane through the one seam without touching `retryOnce`, `warnAiFailure`, or the call sites.
- `providerError` narrows `unknown` without casts and still throws on a malformed `error` value, so a provider failure can never read as an empty answer.
- Attaching the raw object as `cause` keeps the `metadata` in the logged error without bloating the message.
- The probe was shown red before the fix and green after it, and it drives the real `retryOnce(callModel, warnAiFailure)` chain.

## Recommendation

Optionally rewrap the doc comment (L1) with `/fix-findings .agents/reviews/feature-issue-207-log-openrouter-200-error-review.md L1`, then commit and open the PR. Consider filing a follow-up for the per-choice `error` shape if OpenRouter's docs confirm it for non-streaming replies.
