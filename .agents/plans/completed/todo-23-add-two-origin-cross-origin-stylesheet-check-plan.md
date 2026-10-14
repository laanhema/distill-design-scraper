# Plan: TODO-23: Add a permanent two-origin check of the cross-origin stylesheet pass

## Summary

The second pass of `collectStyleDump` (`lib/extract/styleDump.ts:655-782`) refetches every stylesheet whose `.cssRules` throws, re-parses it, and merges its `:hover`/`:focus-visible` deltas and `@keyframes` into the dump. `npm run eval` replays frozen captures, so no committed check runs that pass; #176 was proved by a scratch script that was deleted afterwards. This plan adds that check to the verify skill. The fixture server gets a second port on `127.0.0.1` (a second origin) that serves the `*.css` of `eval/fixtures/` with no CORS headers. A new fixture page, `eval/fixtures/cross-origin.html`, links two sheets from that origin: `cross-origin.css`, which declares every hover/focus state and `@keyframes` on the page, and `cross-origin-stalled.css`, which the server answers for the browser's own load and never answers for the app's refetch. A new `verify.sh drive cross-origin` scenario analyzes the page through the real UI. It checks that the first sheet's states and keyframes are in the report and on the `Design System Markdown` tab. It also checks that the stalled sheet's rules are left out while its animation is still measured, and that the render stays within a 20 s budget. A prototype of the code was built and driven while planning, and is saved as a patch. On HEAD it passes all 24 checks. It fails 5 checks when the cross-origin pass is disabled, and 1 check when the refetch timeout is removed.

## User Story

As a maintainer who changes the cross-origin stylesheet pass or the fixture-free capture code around it
I want one command that drives the real app against a page whose styles come from a second origin
So that a regression in the refetch, its merge, or its timeout shows up as a failing check instead of going unnoticed until a production site loses its hover states.

## Metadata

| Field | Value |
|-------|-------|
| Type | NEW_CAPABILITY |
| Complexity | MEDIUM |
| Systems Affected | `.claude/skills/verify/` (scripts, `SKILL.md`, feature map), `eval/fixtures/` (3 new files, not in the corpus), `docs/architecture/tokens-lane.md`, `AGENTS.md` |
| GitHub Issue | #196 (TODO-23, `.agents/issues/todo-issues.md:892`) |
| PRD Phase | N/A |
| Prototype Patch | `.agents/plans/todo-23-add-two-origin-cross-origin-stylesheet-check-prototype.patch` |

---

## Environment Findings

Baseline on `main` at `a3dd6ef`, working tree clean, measured while planning:

| Probe | Result |
|-------|--------|
| `npm run eval` on HEAD | `clean-light`, `dark-mode`, `adversarial-shell` 100% each, `aggregate combined: 100%`, `✓ all gates passed` |
| `npm run check` in the prototype worktree (HEAD + patch; the patch changes no `lib/` file) | Exit 0: `tsc --noEmit` clean, `eslint .` clean, `next build` compiled, eval scores identical to HEAD |
| Toolchain | Node v22.23.1, Playwright 1.61.1 with chromium, no `verify.sh` instance and no `next dev` running in this checkout |
| Test framework | None (`AGENTS.md:33`). `npm run eval` never calls `collectStyleDump`, and CI runs nothing else, so the verify scenario is the only check that executes the cross-origin pass |

Start green, stay green: `npm run check` must exit 0 with the same eval scores.

### Issue-stated facts, re-measured

| Claim in the issue | Finding |
|--------------------|---------|
| `verify.sh` starts the fixture server at line 71, doctor check at line 115 | Confirmed |
| `drive.ts` scenarios at lines 140-313, dispatch at 337-341 | Moved: the scenario functions are lines 159-360 (`scenarioAnalyzeUrl` … `scenarioError`), the dispatch `switch` is lines 374-380 |
| A second port on `127.0.0.1` is a different origin, and the app's allowlist covers it | Confirmed: the sheets on the second port throw on `.cssRules` (the states and keyframes disappear when the pass is disabled, see below), and the browser's load of them is not blocked |
| The refetch is outside the SSRF guard | Confirmed: the refetch reached the second port (fixture log below) |
| A new page in `eval/fixtures/` is not scored by eval unless `eval/corpus.ts` lists it | Confirmed: eval scores are unchanged with the three new files present |

