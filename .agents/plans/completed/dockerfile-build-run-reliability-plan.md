# Plan: Make the Dockerfile build and run reliably (DIST-008)

## Summary

Fix the four defects in `Dockerfile` in one pass so `docker build` succeeds and the
container launches Chromium reliably: (1) drop the `COPY --from=base /app/public ./public`
line (no `public/` directory exists and the app doesn't need one), (2) pin the base image
to the Playwright version actually installed — `mcr.microsoft.com/playwright:v1.61.1-jammy`
(verified to exist on MCR; the current `mcr.microsoft.com/playwright/node:20-jammy` tag
**does not exist at all**, so the build currently fails at the first `FROM`), (3) copy
`next.config.mjs` into the runner stage (it carries the load-bearing
`serverExternalPackages: ["playwright", "playwright-core"]` setting), and (4) run the
runner stage as the image's built-in non-root `pwuser` with `--chown` on the copied app
files. Supporting fixes required for reliability: add a `.dockerignore` (today `COPY . .`
overwrites the container's freshly `npm ci`-installed `node_modules` with the host's, and
drags in `.git`/`.next`/`.agents`), and pin `playwright` exactly in `package.json` so the
Dockerfile tag and the dependency stay in lockstep, with a comment in the Dockerfile
stating that invariant. Verification is an actual `docker build` + in-container URL-analysis
smoke run, per the issue's technical notes.

## User Story

As a deployer
I want `docker build` to succeed and the container to launch Chromium reliably
So that the documented container deployment path (README "Docker Container") actually works

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | MEDIUM |
| Systems Affected | `Dockerfile`, `.dockerignore` (new), `package.json` + `package-lock.json` (playwright pin) |
| GitHub Issue | #14 (DIST-008, review ref C3 in `.agents/temp/codebase-review-fable-2026-07-23.md:151`) |

---

## Context and Findings (from codebase exploration)

### Current Dockerfile (all four defects)

```dockerfile
# SOURCE: Dockerfile:1-32 (current, broken)
FROM mcr.microsoft.com/playwright/node:20-jammy AS base   # ← tag does not exist on MCR (verified 2026-07-23)
...
COPY . .                                                   # ← no .dockerignore: clobbers node_modules, copies .git/.next
...
FROM mcr.microsoft.com/playwright/node:20-jammy AS runner
...
COPY --from=base /app/public ./public                      # ← no public/ dir in repo → COPY fails
# next.config.mjs never copied                             # ← serverExternalPackages lost at runtime
# no USER directive                                        # ← runs as root
CMD ["npm", "start"]
```

### Facts verified during exploration

- `docker manifest inspect mcr.microsoft.com/playwright:v1.61.1-jammy` → **EXISTS**
  (`v1.61.1-noble` also exists as fallback); `mcr.microsoft.com/playwright/node:20-jammy`
  → **NOT FOUND**. So the build currently fails even before the `public/` COPY.
- Installed Playwright version: `node_modules/playwright/package.json` → **1.61.1**;
  `package.json:22` floats `"playwright": "^1.50.0"`.
- No `public/` directory exists in the repo (Next.js runs fine without one — omit the
  COPY rather than creating an empty dir).
- No `.dockerignore` exists; repo root contains `node_modules/`, `.next/`, `.git/`,
  `.agents/`, `tsconfig.tsbuildinfo` — all currently swept into the build context by
  `COPY . .` at `Dockerfile:10`.
- `next.config.mjs:5` sets `serverExternalPackages: ["playwright", "playwright-core"]` —
  needed at runtime (`npm start`), hence the runner stage must include the file.
- `package.json:15` `postinstall` runs `playwright install chromium`. Inside the MS
  Playwright image, `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` is preset and the matching
  Chromium is preinstalled, so with a version-matched base image this is a cheap no-op
  match rather than a fresh download; the runner stage then relies on the image's
  preinstalled browsers (which is exactly why the tag must be pinned in lockstep).
- The MS Playwright images ship a non-root `pwuser` account; `/ms-playwright` browsers
  are world-readable. Running Chromium as `pwuser` avoids the root-sandbox workarounds
  (`--no-sandbox`), which is the point of issue AC 4.
- `next start` writes to `.next/cache` at runtime → the copied `.next` must be writable
  by `pwuser` (use `COPY --chown`).
- README `README.md:116-121` documents `docker build -t distill .` + `docker run -p
  3000:3000 -e ANTHROPIC_API_KEY=...` — this stays accurate; no README change needed.

---

## Patterns to Follow

### Lockstep-pin comment (invariant demanded by the issue comment)

```dockerfile
# The image tag MUST match the "playwright" version in package.json exactly —
# the runner stage relies on this image's preinstalled browsers, and a version
# mismatch means "browser not found" at launch. When bumping playwright in
# package.json, bump this tag in the same commit (both stages).
FROM mcr.microsoft.com/playwright:v1.61.1-jammy AS base
```

### Modern ENV syntax

Existing lines use the legacy space-separated form (`ENV NODE_ENV production`,
`Dockerfile:12,21-23`), which BuildKit warns about. While editing, normalize to
`ENV NODE_ENV=production` — cosmetic, but silences build warnings in the same pass.

### Existing multi-stage copy list

```dockerfile
# SOURCE: Dockerfile:25-28 — keep this shape, minus public/, plus next.config.mjs, plus --chown
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/.next ./.next
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `.dockerignore` | CREATE | Keep host `node_modules`, `.next`, `.git`, `.agents`, `.claude`, `eval/`, `Dockerfile`, `*.tsbuildinfo` out of the build context so `COPY . .` is deterministic |
| `Dockerfile` | UPDATE | Pin base image, drop `public/` COPY, add `next.config.mjs` COPY, run as `pwuser`, lockstep comment, ENV syntax cleanup |
| `package.json` | UPDATE | Pin `"playwright": "1.61.1"` exactly (lockstep with the image tag) |
| `package-lock.json` | UPDATE | Regenerated by `npm install playwright@1.61.1 --save-exact` (resolved version already 1.61.1 → minimal churn) |

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Create `.dockerignore`

- **File**: `.dockerignore`
- **Action**: CREATE
- **Implement**: Exclude from the build context: `node_modules`, `.next`, `.git`,
  `.agents`, `.claude`, `eval` (fixtures are large and unused by the app build),
  `Dockerfile`, `.dockerignore`, `tsconfig.tsbuildinfo`, `*.md` docs at root
  (`README.md`, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`). Keep `app/`, `lib/`,
  `package*.json`, `next.config.mjs`, `postcss.config.mjs`, `tsconfig.json`,
  `next-env.d.ts` in context.
