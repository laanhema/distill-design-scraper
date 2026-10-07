---
name: verify
description: Launch and drive Distill (the Next.js URL/image → design-system report app) through its real browser UI and /api/analyze endpoint, then capture screenshots, ARIA snapshots, API responses and downloaded files as proof. Use to prove a UI, API, or extraction change works end to end in the running app, beyond what `npm run eval` covers.
---

# Verify Distill

Distill has one primary surface: the single-page UI at `/` (`app/page.tsx`), which POSTs to `/api/analyze`. The API route is a secondary surface that can be driven with `curl`. `npm run eval` covers offline extraction scoring only. Use this skill to prove behavior in the running app.

Everything goes through one helper. Run it from the repo root:

```bash
.claude/skills/verify/scripts/verify.sh up        # start a disposable instance
.claude/skills/verify/scripts/verify.sh doctor    # is it worth driving?
.claude/skills/verify/scripts/verify.sh drive <scenario> [--flag value]
.claude/skills/verify/scripts/verify.sh down      # stop what `up` started; evidence kept
```

Read [`features/README.md`](features/README.md) before driving. It holds the feature map and lists which scenario or `curl` recipe covers each entry point.

## Launch

`verify.sh up` starts two process groups, each in its own session:

- **Fixture server** (`scripts/fixture-server.mjs`): serves `eval/fixtures/*.html` (`clean-light`, `dark-mode`, `adversarial-shell`) on `http://127.0.0.1:<FIXTURE_PORT>/`. This is verification scaffolding. It gives the app a known page to analyze without the network.
- **App**: `next dev -p <APP_PORT> -H 127.0.0.1` with:
  - `SSRF_ALLOWLIST_HOSTS=127.0.0.1`, so the SSRF guard allows the fixture server. Every other private address is still blocked, and the `error` scenario depends on that.
  - `GEMINI_API_KEY=` and `OPENROUTER_API_KEY=` set empty, so the AI lane is **off**. Next never overrides an env var that is already defined, so `.env.local` keys are ignored. The run stays deterministic, free, and offline. Start with `VERIFY_AI=1 verify.sh up` to keep the `.env.local` keys. That run makes real paid model calls.
  - Any other env var you prefix on `up` reaches the app, for example `RATE_LIMIT_MAX_REQUESTS=2 verify.sh up` or `RATE_LIMIT_DISABLED=1 verify.sh up`.

Both ports are random free ports unless you set `APP_PORT` or `FIXTURE_PORT`. The instance is ready when `up` prints `ready: app http://127.0.0.1:<port> …`. The first request compiles the page, so allow up to about 30s. `up` polls `GET /` until the `<h1>Distill</h1>` shell renders, or fails after 120s and names the log.

Run state is in `.verify/current.env` (`RUN_ID`, `RUN_DIR`, `APP_URL`, `FIXTURE_URL`, PGIDs, `AI_LANE`, `GIT_HEAD`). Run `source .verify/current.env` to get `$APP_URL`, `$FIXTURE_URL` and `$RUN_DIR` for `curl` recipes. The `.verify/` directory is git-ignored.

**Isolation:** use one instance per checkout. `next dev` writes to the shared `.next/` directory, so `up` refuses to start when this checkout already has a Next.js process, such as the user's own `npm run dev`. It also refuses while a previous run is still up. Don't work around this. Reuse the existing run, or ask the user. Don't run `npm run build` while an instance is up, because the build also writes `.next/`.

## Doctor

`verify.sh doctor` is read-only. Run it first, and again whenever anything looks wrong. It checks these things:

- The run's process groups are alive.
- `APP_PORT` is owned by our process group, not a stranger's server.
- `GET /` renders the Distill shell.
- The fixture server serves `clean-light.html`.
- `POST /api/analyze` with `{}` answers `400`.
- No foreign Next.js process is running in this checkout.

It also prints `run`, `head` (`-dirty` when tracked files changed) and `ai-lane`. Any `FAIL` exits 1. Read `$RUN_DIR/logs/next.log` and `fixture.log`, then run `down` and `up` again.

## Drive