### Prototype measurements (`verify.sh drive cross-origin`, AI lane off)

| Tree | Result |
|------|--------|
| HEAD + patch | 24 checks `ok`, exit 0, render `meta.elapsedMs` 7 908 ms, `console-errors.txt` empty. A second run on the same instance also passes, because the `?run=` query misses the response cache |
| Cross-origin pass disabled (`if (false && dump.crossOriginHrefs …)` at `lib/extract/styleDump.ts:655`) | Exit 1, 5 `FAIL`: hover change, focus change, `@keyframes xo-rise` (API), hover/focus colours and `@keyframes xo-rise` (tokens tab). The `report.states` detail prints `[]` |
| Refetch timeout removed (`request.get(href)` at `lib/extract/styleDump.ts:137`, Playwright's 30 s default) | Exit 1, 1 `FAIL`: `render finished within 20000 ms despite the stalled sheet — 32849 ms` |
| `verify.sh drive analyze-url` with the patched fixture server | All checks `ok` (no regression of the existing scenarios) |

Second-origin request log of the HEAD run (`$RUN_DIR/logs/fixture.log`; the first line is `doctor`'s `curl`):

```
GET /cross-origin.css sec-fetch-dest=-
GET /cross-origin.css sec-fetch-dest=style            <- browser load
GET /cross-origin-stalled.css sec-fetch-dest=style    <- browser load, answered
GET /cross-origin.css sec-fetch-dest=-                <- app refetch, once (the dark dump reuses it, #176)
GET /cross-origin-stalled.css sec-fetch-dest=-        <- app refetch, never answered
```

Chromium sends `Sec-Fetch-Dest: style` for a `<link>` load, and Playwright's `APIRequestContext` sends no `Sec-Fetch-Dest`. The fixture server tells the two apart by that header.

On this page the palette lane gives the buttons' `#1a73e8` the role `surface`, not `primary` (`## States` reads `**surface** hover: \`#0b3d91\``). The scenario therefore asserts the unique colour values and keyframe names, not role names.

---

## Decisions

- **The second origin is a second port of the same fixture-server process.** `fixture-server.mjs <port> <dir> <xo-port>` listens on both ports, so `verify.sh down` still stops one process group and its Cleanup text stays true. `up` picks `FIXTURE_XO_PORT` like the other ports, writes `FIXTURE_XO_PORT`/`FIXTURE_XO_URL` to `.verify/current.env`, and `doctor` checks that the second origin serves `cross-origin.css`.
- **The page learns the second origin when it is served.** The first port replaces the token `__XO_ORIGIN__` in every `.html` it serves. The ports are random, so a static page cannot name the second origin, and a redirect or a `localhost` alias would test a different path from a real CDN link.
- **The fixtures live in `eval/fixtures/`, as the issue's notes say, and stay out of `eval/corpus.ts`.** The page's HTML comment says that it belongs to the verify skill and is not a corpus entry.
- **A stalled sheet is stateless.** `*-stalled.css` answers a request with `Sec-Fetch-Dest: style` and leaves every other request open. A hit counter, like #176's scratch script used, would break on the second run of the same fixture server.
- **Every run renders the page.** The scenario appends `?run=<Date.now()>` to the URL. The response cache is keyed on the URL (`app/api/analyze/route.ts:153`), and the fixture server ignores the query.
- **The skip is proved without a request log.** The stalled sheet declares an animation (`xo-stalled-fade`), a `@keyframes` of that name, and a hover `box-shadow`. The browser applies the animation, so `report.motion.entries` lists it, which proves the browser loaded the sheet. The keyframes and the hover change can only come from the refetch, so their absence proves the refetch was skipped. The 20 s render budget proves that the skip came from the timeout and not from a 30 s default. Measured: 7.9 s with the timeout, 32.8 s without it.
- **`FIXTURE_XO_URL` is read inside the scenario**, with `need()`, and `verify.sh drive` passes `${FIXTURE_XO_URL:-}`. A run started before this change still drives every other scenario, and `cross-origin` names the missing variable.
- **The check stays a manual gate.** CI does not run the verify skill. The issue's notes accept this as "permanent", and the AGENTS.md rules table gets a row that names the scenario, like the `tab-layout` row at `AGENTS.md:81`.

---

## Patterns to Follow

Every `file:line` of this plan refers to `main` at `a3dd6ef`, before the prototype patch is applied. The patch moves lines in `drive.ts`, `verify.sh` and `fixture-server.mjs`.

### Scenario shape: analyze, assert with `check()`, screenshot each state

```typescript
// SOURCE: .claude/skills/verify/scripts/drive.ts:351-360
async function scenarioError(page: Page): Promise<void> {
  const url = flag("url", "http://10.0.0.1/");
  const a = await analyzeUrl(page, url);
  const message = String(a.body.error ?? "");
  check("API answered 400", a.status === 400, `status ${a.status}`);
  check("error banner is shown", await page.getByText("Couldn't analyze this input.").isVisible());
  check("banner carries the API message", message.length > 0 && (await page.getByText(message).isVisible()), message);
  check("no result tabs rendered", !(await page.getByRole("button", { name: "Design System Preview" }).isVisible()));
  await shot(page, "error");
}
```

### Doctor check: one `check` line per probe

```bash
# SOURCE: .claude/skills/verify/scripts/verify.sh:115
  check "GET $FIXTURE_URL/clean-light.html serves the fixture" "curl -sf $FIXTURE_URL/clean-light.html | grep -q 'Clean Light'"
```

### Feature file: H1, one paragraph, then exactly four H2 sections

```markdown
<!-- SOURCE: .claude/skills/verify/features/README.md:31 -->
Each feature file starts with an H1 title and one paragraph that describes the user-visible behavior. It then has exactly four H2 sections, in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with verify.sh`, and `Gotchas`.
```

### Negative control in a feature file

```markdown
<!-- SOURCE: .claude/skills/verify/features/error-handling.md:28 -->
- **Negative control.** Run `$V drive error --url "$FIXTURE_URL/dark-mode.html"`. It must exit 1 with `API answered 400` failing. This shows the scenario can tell success from failure.
```

### Rules table row for a scenario-backed rule

```markdown
<!-- SOURCE: AGENTS.md:81 -->
| Result tab bar action buttons must not shift layout on tab switch | `scenarioTabLayout` in `.claude/skills/verify/scripts/drive.ts` | Test / Verification (Level 3) |
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `.claude/skills/verify/scripts/fixture-server.mjs` | UPDATE | Covered by the patch: the third argument `<xo-port>`, the `__XO_ORIGIN__` replacement in served `.html`, and the second-origin server (`text/css`, no CORS headers, `*-stalled.css` never answers a request without `Sec-Fetch-Dest: style`, one log line per request) |
| `.claude/skills/verify/scripts/verify.sh` | UPDATE | Covered by the patch: `FIXTURE_XO_PORT` picked in `cmd_up` and passed to the fixture server, `FIXTURE_XO_PORT`/`FIXTURE_XO_URL` in `write_state`, the second origin in the `ready:` line, a `doctor` check of `cross-origin.css`, and `FIXTURE_XO_URL` passed by `cmd_drive` |
| `.claude/skills/verify/scripts/drive.ts` | UPDATE | Covered by the patch: header usage line, `XO_RENDER_BUDGET_MS`, the `StateChange`/`CrossOriginReport` interfaces, `scenarioCrossOrigin`, and its `case` in `main` |
| `eval/fixtures/cross-origin.html` | CREATE | Covered by the patch: the page; no states or keyframes of its own, two `<link>`s to `__XO_ORIGIN__` |
| `eval/fixtures/cross-origin.css` | CREATE | Covered by the patch: `.btn` base, hover `#0b3d91`, focus `#e8590c`, `@keyframes xo-rise` used by `.btn` |
| `eval/fixtures/cross-origin-stalled.css` | CREATE | Covered by the patch: `.btn-ghost` animation `xo-stalled-fade`, its `@keyframes`, and a hover `box-shadow` |
| `.claude/skills/verify/SKILL.md` | UPDATE | Not in the patch: Launch, run state, Doctor, scenario table, Helpers |
| `.claude/skills/verify/features/cross-origin-stylesheets.md` | CREATE | Not in the patch: the feature entry of the new scenario |
| `.claude/skills/verify/features/README.md` | UPDATE | Not in the patch: fixture-page list and feature list |
| `docs/architecture/tokens-lane.md` | UPDATE | Not in the patch: name the scenario that checks the second pass |
| `AGENTS.md` | UPDATE | Not in the patch: one row in the Rules & Enforcements table |

No change: `lib/**`, `eval/corpus.ts`, `eval/corpus/*/capture.json`, `eval/baseline.json`, `app/**`.

---

## Tasks

Execute in order. Each task is atomic and verifiable. The prototype patch named in Metadata carries all code and fixtures, so there is no task for writing them.

### Task 1: Check the patched code against the Decisions

- **File**: `.claude/skills/verify/scripts/fixture-server.mjs`, `verify.sh`, `drive.ts`, `eval/fixtures/cross-origin*.{html,css}`
- **Action**: UPDATE (review of the applied patch; edit only where a point below does not hold)
- **Implement**:
  - `fixture-server.mjs` keeps serving the existing fixtures byte-for-byte on the first port; only `.html` bodies pass through the `__XO_ORIGIN__` replacement, and none of the three existing fixtures contains that token (`grep -l __XO_ORIGIN__ eval/fixtures/*.html` lists only `cross-origin.html`).
  - The second origin sends no `access-control-allow-origin` header; otherwise `.cssRules` would not throw and the scenario would pass without the refetch.
  - `cmd_drive` passes `FIXTURE_XO_URL="${FIXTURE_XO_URL:-}"`, so `set -u` does not abort a drive on a run state written before the change.
  - `scenarioCrossOrigin` asserts colour values and keyframe names only, never a palette role name (see Environment Findings).
  - Apply the answers to the Open Questions if the owner chose differently from the proposed defaults.
- **Mirror**: `.claude/skills/verify/scripts/drive.ts:351-360`, `.claude/skills/verify/scripts/verify.sh:115`
- **Validate**: `npm run typecheck && npm run lint && bash -n .claude/skills/verify/scripts/verify.sh`

### Task 2: Document the second origin and the scenario in the verify `SKILL.md`

- **File**: `.claude/skills/verify/SKILL.md`
- **Action**: UPDATE
- **Implement**:
  - Line 25 (Fixture server bullet): add `cross-origin` to the listed pages, and add that a second port, `<FIXTURE_XO_PORT>`, serves the fixtures' `*.css` as a second origin with no CORS headers. A page's `__XO_ORIGIN__` token is replaced with that origin, and a `*-stalled.css` sheet answers only the browser's own load (`Sec-Fetch-Dest: style`).
  - Line 33 (run state): add `FIXTURE_XO_URL` to the listed keys.
  - Lines 41-46 (Doctor list): add "The second origin serves `cross-origin.css`."
  - After line 62 (scenario table): add the row `| \`cross-origin\` | none | the hover/focus states and \`@keyframes\` of a stylesheet on a second origin reach the report and the tokens tab; a second-origin sheet that never answers the refetch is skipped, and the render stays under 20 s |`.
  - Line 97 (Helpers): change to `fixture-server.mjs <port> <dir> <xo-port>`: a static server for the fixture HTML, plus the second origin for their stylesheets, started by `up`.
- **Mirror**: `.claude/skills/verify/SKILL.md:56-62` (one table row per scenario, flags column, "Proves" column)
- **Validate**: `grep -n "cross-origin\|FIXTURE_XO" .claude/skills/verify/SKILL.md`

### Task 3: Add the feature entry and list it in the feature map

- **File**: `.claude/skills/verify/features/cross-origin-stylesheets.md` (CREATE), `.claude/skills/verify/features/README.md` (UPDATE)
- **Action**: CREATE / UPDATE
- **Implement**:
  - New file, following the entry contract (`features/README.md:31`). H1 `Cross-origin stylesheets`. Paragraph: a site that serves its CSS from another origin still gets its hover/focus states and `@keyframes` in the report, because the app refetches each sheet that the browser will not let it read. A sheet whose host never answers the refetch is skipped after 5 s, and the analysis still completes.
    - `Sub-features`: `xo-states` (hover `#0b3d91` and focus `#e8590c` in `## States`), `xo-keyframes` (`@keyframes xo-rise` under `## Motion`), `xo-stalled-skip` (the stalled sheet's `xo-stalled-fade` animation is listed, but its `@keyframes` and hover `box-shadow` are not, and the render takes less than 20 s).
    - `How to get to it (user POV)`: analyze any page whose `<link rel="stylesheet">` points to another origin; the result shows on the `Design System Markdown` tab, because the Preview tab does not render States or Motion.
    - `Driving it with verify.sh`: `$V drive cross-origin`, with the full list of expected check labels. Add a **Negative control** bullet that mirrors `error-handling.md:28`: with the `if` at the top of the cross-origin pass in `lib/extract/styleDump.ts` disabled, the scenario exits 1 with 5 `FAIL`s. With the `timeout` of `fetchCrossOriginSheet`'s `request.get` removed, it exits 1 with the render-budget check failing. Revert the edit afterwards.
    - `Gotchas`: the fixture page is served with its `__XO_ORIGIN__` token replaced, so opening the file directly shows it unstyled. Every run appends `?run=<ms>`, so the response cache never answers it. The palette names the buttons' blue `surface` on this sparse page, which is why the checks never assert a role. `$RUN_DIR/logs/fixture.log` has one line per second-origin request, with its `sec-fetch-dest`: cite it to show one refetch per sheet. A run started before this scenario existed has no `FIXTURE_XO_URL`, so run `$V down` and `$V up`.
  - `features/README.md` line 11: add `$FIXTURE_URL/cross-origin.html` (styles from a second origin, `$FIXTURE_XO_URL`) to the fixture pages.
  - `features/README.md` after line 38: add `- [Cross-origin stylesheets](./cross-origin-stylesheets.md): hover/focus states and keyframes recovered from a second-origin stylesheet, and a stalled one skipped.`
- **Mirror**: `.claude/skills/verify/features/error-handling.md:1-30` (structure and the negative-control bullet)
- **Validate**: `grep -c "^## " .claude/skills/verify/features/cross-origin-stylesheets.md` prints `4`, and `grep -n cross-origin-stylesheets .claude/skills/verify/features/README.md` finds the link

### Task 4: Name the scenario in the tokens-lane write-up

- **File**: `docs/architecture/tokens-lane.md`
- **Action**: UPDATE
- **Implement**: At the end of the "second pass" paragraph (line 5), add one sentence: `npm run eval` never runs this pass. `verify.sh drive cross-origin` (the verify skill) checks it end to end against a page whose sheets come from a second origin, one of which never answers the refetch.
- **Mirror**: `docs/architecture/tokens-lane.md:5` (symbols in backticks, one dense paragraph)
- **Validate**: `grep -n "drive cross-origin" docs/architecture/tokens-lane.md`

### Task 5: Add the rule row to `AGENTS.md`

- **File**: `AGENTS.md`
- **Action**: UPDATE
- **Implement**: After line 81, add `| Cross-origin stylesheets must keep contributing their hover/focus states and keyframes, and a stalled one must not stall the analysis | \`scenarioCrossOrigin\` in \`.claude/skills/verify/scripts/drive.ts\` (manual gate; CI does not run it) | Test / Verification (Level 3) |`.
- **Mirror**: `AGENTS.md:81`
- **Validate**: `grep -n scenarioCrossOrigin AGENTS.md`

### Task 6: Show the scenario failing on a tree with the pass disabled (acceptance criterion 3)

- **File**: `lib/extract/styleDump.ts` (temporary edit, reverted in this task)
- **Action**: UPDATE, run, revert
- **Implement**: With an instance up (End-to-End Verification step 1), change line 655 `if (dump.crossOriginHrefs && dump.crossOriginHrefs.length > 0) {` to `if (false && dump.crossOriginHrefs && dump.crossOriginHrefs.length > 0) {`, wait for `next dev` to reload, then run `$V drive cross-origin`. It must exit 1 with the 5 `FAIL`s listed in Environment Findings. Revert with `git checkout lib/extract/styleDump.ts`. Quote the `FAIL` lines and the evidence directory in the implementation comment on #196.
- **Mirror**: `.claude/skills/verify/features/error-handling.md:28`
- **Validate**: `git diff --quiet -- lib/ && echo reverted`

---

## Validation

```bash
# Type check (drive.ts is in tsconfig)
npm run typecheck

# Lint
npm run lint

# Shell syntax of the lifecycle helper
bash -n .claude/skills/verify/scripts/verify.sh

# Eval gate (unchanged: 100% for each fixture, aggregate 100%)
npm run eval

# Everything CI runs: typecheck → lint → build → eval. Only after `verify.sh down`.
npm run check
```

`npm run eval` and `npm run check` do not run the new scenario or the cross-origin pass. The check that does is End-to-End Verification step 1.

## End-to-End Verification

### 1. The new scenario, on HEAD + patch

```bash
V=.claude/skills/verify/scripts/verify.sh
$V up > /tmp/verify-up.log 2>&1; cat /tmp/verify-up.log   # "ready: … (second origin :<port>) …"
$V doctor                                                 # every line ok, including the second-origin check
$V drive cross-origin                                     # 24 checks ok, "all checks passed", exit 0
$V drive cross-origin                                     # again: still passes (fresh ?run= query, cold render)
source .verify/current.env; grep sec-fetch-dest "$RUN_DIR/logs/fixture.log"
```

Expected checks, in order: `the fixture page links both sheets from the second origin`, the 13 shared checks of `checkDesignReport` and `submitAndWait`, `report.states has the cross-origin hover change`, `report.states has the cross-origin focus change`, `report.motion.keyframes has the cross-origin @keyframes xo-rise`, `report.motion lists the stalled sheet's animation, so the browser applied it`, `report.motion.keyframes leaves out the stalled sheet's @keyframes`, `report.states leaves out the stalled sheet's hover change`, `render finished within 20000 ms despite the stalled sheet` (about 8 s), `tokens tab shows the cross-origin hover and focus colours`, `tokens tab shows @keyframes xo-rise`, `tokens tab leaves out @keyframes xo-stalled-fade`. The evidence directory holds `00-url-entered`, `01-loading`, `02-result-preview`, `03-tab-tokens` (`.png` and `.aria.yaml`), `report.md` with `## States` and `**@keyframes xo-rise**`, and an empty `console-errors.txt`. The fixture log shows, per run, one `sec-fetch-dest=style` and one `sec-fetch-dest=-` line for each of the two sheets.

### 2. Negative controls (Task 6, plus the timeout)

- Pass disabled (Task 6): exit 1, 5 `FAIL`s.
- Optional, same procedure: change `request.get(href, { timeout: CROSS_ORIGIN_SHEET_TIMEOUT_MS })` (`lib/extract/styleDump.ts:137`) to `request.get(href)`. Exit 1, only `render finished within 20000 ms …` fails (measured 32 849 ms). Revert it.

### 3. The existing scenarios still pass

```bash
$V drive analyze-url        # all checks ok
$V drive analyze-images     # all checks ok (its default fixtures are unchanged)
$V down
```

### 4. Full gate

```bash
npm run check   # only after `$V down`; exit 0, eval aggregate 100%
git status --short   # lists only the files of Files to Change; no scratch file, lib/ unchanged
```

---

## Risks

| Risk | Mitigation |
|------|------------|
| The palette lane renames the buttons' role, or another lane changes, and a role-based assertion breaks | **In scope**: the checks assert the unique colour values `#0b3d91`/`#e8590c` and the keyframe names, never a role |
| A future Playwright sends `Sec-Fetch-Dest: style` on `APIRequestContext`, so the stalled sheet answers the refetch | **In scope, fails closed**: its `@keyframes xo-stalled-fade` and hover `box-shadow` would reach the report, and two "leaves out" checks fail loudly. The fixture log shows the header of each request |
| The second origin answers the browser's load wrongly (for example a missing header), so the stalled sheet is never applied and its absence proves nothing | **In scope, fails closed**: `report.motion lists the stalled sheet's animation` fails when the browser did not apply it |
| The 20 s render budget is noisy on a slow machine | **In scope**: `meta.elapsedMs` covers the render only, not `next dev`'s compile. Measured 7.9 s against 32.8 s without the timeout, so the budget can be raised to about 25 s without losing the distinction |
| `free_port` returns the same port for `FIXTURE_PORT` and `FIXTURE_XO_PORT` | **In scope**: `cmd_up` dies with a message before starting anything; rerun `up`. Rare, because the kernel hands out ephemeral ports in sequence |
| A run started before the change has no `FIXTURE_XO_URL` in `current.env` | **In scope**: `cmd_drive` passes `${FIXTURE_XO_URL:-}`, so the other scenarios keep working, and `cross-origin` throws `FIXTURE_XO_URL is not set`. The feature file's Gotchas say to run `down` and `up` |
| Stalled refetch sockets stay open in the fixture server, one per run | **Out of scope, flag only**: Playwright aborts its side after 5 s, and `verify.sh down` kills the process |
| The three new files in `eval/fixtures/` are mistaken for corpus fixtures | **In scope**: the page's HTML comment says it is verify scaffolding, `eval/corpus.ts` is not touched, and eval scores are unchanged |
| A `npm run check` while the instance is up corrupts `.next/` | **In scope**: `scripts/guard-build.mjs` blocks it; End-to-End Verification runs `down` before `check` |
| Headless Chromium reports `(hover: none)`, so a hover-based check passes vacuously | **Not applicable**: the states lane reads declared `:hover` rules from the CSSOM and never simulates hover, and the fixture puts no rule under `@media (hover: hover)` |
| CI never runs the scenario, so it protects nothing unless someone runs it | **Out of scope, accepted by the issue**: it is a one-command manual gate, named in `docs/architecture/tokens-lane.md` and the `AGENTS.md` rules table so that a change to the pass finds it |

---

## Open Questions

1. **Is a manual gate "permanent" enough?** The issue's notes assume so, because CI does not run the verify skill. Proposed default: yes. Rationale: a CI job would need a browser, `next dev` and two loopback servers, which is a separate story; the scenario is one command and is listed where a change to the pass will find it.
2. **Should the scenario also cover a sheet that sends headers and then stalls in its body?** #176's scratch script did; the acceptance criteria name only a sheet that "never answers". Proposed default: no. Rationale: Playwright's `timeout` covers the body download (measured in #176's plan), so the case adds a fixture file and a server branch for a property of Playwright, not of this code.
3. **Should the scenario assert one refetch per sheet per analysis (the cache of #176)?** That needs the fixture server to expose its request log over HTTP. Proposed default: no. Rationale: it is not in the acceptance criteria, and `$RUN_DIR/logs/fixture.log` already records it for a reader (the feature file's Gotchas say so).
4. **Where do the fixture files live?** Proposed default: `eval/fixtures/`, as the issue's notes say. Rationale: the fixture server already serves that directory and the corpus lists its entries by name. The alternative is a `fixtures/` directory inside `.claude/skills/verify/`, which keeps eval's directory to eval fixtures but gives the server a second directory to serve.

---

## Acceptance Criteria

- [ ] The verify fixture server serves a stylesheet from a second origin, and a fixture page links it (`doctor` second-origin check `ok`; first check of the scenario `ok`).
- [ ] `verify.sh drive cross-origin` analyzes that page and checks that the hover/focus states and the keyframes of the cross-origin sheet are in the report (API and `Design System Markdown` tab).
- [ ] The scenario fails on a tree where the cross-origin pass is disabled, shown once before merge (Task 6, quoted in the #196 implementation comment).
- [ ] The scenario covers a cross-origin sheet that never answers: the analysis completes within 20 s of render time, and that sheet's keyframes and hover change are skipped while its animation is still measured.
- [ ] The feature map (`features/README.md` + `features/cross-origin-stylesheets.md`) and the scenario table of the verify `SKILL.md` list the new scenario.
- [ ] `npm run check` exits 0 with the same eval scores; `lib/`, `eval/corpus.ts` and the committed captures are unchanged; no scratch file is left.
