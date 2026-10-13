# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Codex, …) when working with code in this repository. `CLAUDE.md` is a one-line `@AGENTS.md` pointer — this file is the only place to edit agent guidance.

## What this is

**Start here by task.** Each subsystem has a write-up in `docs/architecture/`; read the one for your task before editing the code it covers:
- Touching extraction logic (`lib/extract/*`)? Read [`tokens-lane.md`](docs/architecture/tokens-lane.md) or [`structure-lane.md`](docs/architecture/structure-lane.md), then the eval harness section below.
- Adding a report field? Read [`schema.md`](docs/architecture/schema.md) — the optional-field + provenance + conditional-`render*` contract is mandatory.
- Wiring ingestion or the API route? Read [`ingestion.md`](docs/architecture/ingestion.md), [`security.md`](docs/architecture/security.md), and [`api-route.md`](docs/architecture/api-route.md).
- Editing the UI (`app/page.tsx`, theme colours)? Read [`frontend.md`](docs/architecture/frontend.md) — colours come from semantic tokens only.
- Anything else? [`orchestration.md`](docs/architecture/orchestration.md) first, then drill down.

Distill turns a URL or one-or-more uploaded images into a Markdown design-system / layout-structure report: YAML frontmatter (the machine-parseable contract) followed by a human-readable body _derived from the same object_, so the two can never drift. It runs two largely independent extraction tracks — the **design-tokens lane** (palette, typography, spacing, recipes, states, motion) and the **structure lane** (page skeleton, component map, section digest) — which can run alone or together (`mode: "tokens" | "structure" | "both"`).

The prevailing design principle across the codebase: **measured, never faked**. Every lane stamps a `provenance` (`measured` / `inferred` / `ai`), every schema field for an unmeasured lane is optional and simply omitted rather than synthesized, and any heuristic fallback (e.g. an inferred `on-primary` swatch, an AI-refined color role) is honestly labeled as such rather than presented as a real measurement. Preserve this invariant when touching extraction code — a missing signal should produce an omitted field, not a guessed one.

## Commands

```bash
npm run dev             # Next.js dev server (http://localhost:3000)
npm run build           # production build
npm run start           # serve the production build
npm run typecheck       # tsc --noEmit — run this after any lib/ change
npm run lint            # eslint . — run after any change, alongside typecheck
npm run check           # typecheck → lint → build → eval; the command CI runs (npm test is an alias)

npm run eval            # regression gate over the measured extraction lane (see below)
npm run eval:capture    # (re)capture eval/corpus/*/capture.json from live fixtures/URLs
npm run eval:ai         # stability check on AI-lane outputs across repeated runs
```

There is no unit test framework (no jest/vitest) — `npm run eval` is the correctness gate for extraction logic. `postinstall` runs `playwright install chromium` automatically. CI (`.github/workflows/ci.yml`, on push/PR to `main`) runs `npm ci` + `npx playwright install --with-deps chromium`, then `npm run check` on Node 20, with no API key in the environment — so anything that only passes with a key set will fail there.

### The eval harness (`eval/`) — read before touching any `lib/extract/*`