- **Mirror**: standard Next.js `.dockerignore` shape; no in-repo precedent exists.
- **Validate**: `docker build .` reaches the `npm run build` step with a small context
  (build log shows context transfer well under ~5 MB).

### Task 2: Pin `playwright` exactly in `package.json`

- **File**: `package.json` (+ regenerated `package-lock.json`)
- **Action**: UPDATE
- **Implement**: `npm install playwright@1.61.1 --save-exact` from the project root —
  changes `"playwright": "^1.50.0"` → `"playwright": "1.61.1"`. The lockfile already
  resolves 1.61.1, so churn is limited to the spec strings.
- **Mirror**: issue #14 comment — "keep the base image tag and the `playwright` version
  in `package.json` in lockstep".
- **Validate**: `npm run typecheck && npm run lint` still pass; `git diff package-lock.json`
  shows only the spec change, no version bumps.

### Task 3: Rewrite `Dockerfile`

- **File**: `Dockerfile`
- **Action**: UPDATE
- **Implement**:
  1. Both `FROM` lines → `mcr.microsoft.com/playwright:v1.61.1-jammy`, preceded by the
     lockstep-invariant comment (see Patterns above). Tag existence on MCR verified
     2026-07-23.
  2. Delete `COPY --from=base /app/public ./public` (`Dockerfile:28`).
  3. Add `COPY --from=base /app/next.config.mjs ./next.config.mjs` to the runner stage.
  4. Non-root: add `--chown=pwuser:pwuser` to every runner-stage `COPY --from=base`
     line (node_modules, package.json, .next, next.config.mjs) and add `USER pwuser`
     before `EXPOSE`/`CMD`. `.next` must be writable by `pwuser` for Next's runtime
     cache — `--chown` covers that.
  5. Normalize `ENV` lines to `KEY=value` form.
  6. Keep the two-stage structure, `npm ci`, `npm run build`, `EXPOSE 3000`,
     `CMD ["npm", "start"]` as-is.
