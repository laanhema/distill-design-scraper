# Implementation Report

**Plan**: `.agents/plans/completed/dockerfile-build-run-reliability-plan.md`
**Branch**: `feature/dockerfile-build-run-reliability`
**Status**: COMPLETE

## Summary

Fixed all four defects in `Dockerfile` (DIST-008 / issue #14) so `docker build` succeeds
and the container launches Chromium reliably as a non-root user:

1. Base image pinned to `mcr.microsoft.com/playwright:v1.61.1-jammy` (the old
   `mcr.microsoft.com/playwright/node:20-jammy` tag does not exist on MCR), with the
   lockstep-invariant comment above the first `FROM`.
2. Dropped the broken `COPY --from=base /app/public ./public` (no `public/` dir exists).
3. `next.config.mjs` copied into the runner stage (carries `serverExternalPackages`).
4. Runner stage runs as the image's built-in non-root `pwuser`, with
   `--chown=pwuser:pwuser` on every runner-stage COPY (keeps `.next` writable for
   Next's runtime cache).

Supporting changes: new `.dockerignore` (build context dropped to ~352 kB — previously
`COPY . .` swept in host `node_modules`, `.next`, `.git`, `.agents`, eval fixtures), and
`playwright` pinned exactly to `1.61.1` in `package.json` so the dependency and the image
tag stay in lockstep. `ENV` lines normalized to `KEY=value` form.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Create `.dockerignore` | `.dockerignore` | ✅ |
| 2 | Pin `playwright` exactly to 1.61.1 | `package.json`, `package-lock.json` | ✅ |
| 3 | Rewrite `Dockerfile` (pin tag, drop public COPY, add next.config.mjs, pwuser, ENV syntax) | `Dockerfile` | ✅ |
| 4 | Smoke-test built image (build, run, whoami, in-container URL analysis) | — (verification) | ✅ |
| 5 | Repo hygiene gates (typecheck / lint / eval) | — (verification) | ✅ (lint: pre-existing gap, see below) |

## Validation Results

| Check | Result |
|-------|--------|
| `npm run typecheck` | ✅ pass |
| `npm run lint` | ⚠️ pre-existing failure — `next lint` drops into an interactive ESLint setup prompt because the repo has no ESLint config and no `eslint` dependency (verified: nothing in `package.json`, lockfile, or git history). Identical behavior on `main`; unrelated to this change and out of scope. |
| `npm run eval` | ✅ pass (clean-light 100%, dark-mode 100%, aggregate 100%, all gates passed) |
| `docker build -t distill-test .` | ✅ pass (context transfer 351.64 kB; see host-network note under Deviations) |
| `docker exec distill-smoke whoami` | ✅ `pwuser` |
| `POST /api/analyze {"url":"https://example.com","mode":"tokens"}` in-container | ✅ HTTP 200, 52.8 kB JSON with a measured-palette markdown report (3120 chars) — Chromium launched and rendered as non-root |
| Runner image contents | ✅ `next.config.mjs` present at `/app/next.config.mjs`, `.next` owned `pwuser:pwuser` |
| Cleanup | ✅ `distill-smoke` container and `distill-test` image removed; no stray files in repo |

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `.dockerignore` | CREATE | +25 |
| `Dockerfile` | UPDATE | +18/-10 |
| `package.json` | UPDATE | +1/-1 |
| `package-lock.json` | UPDATE | +1/-1 (spec string only, no version bumps) |

## Deviations from Plan

1. **`docker build` needed `--network=host` on this host** — the first build attempt
   failed at `RUN npm ci` with an npm network-connectivity error: the Docker default
   bridge network on this development host has broken egress/DNS for build containers.
   Retrying with `docker build --network=host` succeeded. This is a host-environment
   workaround, not a Dockerfile change — the committed Dockerfile is unmodified by it,
   and on hosts with working bridge networking a plain `docker build -t distill .`
   (as documented in the README) works as-is. Notably the *runtime* container used the
   default bridge network unmodified and had full egress (the example.com analysis
   succeeded), so the gap is specific to build-time networking on this machine.
2. **`npm run lint` could not be executed non-interactively** — pre-existing repo gap
   (no ESLint config anywhere in history), not introduced by this change. Documented
   rather than "fixed", since adding an ESLint setup is outside this plan's scope.

Everything else matched the plan exactly.

## Tests Written

No unit test framework exists in this repo (`npm run eval` is the correctness gate, per
CLAUDE.md). The change is infrastructure-only (Dockerfile/dockerignore/dependency pin);
verification was the plan-mandated end-to-end smoke run: real `docker build`, container
start, `whoami` → `pwuser`, and a full in-container URL-analysis render through
Chromium returning a measured design-system report.

## Acceptance Criteria

- [x] `docker build .` completes at repo HEAD (no `public/` COPY failure) — AC 1
- [x] Base image pinned to `mcr.microsoft.com/playwright:v1.61.1-jammy`, matching the
      now-exact `playwright` version in `package.json`, with the lockstep comment — AC 2
- [x] `next.config.mjs` present in the runner image — AC 3
- [x] Container runs as `pwuser` and an in-container URL analysis succeeds — AC 4
- [x] `npm run typecheck` and `npm run eval` pass (`npm run lint` blocked by
      pre-existing missing ESLint setup, unrelated to this change)
- [x] No stray scratch files left in the repo