`npm run eval` replays committed captures in `eval/corpus/<slug>/capture.json` (produced once via `npm run eval:capture`, then git-committed) against hand-authored `eval/corpus/<slug>/expected.yaml`, entirely offline — no browser, no network. **Coverage scope:** The eval runner scores committed required fixtures (`clean-light`, `dark-mode`, and `adversarial-shell` — a `hostile`-bucket page with deep wrapper-div nesting and near-duplicate colors that stresses squash/ontology and palette merging; its `expected.yaml` documents why it asserts the *correct* names, so don't edit it to match degraded output) and fails if any required corpus entry is missing its capture or expected spec. Live reference entries without committed captures (`stripe`, `linear`, `vercel`) are explicitly marked `optional: true` in `eval/corpus.ts` and logged as skipped. The harness covers offline measured token extraction and heuristic structure extraction; it does not cover live third-party site renders or AI-lane enrichment passes. It's wired as a two-part gate:

- an absolute floor per site (`SITE_FLOOR` in `eval/run.ts`), and
- no site's combined score may drop below `eval/baseline.json`.

**Both lanes are scored.** When a capture carries `rawHarvestNode`, the runner also runs the structure lane and scores it via `eval/scoreStructure.ts` (section-digest order/names/instance counts, region names against `skeletonAscii`, component-map counts). `combinedScore` in `eval/score.ts` then weights palette 0.5 / typography 0.3 / structure 0.2 — the older palette 0.6 / typography 0.4 split only applies to captures with no harvest. A structure-lane *exception* is deliberately scored as `0` rather than skipped, so a crash can't leave the gate green. The runner passes `forceHeuristicNaming: true`, which short-circuits the Stage 7 AI labeller before any availability check — eval stays offline and deterministic even when an API key is set locally (and consequently never exercises AI naming or `sectionDescriptions`).

Workflow when changing any extractor (`lib/extract/**`, `lib/emit.ts`, `lib/analyze.ts`):

1. Make the change.
2. Run `npm run eval`. It must pass unchanged unless the score change is the _intended_ result of your fix.
3. Only then, refresh the baseline deliberately: `UPDATE_BASELINE=1 npm run eval`.

New optional schema lanes (e.g. `recipes`, `states`, `paletteDark`, `motion`, structure `sections`) are additive by construction — old committed `capture.json` fixtures simply won't populate the new fields, and the code must treat that as "nothing observed" (omit the section) rather than erroring. Don't refresh eval fixtures just to exercise a new lane; verify new extraction logic against a synthetic fixture/local server instead (see "Manually verifying extraction changes" below), and only touch `eval/corpus/*/capture.json` when the capture _shape itself_ changes — this has happened twice already (the responsive-harvest + dark-scheme passes, then the full-page panorama pass), which is why the committed captures carry `responsiveHarvests`/`darkCapture`/`scrollShots`/`panoramaShot` fields. The motion lane is the live illustration of the rule working: `clean-light` and `dark-mode` contain no `motion`/`keyframes` at all, so `extractMotion` returns `undefined` and the section is simply absent from their reports. `adversarial-shell` is the only committed capture that populates `motion` and `states` (none produce `paletteDark`), and eval doesn't score either lane — so it can catch a crash in them, but not a wrong value.

Note that `eval/capture.ts` drives Playwright directly (`chromium.launch` + `page.goto`) rather than going through `renderUrl` — deliberately, so the SSRF guard doesn't block capturing from `localhost` fixture servers. Scratch scripts that test against a local synthetic server need the same trick or an `SSRF_ALLOWLIST_HOSTS=localhost` env.

### Manually verifying extraction changes

Because eval fixtures are frozen JSON, testing anything that depends on live page behavior (CSSOM `:hover` rules, ARIA attributes, new capture fields) requires an actual render. The established pattern: spin up a local `http.createServer` serving a small synthetic HTML string, call `renderUrl` + `captureFromRender` + `extractFromCapture` (from `lib/analyze.ts`) against it, and inspect the resulting `report`/`markdown`. `renderUrl` runs the SSRF guard first, which blocks loopback addresses — either run the scratch script with `SSRF_ALLOWLIST_HOSTS=localhost`, or drive Playwright directly like `eval/capture.ts` does. Run such scratch scripts with `npx tsx` **from the project root** — running from outside the project (e.g. `/tmp`) fails to resolve `node_modules` (`tsx`/esbuild resolves relative to the script's own location). Delete scratch scripts after use; don't leave them in the repo.

For end-to-end proof through the real UI and `/api/analyze` (rather than a scratch script), use the `/verify` skill (`.claude/skills/verify/`): `verify.sh up` starts a disposable `next dev` plus a fixture server for `eval/fixtures/*.html`, with the SSRF allowlist set and the AI lane off by default, then `drive <scenario>` captures screenshots/ARIA/API evidence into the git-ignored `.verify/`. It refuses to start alongside another Next.js process in this checkout, and neither `npm run build` nor `npm run check` (which builds) may run while an instance is up, because both write to `.next/`: run `verify.sh down` first.

## Architecture

The subsystem write-ups are in `docs/architecture/`; "Start here by task" above says which one to read.

### Path alias

`@/*` maps to the project root (see `tsconfig.json`) — e.g. `@/lib/schema`, `@/lib/extract/palette`.

## Git policy

Do not commit, push, or open PRs unless explicitly asked. Stage only intended files and never commit secrets. After completing a task, run `npm run check` to verify.
