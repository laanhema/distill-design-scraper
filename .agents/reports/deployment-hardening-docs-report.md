# Implementation Report

**Plan**: `.agents/plans/deployment-hardening-docs.plan.md`
**Branch**: `feature/deployment-hardening-docs`
**Status**: COMPLETE

## Summary

Pure documentation change closing issue #4 (DIST-003). Added a "Deploying Publicly — Hardening Guide"
section to `README.md` (threat model, built-in protections, network-restriction example, auth-fronting
guidance) and updated PRD §9/§12/§14 to reflect that SSRF guarding and rate limiting have shipped
(PRs #8, #9) rather than remaining out-of-scope items.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Add "Deploying Publicly — Hardening Guide" section (threat model, 3 layers, iptables example) | `README.md` | ✅ |
| 2 | Update PRD §9 security posture (auth bullet, in-scope SSRF/rate-limit bullets, honest out-of-scope residuals) | `.agents/PRDs/PRD.md` | ✅ |
| 3 | Update PRD §12 Phase 4 checklist item + §14 SSRF risk row | `.agents/PRDs/PRD.md` | ✅ |

## Validation Results

| Check | Result |
|-------|--------|
| Type check (`npm run typecheck`) | ✅ pass, no errors |
| Lint (`npm run lint`) | ⚠️ not run — see Deviations |
| Manual: env vars named in new README section exist in code | ✅ `SSRF_ALLOWLIST_HOSTS`, `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_BUCKETS`, `RATE_LIMIT_DISABLED` all confirmed in `lib/security/ssrfGuard.ts` / `lib/security/rateLimiter.ts` |
| Manual: iptables example ranges match `BLOCKED_IPV4_RANGES` | ✅ (169.254.0.0/16, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 — matches the plan's specified subset) |
| Manual: heading hierarchy consistent with rest of README | ✅ `##`/`###`/`---` pattern matches "Running the Application" section |
| No code files touched | ✅ confirmed via `git diff --stat` — only `README.md` and `.agents/PRDs/PRD.md` changed |

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `README.md` | UPDATE | +59/-0 |
| `.agents/PRDs/PRD.md` | UPDATE | +6/-4 |

## Deviations from Plan

- **`npm run lint` could not be run as specified.** This repo has no ESLint configuration at all
  (no `.eslintrc*`, no `eslint.config.*`, no `eslint` dependency in `package.json`) — `next lint`
  drops into an interactive "set up ESLint from scratch" wizard rather than linting. This is a
  pre-existing environment gap unrelated to this docs-only change; setting up ESLint from scratch
  was out of scope for this plan and risked introducing unrelated config changes, so it was not
  done. `npm run typecheck` was run instead and passes cleanly. Flagging this as a separate
  follow-up the user may want to address (e.g. via a small chore issue), not something this PR
  should silently absorb.
- No other deviations. All three tasks implemented as specified; all technical claims traced back
  to the pinned source lines (`lib/security/ssrfGuard.ts`, `lib/security/rateLimiter.ts`,
  `Dockerfile`) as required by the plan's "measured, never faked" validation note.

## Tests Written

None — this is a documentation-only change per the plan (`Systems Affected` explicitly lists no
code files; "no lib/ change → eval harness untouched"). No new functions or code paths were added.
