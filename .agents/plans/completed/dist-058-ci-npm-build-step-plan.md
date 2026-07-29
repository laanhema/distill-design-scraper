# Plan: DIST-058 — Add `npm run build` to CI

## Summary

`.github/workflows/ci.yml` is named "Build, Lint & Eval" but never actually builds the app — it only runs `typecheck` → `lint` → `eval`. `tsc --noEmit` does not catch Next.js App Router client/server boundary violations (e.g. importing a server-only module into a `"use client"` file, a bad route-segment config) — those only surface during `next build`. This plan adds a `Build` step running `npm run build` between `lint` and `eval`, so the workflow name finally matches its steps and a boundary violation fails CI instead of shipping green. The change is a single-file, additive edit to the existing workflow YAML — no new files, no script changes, no application code changes.

## User Story

As a maintainer
I want CI to build the app with `next build`
So that a Next.js-specific failure (client/server boundary violation, bad route config) can't ship green just because `tsc --noEmit` and eslint were satisfied

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT (CI/tooling) |
| Complexity | LOW |
| Systems Affected | `.github/workflows/ci.yml` only |
| GitHub Issue | #106 (DIST-058) |

---

## Patterns to Follow

### Existing workflow step shape

```yaml
// SOURCE: .github/workflows/ci.yml:20-30
- name: Type check
  run: npm run typecheck

- name: Lint
  run: npm run lint

- name: Run eval suite
  run: npm run eval
```

Each step is a `name:` + single-line `run:` invoking the matching `package.json` script — no inline shell logic, no extra flags. The new `Build` step follows the same one-liner shape: `name: Build` / `run: npm run build`.

### `package.json` build script

```
// SOURCE: package.json:8
"build": "next build",
```

No custom flags or env vars are wired into it — `next build` runs exactly as a local dev invocation would, which is what was verified below.

### Prior CI-workflow plan (history/precedent)

```
// SOURCE: .agents/plans/completed/dist-046-ci-workflow-plan.md
Original workflow was scoped to typecheck → lint → eval only; the job's
display name "Build, Lint & Eval" was seemingly aspirational/copy-pasted
even at creation — this issue is the first time `build` actually gets
added to match it.
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `.github/workflows/ci.yml` | UPDATE | Insert a `Build` step (`npm run build`) between `Lint` and `Run eval suite`; workflow name/steps already agree once this lands, no rename needed |

No other file changes are in scope — the issue and its comment both explicitly confirm `.github/workflows/ci.yml` is the only expected file.

---

## Tasks

### Task 1: Insert the `Build` step into the CI job

- **File**: `.github/workflows/ci.yml`
- **Action**: UPDATE
- **Implement**: Add a new step immediately after `Lint` and before `Run eval suite`:
  ```yaml
        - name: Build
          run: npm run build
  ```
  Resulting step order: `Checkout` → `Setup Node.js 20` → `Install dependencies` → `Install Playwright Chromium` → `Type check` → `Lint` → `Build` → `Run eval suite`. This matches the issue's recommended order (`typecheck → lint → build → eval`) and keeps the job's existing `name: Build, Lint & Eval` accurate without renaming it.
  Do **not** set `GEMINI_API_KEY` / `OPENROUTER_API_KEY` anywhere in the workflow or step — the job already runs with neither key in its environment (per `CLAUDE.md`: "CI (`.github/workflows/ci.yml` ...) runs exactly `typecheck` → `lint` → `eval` on Node 20, with no API key in the environment"), and `next build` was verified locally (see End-to-End Verification) to succeed with both keys unset, so no env changes are needed to satisfy the "must not require a key" acceptance criterion.
  Do **not** add `.next/cache` caching in this task — see Risks below for why it's deliberately deferred.
- **Mirror**: `.github/workflows/ci.yml:20-30` (the `Type check` / `Lint` / `Run eval suite` steps) — same `name:` + single-line `run:` shape, same indentation (6 spaces under `steps:`).
- **Validate**: `act -j test` if available locally, otherwise push/open a PR and confirm the Actions run shows all five steps in order and green. Locally, `env -u GEMINI_API_KEY -u OPENROUTER_API_KEY npm run build` must exit 0 (already verified — see below).

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Build (the new step; must succeed without either AI key set)
env -u GEMINI_API_KEY -u OPENROUTER_API_KEY npm run build

# Eval (regression gate, unaffected by this change)
npm run eval
```

