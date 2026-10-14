# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Codex, …) when working with code in this repository. `CLAUDE.md` is a one-line `@AGENTS.md` pointer — this file is the only place to edit agent guidance.

## What this is

**Start here by task.** Each subsystem has a write-up in `docs/architecture/`; read the one for your task before editing the code it covers:
- Touching extraction logic (`lib/extract/*`)? Read [`tokens-lane.md`](docs/architecture/tokens-lane.md) or [`structure-lane.md`](docs/architecture/structure-lane.md), then [`eval.md`](docs/architecture/eval.md).
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

There is no unit test framework (no jest/vitest) — `npm run eval` is the correctness gate for extraction logic. `postinstall` runs `playwright install chromium` automatically. CI (`.github/workflows/ci.yml`, on push/PR to `main`) runs `npm ci` + `npx playwright install --with-deps chromium`, then `npm run check` on Node 20, with no API key in the environment — so anything that only passes with a key set will fail there. A second workflow, `.github/workflows/ai-lane.yml`, runs `npm run eval:ai` against live OpenRouter only when started by hand (`workflow_dispatch`, optional `model` input) and fails if the `OPENROUTER_API_KEY` repository secret is missing; start it after changing `lib/aiLane.ts`, a prompt, or an AI lane's schema.

### The eval harness (`eval/`)

Read [`eval.md`](docs/architecture/eval.md) before touching any `lib/extract/*`: it covers what the gate scores, the fixture-refresh policy, and why `eval/capture.ts` bypasses the SSRF guard. `npm run eval` replays the committed captures offline against hand-authored `expected.yaml` specs, and fails on a site below `SITE_FLOOR` or below `eval/baseline.json`. Workflow when changing any extractor (`lib/extract/**`, `lib/emit.ts`, `lib/analyze.ts`):

1. Make the change.
2. Run `npm run eval`. It must pass unchanged unless the score change is the _intended_ result of your fix.
3. Only then, refresh the baseline deliberately: `UPDATE_BASELINE=1 npm run eval`.

Don't refresh `eval/corpus/*/capture.json` to exercise a new lane; only a change of the capture _shape_ justifies it.

### Manually verifying extraction changes

Because eval fixtures are frozen JSON, testing anything that depends on live page behavior (CSSOM `:hover` rules, ARIA attributes, new capture fields) requires an actual render. The established pattern: spin up a local `http.createServer` serving a small synthetic HTML string, call `renderUrl` + `captureFromRender` + `extractFromCapture` (from `lib/analyze.ts`) against it, and inspect the resulting `report`/`markdown`. `renderUrl` runs the SSRF guard first, which blocks loopback addresses — either run the scratch script with `SSRF_ALLOWLIST_HOSTS=localhost`, or drive Playwright directly like `eval/capture.ts` does. Run such scratch scripts with `npx tsx` **from the project root** — running from outside the project (e.g. `/tmp`) fails to resolve `node_modules` (`tsx`/esbuild resolves relative to the script's own location). Delete scratch scripts after use; don't leave them in the repo.

For end-to-end proof through the real UI and `/api/analyze` (rather than a scratch script), use the `/verify` skill (`.claude/skills/verify/`): `verify.sh up` starts a disposable `next dev` plus a fixture server for `eval/fixtures/*.html`, with the SSRF allowlist set and the AI lane off by default, then `verify.sh drive <scenario>` captures screenshots/ARIA/API evidence into the git-ignored `.verify/`. It refuses to start alongside another Next.js process in this checkout, and neither `npm run build` nor `npm run check` (which builds) may run while an instance is up, because both write to `.next/`: run `verify.sh down` first.

## Architecture

The subsystem write-ups are in `docs/architecture/`; "Start here by task" above says which one to read.

### Path alias

`@/*` maps to the project root (see `tsconfig.json`) — e.g. `@/lib/schema`, `@/lib/extract/palette`.

## Rules & Enforcements

| Rule | Enforcement | Level |
| --- | --- | --- |
| Every capture artifact field must be shared across render, extraction, and eval | `CaptureArtifacts` in `lib/ingest.ts` (extended by `RenderResult` and `Capture`) | Architecture (Level 1) |
| Structure extraction requires a DOM harvest node; no dead browser-page overloads | `ExtractStructureOptions.rawHarvestNode` required in `lib/extract/structure/index.ts` | Architecture (Level 1) |
| Palette area weighting processes single-pass screenshot; no dead fold-doubling options | `PaletteInput.screenshotPngBase64` in `lib/extract/palette.ts` (dead `additionalScreenshotsPngBase64` deleted) | Architecture (Level 1) |
| Verification and test automation scripts must be strictly typechecked | `tsconfig.json` includes `".claude/skills/verify/scripts/**/*.ts"` | Types (Level 2) |
| An eval corpus entry must name a local fixture or a live URL | `CorpusEntry` union in `eval/corpus.ts`, narrowed with `in` in `eval/capture.ts` | Types (Level 2) |
| Do not run `npm run build` or `npm run check` while a `verify.sh` dev server is running | `prebuild` script runs `scripts/guard-build.mjs` which exits non-zero naming `verify.sh down` | Tooling / Build guard (Level 2) |
| Request payloads to `POST /api/analyze` must be validated before access | `analyzeBodySchema.safeParse` in `app/api/analyze/route.ts` | Schema / Runtime validation (Level 2) |
| Hand-written eval specs must not carry a key the spec schema does not define | `expectedSpecSchema` (`z.strictObject`) parsed in `loadExpectedSpec` in `eval/run.ts` | Schema / Runtime validation (Level 2) |
| Measured extraction scores must not regress below committed baselines | `npm run eval` regression gate across required fixtures in CI | Eval / Test gate (Level 3) |
| Result tab bar action buttons must not shift layout on tab switch | `scenarioTabLayout` in `.claude/skills/verify/scripts/drive.ts` | Test / Verification (Level 3) |
| Cross-origin stylesheets must keep contributing their hover/focus states and keyframes, and a stalled one must not stall the analysis | `scenarioCrossOrigin` in `.claude/skills/verify/scripts/drive.ts` (manual gate; CI does not run it) | Test / Verification (Level 3) |
| Frontmatter and Markdown body must never drift | Generated from the same report object via `buildReport` and `renderMarkdown` | Architecture (Level 1) |
| Do not commit, push, or open PRs unless explicitly asked | Project policy | Docs (Level 4) |

## Git policy

Do not commit, push, or open PRs unless explicitly asked. Stage only intended files and never commit secrets. After completing a task, run `npm run check` to verify.
