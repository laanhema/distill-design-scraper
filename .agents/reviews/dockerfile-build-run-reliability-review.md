# Code Review: feature/dockerfile-build-run-reliability

**Scope**: Branch `feature/dockerfile-build-run-reliability` vs `main` (uncommitted changes: `Dockerfile`, `package.json`, `package-lock.json`, new `.dockerignore`) — GitHub issue #14 (DIST-008)
**Recommendation**: APPROVE (with nits)

## Summary

The change fixes all four Dockerfile defects from issue #14: the broken `public/` COPY is
removed (no such directory exists), the base image is pinned to
`mcr.microsoft.com/playwright:v1.61.1-jammy` in lockstep with an exact `playwright: "1.61.1"`
pin in `package.json` (tag existence on MCR verified during review; lockfile already resolved
1.61.1, so the one-line lock diff is consistent), `next.config.mjs` (which carries the
load-bearing `serverExternalPackages` setting) is copied into the runner stage, and the
container runs as the image's built-in non-root `pwuser` with `--chown` on every runner-stage
COPY so `.next` stays writable. A new `.dockerignore` keeps `node_modules`, `.next`, `.git`,
`.agents`, and eval fixtures out of the build context. All acceptance criteria are met.

## Issues Found

### Critical

None

### High Priority

None

### Medium Priority

1. **`.dockerignore` does not exclude `.env` / `.env*.local`** (`.dockerignore`; `Dockerfile:14`
   `COPY . .`). The repo's `.gitignore` explicitly anticipates `.env` and `.env*.local`
   (typically holding `ANTHROPIC_API_KEY`), and Docker COPY does not respect `.gitignore` — a
   deployer who builds locally with a `.env.local` present bakes the secret into both image
   stages (recoverable from any layer). No such file exists in the working tree today, so this
   is defense-in-depth, but it is exactly the file class this project tells users to create.
   **Recommendation**: add `.env` and `.env*.local` (or `.env*` plus `!.env.example`) to
   `.dockerignore`.

### Suggestions (Low)

1. **Runner image ships devDependencies** (`Dockerfile:29`). `COPY --from=base /app/node_modules`
   carries `typescript`, `tsx`, `tailwindcss`, etc. into the production image. A
   `npm ci --omit=dev` prune step (or Next `output: "standalone"`) would slim the image
   considerably. Out of scope for the reliability fix — worth a follow-up issue.
2. **`CMD ["npm", "start"]` runs npm as PID 1** (`Dockerfile:40`, pre-existing/unchanged).
   npm's signal forwarding to the `next start` child is historically unreliable, so
   `docker stop` may hit the 10 s SIGKILL timeout. `CMD ["node_modules/.bin/next", "start"]`
   would receive SIGTERM directly. Pre-existing behavior; optional follow-up.
3. **Unanchored `.dockerignore` patterns** (`.dockerignore:15` `eval`, etc.) match at any depth,
   not just the repo root. Harmless with the current tree; anchoring (`/eval`) would make intent
   exact.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | FAIL (pre-existing on `main`: no ESLint config in repo, `next lint` drops into an interactive setup prompt — unrelated to this change) |
| Tests (`npm run eval`) | PASS (clean-light 100%, dark-mode 100%, aggregate 100%, all gates) |
| MCR tag `v1.61.1-jammy` exists | PASS (manifest list fetched, HTTP 200) |

Docker build/run smoke test was not re-executed in this review environment; the
implementation report (`.agents/reports/dockerfile-build-run-reliability-report.md`)
documents a successful build, `whoami` = `pwuser`, and an in-container URL analysis
returning HTTP 200.

## What's Good

- The lockstep comment above the first `FROM` (Dockerfile:1–4) turns an invisible
  cross-file invariant (image tag ↔ `package.json` playwright version) into an explicit,
  discoverable contract, and the exact-version pin in `package.json` enforces the other half.
- `--chown=pwuser:pwuser` on every runner COPY plus `USER pwuser` is the correct minimal
  non-root setup for this image: Chromium launches without `--no-sandbox` workarounds and
  `.next` remains writable for Next's runtime cache.
- Legacy `ENV KEY value` syntax normalized to `ENV KEY=value` (the former is deprecated).
- The `.dockerignore` comments explain *why* each group is excluded, matching the repo's
  documentation style, and the build context shrinks to ~352 kB.

## Recommendation

Approve with nits. The one change worth making before merge is the Medium item — add
`.env*` exclusions to `.dockerignore` so a locally-present API key can never be baked into
an image layer. The Low items are optional follow-ups.
