# Cross-origin stylesheets

A site that serves its CSS from another origin still gets its hover/focus states and `@keyframes` in the report, because the app refetches each stylesheet that the browser will not let it read (`.cssRules` throws) and merges the refetched rules into the style dump. A sheet whose host never answers the refetch is skipped after 5 s with one server-side warning, and the analysis still completes. A refetch that fails, returns a non-ok status, or returns an empty body is skipped without a warning.

## Sub-features

- `xo-states`: the cross-origin sheet's hover `#0b3d91` and focus `#e8590c` reach `report.states` and the `## States` section.
- `xo-keyframes`: the cross-origin sheet's `@keyframes xo-rise` reaches `report.motion.keyframes` and the `## Motion` section.
- `xo-stalled-skip`: the stalled sheet's `xo-stalled-fade` animation is listed in `report.motion.entries`, because the browser applied it, but its `@keyframes` and its hover `box-shadow` are not, and the render (`meta.elapsedMs`) takes less than 20 s.

## How to get to it (user POV)

- Analyze any page whose `<link rel="stylesheet">` points to another origin, in `URL Input`, and choose `Analyze`.
- The states and keyframes show on the `Design System Markdown` tab. The `Design System Preview` tab does not render States or Motion.

## Driving it with verify.sh

Preconditions:

- Baseline from the README. `$V doctor` shows `GET $FIXTURE_XO_URL/cross-origin.css serves the second-origin sheet` as `ok`.

- **Cross-origin page.** Run `$V drive cross-origin`, which analyzes `$FIXTURE_URL/cross-origin.html?run=<ms>`. Expect `the fixture page links both sheets from the second origin`, the shared checks (`submit shows the Analyzing… state`, `API answered 200 ok`, `reportKind is design-system`, `report.source.ref is the submitted URL`, `markdown starts with YAML frontmatter`, `structureReport present in both mode`, `meta.aiOutcome is no-key`, `meta has no legacy viewportShot`, `meta.viewportShots holds the screenshots as PNG data URLs`, `Preview shows every viewportShots entry, in order`, `Layout Structure Markdown tab is shown`, `Preview renders the Palette section`, `AI lane meta reads skipped (no key)`), then `report.states has the cross-origin hover change`, `report.states has the cross-origin focus change`, `report.motion.keyframes has the cross-origin @keyframes xo-rise`, `report.motion lists the stalled sheet's animation, so the browser applied it`, `report.motion.keyframes leaves out the stalled sheet's @keyframes`, `report.states leaves out the stalled sheet's hover change`, `render finished within 20000 ms despite the stalled sheet`, `tokens tab shows the cross-origin hover and focus colours`, `tokens tab shows @keyframes xo-rise`, and `tokens tab leaves out @keyframes xo-stalled-fade`. See `03-tab-tokens.png` and `report.md`. `grep 'refetch timed out' $RUN_DIR/logs/next.log` shows one `Cross-origin stylesheet refetch timed out after 5000 ms; skipping its hover/focus states and keyframes: …/cross-origin-stalled.css` line per analysis.
- **Negative control.** Change the `if` at the top of the cross-origin pass in `lib/extract/styleDump.ts` to `if (false && dump.crossOriginHrefs …)`, wait for `next dev` to reload, and run `$V drive cross-origin`. It must exit 1 with 5 `FAIL`s: the hover change, the focus change, `@keyframes xo-rise` in the API, and the hover/focus colours and `@keyframes xo-rise` on the tokens tab. With the `timeout` of `fetchCrossOriginSheet`'s `request.get` removed instead, it must exit 1 with only `render finished within 20000 ms …` failing. The `next.log` warning still says `5000 ms` there, because it prints the constant, not the elapsed time. Revert the edit afterwards (`git diff --quiet -- lib/`).

## Gotchas

- The fixture server replaces the page's `__XO_ORIGIN__` token when it serves it, so opening `eval/fixtures/cross-origin.html` directly shows it unstyled.
- Every run appends `?run=<ms>` to the URL, so the response cache never answers it and a second run on the same instance renders again.
- On this sparse page the palette names the buttons' blue `surface`, not `primary`, which is why the checks assert colour values and keyframe names, never a role.
- `$RUN_DIR/logs/fixture.log` has one line per second-origin request, such as `http://127.0.0.1:<port> GET /cross-origin.css sec-fetch-dest=style`: `style` is the browser's load and `-` is a request without that header. The app's refetch logs `-`, and so does `doctor`'s `curl` of `cross-origin.css`, so discount one `-` line per `doctor` run. Cite the log to show one refetch per sheet per analysis.
- A run started before this scenario existed has no `FIXTURE_XO_URL`, and the scenario fails with `FIXTURE_XO_URL is not set`. Run `$V down` and `$V up`.