`verify.sh drive <scenario>` runs `scripts/drive.ts`, a headless Playwright Chromium driver, against the running instance. It runs Chromium with real scrollbars, so a scrollbar appearing shifts layout as it does for a user. It uses only user-visible handles: button names (`URL Input`, `Image Input`, `Analyze`, `Analyze Images`, `Design System Preview`, `Design System Markdown`, `Layout Structure Markdown`, `Download Design System .md`, `Download Layout Structure .md`, `Download Tailwind @theme`, `Remove image N`), the URL box's placeholder `https://stripe.com`, the file input `#image-input` (hidden behind the drop-zone label), thumbnail `img` alt text equal to the file name, and the error text `Couldn't analyze this input.`.

| Scenario | Flags (defaults) | Proves |
| --- | --- | --- |
| `analyze-url` | `--target clean-light` (fixture name or any `http(s)` URL) | URL → report, preview, structure tab, AI-lane label |
| `tabs-downloads` | `--target clean-light` | each tab shows the right markdown; all three downloads match the API payload |
| `tab-layout` | `--target clean-light`, `--widths 1280,1024,768,390` | at each width, the result header's tab and download buttons keep identical boxes across tab switches, every label stays on one line, and the page has no horizontal overflow |
| `analyze-images` | `--fixtures clean-light,dark-mode,adversarial-shell`, `--remove <n>` (default: last) | upload, thumbnails, remove, palette-mood report, structure behavior with and without a key |
| `error` | `--url http://10.0.0.1/` | a blocked URL gives a 400, the error banner, and no result tabs |

Each check prints `ok` or `FAIL`. The command exits 1 if any check fails. A scenario that throws records `scenario ran to completion: FAIL` and saves `failure.png`. A `--target` outside `127.0.0.1` reaches the public internet and real third-party pages, so results vary between runs.

For behavior no scenario covers, add a scenario to `drive.ts` with the same `check()` and `shot()` helpers rather than one-off scripts, and add it to the feature map. The API surface is driven with `curl`; see [`features/analyze-api.md`](features/analyze-api.md).

## Evidence

Each `drive` writes to `$RUN_DIR/evidence/<scenario>-<HHMMSS>/`, that is `.verify/runs/<run-id>/evidence/…`:

- `NN-<step>.png`: a full-page screenshot of every step, including the action (`url-entered`, `loading`, `images-selected`, `image-removed`) and the resulting state (`result-preview`, `tab-*`, `error`).
- `NN-<step>.aria.yaml`: the ARIA snapshot of `<main>` at that step. Quote it when a claim depends on text or labels.
- `response.json`: the `/api/analyze` body with base64 screenshots replaced by length placeholders. `report.md` and `structure.md` hold the markdown the API returned.
- `downloads/`: the files the browser actually saved. `inputs/`: the PNGs that were uploaded.
- `checks.json`: every check with its result. `console-errors.txt`: browser console errors and page errors. An empty file is a pass signal worth citing.
- For `curl` recipes, save bodies under `$RUN_DIR/evidence/api-<HHMMSS>/` yourself.

Proof standards:

- Drive the real user path: type into the box and click the button. Don't call extractors or `analyzeUrl` directly; that is `npm run eval` or a scratch script, not verification.
- Capture the action and the resulting state, not only the final screen.
- Verify side effects alongside what is visible. A download proves itself by its saved bytes matching the API payload, not by the button click. A cache hit proves itself by a near-zero `time_total` and a byte-identical body.
- With `ai-lane off`, nothing reaches a model provider. A claim about the AI lane (`identity`, refinements, inferred image structure, `aiApplied: true`) needs a `VERIFY_AI=1` run. Say which mode a proof used.
- Cite `GIT_HEAD` from `doctor` in the proof, so the reader knows which code was driven.

## Cleanup

`verify.sh down` sends SIGTERM to the two process groups recorded in `.verify/current.env`, waits up to 10s, sends SIGKILL to anything left in those groups, and deletes `current.env`. It never kills by process name. It never touches `.verify/runs/`, so evidence and logs survive and the command prints their path. Run `down` after every run, including failed or abandoned ones. If `up` failed partway, run `down` anyway: it handles a partial state. Delete old `.verify/runs/<run-id>/` directories only when the user asks.

## Helpers

All helpers are in `.claude/skills/verify/scripts/`:

- `verify.sh up|doctor|drive|down`: the lifecycle commands described above.
- `drive.ts`: the Playwright scenarios. `verify.sh drive` runs it with `APP_URL`, `FIXTURE_URL`, `EVIDENCE_DIR` and `AI_LANE` set. Don't run it directly.
- `fixture-server.mjs <port> <dir>`: a static server for the fixture HTML, started by `up`.

`drive.ts` is covered by the repo's `tsconfig` and `eslint`. Run `npm run typecheck && npm run lint` after you edit it.