- **Mirror**: `Dockerfile:25-28` copy-list shape (minus/plus the lines above).
- **Validate**: `docker build -t distill-test .` completes.

### Task 4: Smoke-test the built image (per issue technical notes — real run, not inspection)

- **File**: none (verification only; any scratch script goes in the session scratchpad,
  not the repo)
- **Action**: VERIFY
- **Implement**:
  1. `docker run -d --name distill-smoke -p 3000:3000 distill-test` (no API key —
     AI lane gracefully falls back, measured lane must still work).
  2. `docker exec distill-smoke whoami` → must print `pwuser` (AC 4).
  3. `curl -s -X POST http://localhost:3000/api/analyze -H 'content-type: application/json' -d '{"url":"https://example.com","mode":"tokens"}'`
     → 200 with a markdown report (proves Chromium launched and a full render pipeline
     ran inside the container; requires container egress to the internet).
  4. `docker rm -f distill-smoke` and remove the test image afterwards.
- **Validate**: all three checks pass.

### Task 5: Repo hygiene gates

- **File**: none
- **Action**: VERIFY
- **Implement**: `npm run typecheck && npm run lint` (per CLAUDE.md git policy) and
  `npm run eval` — must pass unchanged (no `lib/` code was touched; eval guards against
  accidental extraction-lane fallout from the lockfile change).
- **Validate**: all three commands exit 0.

---

## Risks

| Risk | Mitigation |
|------|------------|
| MCR drops `-jammy` tags for future Playwright versions (noble is the new default) | The lockstep comment tells future bumpers to verify the tag; `v1.61.1-noble` verified to exist as fallback — switching distro suffix is acceptable if jammy disappears for a later version |
| `pwuser` lacks write access somewhere Next needs at runtime (`.next/cache`) | `--chown=pwuser:pwuser` on all runner COPYs; smoke test (Task 4) exercises a real render end-to-end, which would surface any EACCES |
| Chromium fails to launch as non-root in *this* container config | The MS Playwright image is designed for exactly this (`pwuser` is its documented non-root account); Task 4 step 3 proves launch, and the AC explicitly requires it |
| Smoke test needs internet egress from the container (`https://example.com`) and MCR pull access | Environment already reached MCR for manifest checks; if egress is blocked, fall back to a host-run local fixture server + `SSRF_ALLOWLIST_HOSTS` with `--add-host` — but prefer the real URL per issue notes |
| `postinstall` (`playwright install chromium`) behavior inside the base stage | With the tag pinned to 1.61.1 the image's preinstalled Chromium already matches; worst case it re-downloads into `/ms-playwright` in the build stage only — runner behavior is unaffected since it uses the image's own browsers |
| Lockfile regeneration churn from Task 2 | `--save-exact` on an already-resolved version limits the diff to spec strings; inspect `git diff package-lock.json` before proceeding |

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Extraction regression gate (no unit test framework in this repo)
npm run eval

# The actual fix under test
docker build -t distill-test .
docker run -d --name distill-smoke -p 3000:3000 distill-test
docker exec distill-smoke whoami                      # → pwuser
curl -s -X POST http://localhost:3000/api/analyze \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com","mode":"tokens"}'  # → 200 + markdown report
docker rm -f distill-smoke && docker rmi distill-test
```

---

## Acceptance Criteria

- [ ] `docker build .` completes at repo HEAD (no `public/` COPY failure) — issue AC 1
- [ ] Base image pinned to `mcr.microsoft.com/playwright:v1.61.1-jammy`, matching
      `package.json`'s (now exact) `playwright` version, with the lockstep-invariant
      comment in the Dockerfile — issue AC 2 + technical note
- [ ] `next.config.mjs` present in the runner image — issue AC 3
- [ ] Container runs as `pwuser` (non-root) and an in-container URL analysis succeeds
      (Chromium launches) — issue AC 4 + technical-note smoke run
- [ ] `npm run typecheck`, `npm run lint`, `npm run eval` all pass
- [ ] No stray scratch files left in the repo
