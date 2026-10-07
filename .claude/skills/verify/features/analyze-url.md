# Analyze a URL

A user pastes a page URL, chooses Analyze, and gets a measured design-system report: palette, typography, spacing, radius, and the captured screenshots. A layout-structure report is also produced, and an `AI lane` label says whether the AI enrichment ran.

## Sub-features

- `url-submit`: entering a URL and choosing `Analyze` shows `Analyzing…` and a status line, then the result.
- `url-preview`: the `Design System Preview` tab shows Source, Report Kind (`design-system`), Render time, AI lane, and the Palette, Typography, Spacing, and Radius sections with provenance badges, followed by the screenshot strip (viewport, plus a panorama when the page is taller than one viewport).
- `url-structure`: the `Layout Structure Markdown` tab appears because the UI requests `both` mode.
- `url-ai-status`: AI lane reads `skipped (no key)` and shows the Setup Hint when no key is set. It reads `applied` with `VERIFY_AI=1`.

## How to get to it (user POV)

- Open `/`. `URL Input` is selected by default. Type into the box with the `https://stripe.com` placeholder, then choose `Analyze` or press Enter.
- Switch back to `URL Input` from `Image Input`.

## Driving it with verify.sh

Preconditions:

- Baseline from the README. The `clean-light` URL has not been analyzed in this run, or a cached response is acceptable.

- **Default fixture.** Run `$V drive analyze-url`. Expect these checks to pass: `submit shows the Analyzing… state`, `API answered 200 ok`, `reportKind is design-system`, `report.source.ref is the submitted URL`, `markdown starts with YAML frontmatter`, `structureReport present in both mode`, `Layout Structure Markdown tab is shown`, `Preview renders the Palette section`, and `AI lane meta reads skipped (no key)`. `02-result-preview.png` shows `clean-light` measured as background `#ffffff`, surface `#f4f6f8`, text `#1a2233`, and primary `#1a73e8`.
- **Other fixtures.** Run `$V drive analyze-url --target dark-mode` or `--target adversarial-shell`. The same checks pass. The `adversarial-shell` fixture exercises hostile markup.
- **Live site.** Run `$V drive analyze-url --target https://example.com`. This needs network access. The result varies with the site, so cite it as a one-off observation.
- **AI lane on.** Run `$V down`, then `VERIFY_AI=1 $V up`, then `$V drive analyze-url`. The `AI lane meta reads applied` check must pass. This makes real paid model calls.

## Gotchas

- The Next.js dev-tools `N` badge floats at the bottom left of every screenshot. It is not part of the app.
- A second analysis of the same URL within 10 minutes is served from cache, so Render time repeats the first value. Restart the instance for a cold render.
- `dark-mode.html` is dark-only, so no `paletteDark` is produced. Don't use it to prove dark-scheme extraction.
- Only `127.0.0.1` is allowlisted. `http://localhost:<port>` is rejected by the SSRF guard. That rejection is correct behavior, not a bug.
