# Distill verification map

This directory is the maintained source for verifying Distill's user-facing behavior. Read this index before you drive the app. Then use the matching feature file as the recipe.

## Baseline preconditions

- Run all commands from the repo root. `V=.claude/skills/verify/scripts/verify.sh` is assumed below.
- `$V up` has printed `ready:`, and `$V doctor` shows every line as `ok`.
- The AI lane is `off` unless the recipe says `VERIFY_AI=1 $V up`. With it off, nothing reaches a model provider.
- `source .verify/current.env` gives `$APP_URL`, `$FIXTURE_URL` and `$RUN_DIR` for `curl` recipes.
- Fixture pages: `$FIXTURE_URL/clean-light.html` (light design system), `$FIXTURE_URL/dark-mode.html` (dark-only page), `$FIXTURE_URL/adversarial-shell.html` (hostile markup).
- Never drive an instance that this verification run did not start.

## Driving conventions

- UI actions go through `$V drive <scenario>`. Every scenario starts from a fresh page load, so no state carries over between scenarios.
- Handles are button names, the `https://stripe.com` placeholder, `#image-input`, and thumbnail alt text. Don't use coordinates or CSS classes.
- The in-memory cache is keyed on the URL or image bytes plus `mode`. A repeat UI analysis of the same target within 10 minutes returns the cached response. The UI cannot send `forceRefresh`, so run `$V down` and `$V up` when you need a cold render.
- The UI always sends `mode: "both"`. To test `tokens` or `structure` mode alone, use the API recipes.

## Proof and skip reporting

- Cite the scenario's `checks.json`, the before and after screenshots, and the matching `.aria.yaml`.
- For downloads, cite the saved file in `downloads/`, not the click.
- For API recipes, cite the status, the headers you relied on, and the saved body.
- Report the AI-lane mode and `GIT_HEAD` from `doctor` with every proof.
- When an entry point can't be reached (for example, no `VERIFY_AI=1` key, or a live site blocking the render), report the command and the unmet precondition. Don't report it as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph that describes the user-visible behavior. It then has exactly four H2 sections, in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with verify.sh`, and `Gotchas`.

## Features

- [Analyze a URL](./analyze-url.md): URL input to a measured design-system report with preview, structure, and AI-lane status.
- [Analyze images](./analyze-images.md): upload, thumbnails, remove, merged palette-mood report, inferred structure or its unavailable banner.
- [Result tabs and downloads](./result-tabs-downloads.md): preview, design markdown, and structure markdown tabs, plus the three download actions.
- [Error handling](./error-handling.md): blocked, invalid, and failing inputs surface an error banner and never a fabricated report.
- [Analyze API](./analyze-api.md): direct `POST /api/analyze` with modes, caching, rate limiting, and request validation.