## End-to-End Verification

Already performed as part of planning (repo working tree unmodified — `.next` build output was removed afterward):

```bash
$ env -u GEMINI_API_KEY -u OPENROUTER_API_KEY npm run build
...
 ✓ Compiled successfully in 4.6s
   Linting and checking validity of types ...
   Collecting page data ...
 ✓ Generating static pages (4/4)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                                 Size  First Load JS
┌ ○ /                                    29.2 kB         132 kB
├ ○ /_not-found                            996 B         104 kB
└ ƒ /api/analyze                           120 B         103 kB
```

Exit code 0, both `GEMINI_API_KEY` and `OPENROUTER_API_KEY` explicitly unset — confirms the acceptance criterion "the build must not require a key" holds today, before any workflow edit. Local compile time was ~4.6s (plus static-page generation/trace collection), so the build step's marginal cost on a CI runner is expected to be small next to the existing `playwright install --with-deps chromium` and `npm run eval` steps.

After implementing Task 1, re-verify end-to-end by one of:
1. Opening a PR against `main` and confirming the Actions run for this workflow shows a green `Build` step in the correct position (after `Lint`, before `Run eval suite`), or
2. Running the workflow's steps locally in the same order (`npm ci` skipped if `node_modules` already installed) to confirm `npm run build` still exits 0 immediately after `npm run lint` passes.

To exercise the "must fail on a boundary violation" acceptance criterion without committing bad code: temporarily add a server-only import (e.g. `import "playwright"` or any `node:fs` import) to the top of a `"use client"` file such as `app/page.tsx`, run `npm run build` locally, confirm it fails with a boundary-violation error, then revert the temporary edit. This is a manual spot-check, not something to leave in the repo or CI.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Total CI runtime grows (playwright install + build + eval all on a free runner) to a point where jobs queue or feel slow | In scope to *observe*, out of scope to *fix* pre-emptively: local build was ~4.6s to compile plus a few seconds of page-data/trace collection — small next to the existing `playwright install --with-deps chromium` and `eval` steps. Do not add `.next/cache` restore/save (`actions/cache`) in this change; the issue comment frames it as conditional ("if the added time is material"), and pre-optimizing an untested runtime adds workflow complexity (cache key invalidation, restore-keys fallback) for a build that's currently fast. Revisit only if a follow-up observes real queueing/slowness in Actions run history. |
| Build step silently ends up depending on an AI key (e.g. a future code change adds a build-time `env` read that throws when unset) | Out of scope for this change (verified today's `next build` doesn't touch either key), but the CI job's existing "no API key in environment" posture means any future regression here will be caught automatically — no explicit guard needed in the workflow itself. |
| Adding `build` after `lint` but before `eval` could mask a distinct class of failure if build and eval overlap in coverage | Not applicable here — `eval` is a data/extraction-logic regression gate (`eval/run.ts` replaying cached captures), fully orthogonal to `next build`'s compile/bundle/prerender checks. No overlap to worry about. |
| Renaming the job vs. leaving `name: Build, Lint & Eval` as-is | No rename needed — the acceptance criterion is that the name becomes *accurate* once `build` is a real step, not that the name changes. Leave `name: Build, Lint & Eval` untouched. |

---

## Acceptance Criteria

- [ ] `.github/workflows/ci.yml` has a `Build` step running `npm run build`.
- [ ] Step order is `Checkout` → `Setup Node.js 20` → `Install dependencies` → `Install Playwright Chromium` → `Type check` → `Lint` → `Build` → `Run eval suite` (i.e., `typecheck → lint → build → eval` as recommended).
- [ ] No `GEMINI_API_KEY` / `OPENROUTER_API_KEY` is added anywhere in the workflow — the build succeeds with neither present, matching CI's existing no-key posture.
- [ ] The job's `name: Build, Lint & Eval` now accurately reflects its steps (no rename required, just parity).
- [ ] A push or PR to `main` triggers the workflow and the new `Build` step runs and passes.
- [ ] `npm run typecheck`, `npm run lint`, and `npm run eval` all still pass unchanged (no other file touched).
