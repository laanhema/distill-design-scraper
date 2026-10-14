# Plan: TODO-15: Stop repeating screenshots in the `/api/analyze` response

## Summary

`POST /api/analyze` sends the same picture more than once. On both paths `meta.viewportShot` repeats `meta.viewportShots[0]` (`app/api/analyze/route.ts:204-206` and `:247`), and on the image path the route returns every upload to the client that just sent it (`:201-203`). Each response is then held whole in the cache for 10 minutes (`:221`, `:258`; `lib/cache.ts:29-34`). This plan (GitHub issue #179, finding M9 of `.agents/reviews/codebase-analysis-review.md:29`) removes the singular field, returns no screenshots for image input, and has the page show the uploads it held at submit time, kept in the `done` state that #173 introduced.

The code change was prototyped while planning and is saved as a patch (see Metadata). The patch covers every file that is compiled or executed: the response type, the route, the page and the verify driver. The tasks below cover what the patch leaves: the docs, the verify skill's Markdown, and the checks.

Measured while planning, on `main` at `b6f7699`, AI lane off (no model call was made):

- **The issue's numbers hold.** `clean-light` returns 366.1 KiB of image data, of which 119.2 KiB is the repeat.
- **The change removes what the issue names.** URL responses shrink by the repeat (`clean-light` 384.3 → 265.1 KiB, `dark-mode` 351.9 → 249.7, `adversarial-shell` 335.4 → 229.2). An image response falls from 345.8 KiB to 3.1 KiB for two uploads, and from 242.8 KiB to 2.9 KiB for one.
- **The new checks show the change.** On `main` the patched driver fails exactly one check per scenario and the API probe of End-to-End Verification fails 14 checks. On the prototype every check prints `ok`.
- **The submit-time check can fail.** With the preview deliberately wired to the live form, `analyze-images` fails `Preview still shows the images held at submit time` and nothing else.
- **The prototype is green.** In the prototype worktree `npm run check` exits 0 with eval at 100% for `clean-light`, `dark-mode` and `adversarial-shell`; `analyze-url`, `analyze-images` (two images and one image), `tabs-downloads`, `tab-layout` and `error` all pass.
- `npm run eval` replays committed captures through the extractors and never loads the route or the page, so the eval gate cannot see this change. Typecheck, lint and build see its types; the verify scenarios and the probe see its behavior.

Decisions:

- **The preview's pictures live in the `done` state as `sourceImages`.** A URL result fills it from `meta.viewportShots`; an image result fills it from the selection as it stood at submit. `Preview` takes it as a prop and no longer reads screenshots from `meta`. This is what the issue notes ask for ("keep them in the `done` state of #173, not in the live form").
- **`analyze` reads one named snapshot of the selection, `submittedImages`.** The request body, `sourceName` and `sourceImages` all come from it, so the three cannot disagree.
- **No picture, no `<img>`.** With an empty `sourceImages` the preview renders nothing where the pictures go. On `main` the fallback branch would render an `<img>` with no `src`.
- **The alt texts do not change** (`Screenshot of …` for one picture, `Source image N of …` for several). The new driver checks find the preview's pictures by them.
- **`slim` in `drive.ts` shortens every data URL in `meta` and names no field.** A field that is absent in the response stays absent in `response.json`, so the evidence shows the real shape.
- **The route's `cleaned` array goes.** Its `raw` and `clean` halves existed only to rebuild the echoed data URLs; `analyzeImages` receives the same `{ data, name }` values as before.

## User Story

As a user of the Distill workbench and of `POST /api/analyze`
I want the response to carry each screenshot once, and none that I uploaded myself
So that an analysis moves and caches a fraction of the bytes, and the preview still shows what I submitted

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT |
| Complexity | MEDIUM |
| Systems Affected | `lib/api.ts`, `app/api/analyze/route.ts`, `app/page.tsx`, the verify skill (`scripts/drive.ts`, `SKILL.md`, three feature files), `README.md`, `docs/architecture/api-route.md`, `docs/architecture/frontend.md`, `.agents/PRDs/PRD.md` |
| GitHub Issue | #179 (TODO-15; blocked by #171 and #173, both merged) |
| PRD Phase | N/A |
| Prototype Patch | `.agents/plans/todo-15-stop-repeating-screenshots-in-analyze-response-prototype.patch` |

---

## Environment Findings

Every `file:line` in this plan is a line of `main` at `b6f7699`, before the patch. The patch moves lines in the four files it touches, so the tasks name those files by symbol.

| Probe | Result |
|-------|--------|
| Tree | `main` at `b6f7699`, clean. No `verify.sh` instance is up (`.verify/current.env` is absent) |
| Toolchain | Node v22.23.1, npm 10.9.8 |
| Baseline | `npm run check` passes on `main` with eval at 100% on the three required fixtures (run by the orchestrator before this plan). Start green, stay green |
| Test framework | None (`AGENTS.md`). `npm run eval` is the offline gate; `/verify` drives the real UI and API |
| `/verify` on `main`, AI lane off | `analyze-url`: all 10 checks pass. `analyze-images`: all 15 checks pass, among them `viewportShots has one entry per kept image (2)`, which this change replaces |
| Patched driver against `main` | `analyze-url`: 1 failed check of 13, `meta has no legacy viewportShot`. `analyze-images`: 1 failed check of 18, `response returns no screenshots (no viewportShot, no viewportShots)` |
| API probe on `main` | exit 1, 14 failed checks: `no meta.viewportShot` and `every image in the response is a viewportShots entry` for each of the 3 URLs (3 data URLs for 2 shots), and both screenshot checks for each of the 4 image requests |
| API probe on the prototype | exit 0, `all checks ok` (24 checks) |
| Mutation of the prototype | `Preview` given the live form's previews instead of `state.sourceImages`: `analyze-images` fails only `Preview still shows the images held at submit time` |
| Prototype gate | `npm run check` exits 0 in the prototype worktree. Route `/` builds at 5.53 kB |
| Fixtures and the one-picture branch | All three fixtures produce a panorama, so a URL result always has two pictures here. The one-picture branch of `Preview` is exercised by `analyze-images --fixtures clean-light --remove 0` |
| Forward references to #179 | `.agents/reviews/codebase-analysis-review.md:29` and `:65`, and the story itself at `.agents/issues/todo-issues.md:600-636`. None in the source, the docs or earlier plans |

Issue-stated numbers, re-measured:

- `app/api/analyze/route.ts:169-174` and `:225-228` are stale. The image path builds the fields at `:201-206`, the URL path at `:247-250`, and the cache writes are at `:221` and `:258` (the notes say 189 and 236).
- `app/page.tsx:632-650` is `:631-650`.
- `.claude/skills/verify/scripts/drive.ts`: the per-image check is at `:294` (the notes say 288). `slim` is at `:64-71`, as stated.
- `README.md:59` and `docs/architecture/api-route.md:3` match.
- "119 KiB of the 366 KiB" on `clean-light`: confirmed, 119.2 of 366.1 KiB.

Places that the issue notes do not name and the change still has to touch:

- `lib/api.ts:20-22`, the response type and its comment.
- `.agents/PRDs/PRD.md:262-263`, the response sample (Open Questions).
- `docs/architecture/frontend.md:3`, which describes the page's state.
- The verify skill's Markdown: `SKILL.md:61` and `:72`, `features/analyze-images.md:10`, `:24`, `:25`, `features/analyze-url.md:23`, `features/analyze-api.md:30`.

Not this field: `viewportShot` on `CaptureArtifacts` (`lib/ingest.ts:24`) and its readers (`lib/analyze.ts:54`, `:71`, `:371`; `eval/stability.ts:69`; `app/api/analyze/route.ts:248`) is the internal capture field. It stays.

---

## Patterns to Follow

### A value that belongs to a result is captured when the result is made, never read from the live form

`AnalysisState` (`app/page.tsx:15-19`) already carries `sourceName` beside `result` for this reason, and `deriveHost` (`app/page.tsx:39-54`) reads only that. `sourceImages` follows it. The pairing rule comes from `SelectedImage`:

```typescript
// SOURCE: app/page.tsx:22-28
/** A selected file and its data-URL preview, kept in one entry so the pairing
 *  can never drift — previews used to live in a separate array appended in
 *  `FileReader.onload` completion order, which mismatched indexes (#23). */
interface SelectedImage {
  file: File;
  preview: string;
}
```

### A signal the server does not have is an omitted field, not a synthesized one

```typescript
// SOURCE: lib/api.ts:35-37
  /** Set when structure was requested but couldn't be produced (image mode
   *  without an API key, or the vision model failed) — §P6-2 step 2. */
  structureUnavailableReason?: string;
```

`AGENTS.md` ("measured, never faked") states the rule. `meta.viewportShots` stays optional and is absent for image input (Open Questions has the alternative).

### Error handling

No error path changes. The route's status mapping (`app/api/analyze/route.ts:261-291`) and the page's single `error` state (`app/page.tsx:160-165`) stay as they are.

### Tests: checks live in `drive.ts`, use user-visible handles, and prove side effects

```typescript
// SOURCE: .claude/skills/verify/scripts/drive.ts:47-50
function check(label: string, ok: boolean, detail?: string): void {
  checks.push({ label, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}
```

`.claude/skills/verify/SKILL.md:66` asks for new behavior to be covered in `drive.ts` with `check()` and `shot()`, and `:83` asks for a side effect to be proved by its bytes. The patch does both: the preview's `src` values are compared with the bytes of the uploaded files.

### Verify feature files keep their four sections

`.claude/skills/verify/features/README.md:29-31`: an H1, one paragraph, then `Sub-features`, `How to get to it (user POV)`, `Driving it with verify.sh` and `Gotchas`, in that order. Task 5 edits lines inside those sections and adds none.

---

## Files to Change

| File | Action | In the patch | Purpose |
|------|--------|--------------|---------|
| `lib/api.ts` | UPDATE | yes | `AnalyzeMeta` loses `viewportShot`; the comment of `viewportShots` says when the field is present |
| `app/api/analyze/route.ts` | UPDATE | yes | Image path: no `viewportShots`, no `viewportShot`, no `cleaned` array. URL path: no `viewportShot` |
| `app/page.tsx` | UPDATE | yes | `done` state gains `sourceImages`; `analyze` reads the `submittedImages` snapshot; `Preview` takes `sourceImages` and renders nothing for an empty list |
| `.claude/skills/verify/scripts/drive.ts` | UPDATE | yes | `slim` shortens any data URL in `meta`; new `previewSources` and `sameList` helpers; three new checks in `checkDesignReport`; in `scenarioAnalyzeImages` the per-image `viewportShots` check is replaced and a form edit after the result is driven |
| `README.md` | UPDATE | no | Task 1 |
| `docs/architecture/api-route.md` | UPDATE | no | Task 2 |
| `docs/architecture/frontend.md` | UPDATE | no | Task 3 |
| `.agents/PRDs/PRD.md` | UPDATE | no | Task 4 (Open Questions) |
| `.claude/skills/verify/SKILL.md`, `features/analyze-images.md`, `features/analyze-url.md`, `features/analyze-api.md` | UPDATE | no | Task 5 |

No change: `AGENTS.md` (it names neither field), `lib/cache.ts` (its comment at `:30-33` stays true for URL responses, whose panorama can reach several MB), `lib/ingest.ts`, `lib/analyze.ts` and `eval/stability.ts` (the capture field), `eval/baseline.json`, `eval/corpus/*`, `.claude/skills/verify/scripts/verify.sh`, `.claude/skills/verify/features/README.md`, `result-tabs-downloads.md` and `error-handling.md`, the plans, reports and reviews under `.agents/` (history), and `.agents/issues/todo-issues.md` and the git-ignored `TODO.md` (`/update-issues` and `/update-todo` own them).

---

## Tasks

Execute in order. Each task is atomic and verifiable. The patch is applied before Task 1 (the Metadata row), so no task writes the code that the patch holds. If another change moved a line that a task names, find it by the quoted content.

### Task 1: Describe the new response in the README

- **File**: `README.md`
- **Action**: UPDATE
- **Implement**: In line 59, replace the first sentence, which ends "and returns the formatted reports, `viewportShots` and metadata.", with: "`POST /api/analyze` accepts a JSON payload `{ url, images, mode, forceRefresh }` and returns the formatted reports and metadata. For a URL the metadata carries `viewportShots`: the viewport screenshot, then the full-page panorama when one was captured. For images the response carries no screenshots, because the caller already has them, and the page shows the uploads it sent." Keep the rest of the line (from "`images` is `{ data, name? }[]`") as it is.
- **Mirror**: `README.md:58` (one bullet, plain sentences, field names in backticks)
- **Validate**: `grep -c "For images the response carries no screenshots" README.md` (must print 1) and `! grep -n "viewportShots. and metadata" README.md` (the old wording; `.` stands for the backtick)

### Task 2: Describe the new response in the API route write-up

- **File**: `docs/architecture/api-route.md`
- **Action**: UPDATE
- **Implement**: In line 3, replace the last sentence ("The cache key hashes all image payloads, and the response carries `viewportShots` … alongside the legacy singular `viewportShot`.") with: "The cache key hashes all image payloads. A URL response carries `meta.viewportShots`: the viewport shot, then the panorama when present, each once, as PNG data URLs. An image response carries no screenshots: the uploads are neither sent back to the client that sent them nor held in the cache, and `app/page.tsx` shows the previews it held at submit instead. The singular `viewportShot` was removed in #179."
- **Mirror**: `docs/architecture/api-route.md:7` (the paragraph that states a response rule and its reason)
- **Validate**: `grep -c "An image response carries no screenshots" docs/architecture/api-route.md` (must print 1) and `! grep -n "alongside the legacy singular" docs/architecture/api-route.md`

### Task 3: Say in the frontend write-up where the preview's pictures come from

- **File**: `docs/architecture/frontend.md`
- **Action**: UPDATE
- **Implement**: Append to the paragraph of line 3: "The `done` state holds everything the result view shows, including `sourceImages`, the pictures under the preview: a URL result takes them from `meta.viewportShots`, an image result from the uploads as they stood at submit, because the API returns no screenshots for images. Editing the form afterwards changes neither the pictures nor the download names."
- **Mirror**: `docs/architecture/frontend.md:3` (the sentence about the tab fallback: one behavior, one reason)
- **Validate**: `grep -c "sourceImages" docs/architecture/frontend.md` (must print 1)

### Task 4: Bring the PRD's response sample in line

- **File**: `.agents/PRDs/PRD.md`
- **Action**: UPDATE
- **Implement**: This task follows the proposed default of the first Open Question; skip it if the owner answers otherwise.
  - Delete line 262 (`"viewportShot": "data:image/png;base64,…",     // legacy singular alias`).
  - Line 263: change the comment to `// URL only: viewport, then panorama when captured. Absent for images (#179)`.
  - Line 4: set `Last Updated:` to the date of the change.
  - Change nothing else in the file. `"aiApplied": true` on line 261 is stale since #172 and is not this issue's (Risks).
- **Mirror**: `.agents/plans/completed/todo-25-remove-native-gemini-provider-path-plan.md`, Task 5 (current-state lines are rewritten, delivery records are left alone)
- **Validate**: `grep -c "viewportShot" .agents/PRDs/PRD.md` (must print 1; it prints 2 on `main`)

### Task 5: Correct the verify skill's Markdown

- **File**: `.claude/skills/verify/SKILL.md`, `.claude/skills/verify/features/analyze-images.md`, `.claude/skills/verify/features/analyze-url.md`, `.claude/skills/verify/features/analyze-api.md`
- **Action**: UPDATE
- **Implement**:
  - `SKILL.md:61`, the `analyze-images` row, column "Proves": "upload, thumbnails, remove, palette-mood report, a response without screenshots, a preview built from the uploads held at submit, structure behavior with and without a key".
  - `SKILL.md:72`: add `form-edited-after-result` to the list of resulting states, after `result-preview`.
  - `features/analyze-images.md:10` (`img-analyze`): "`Analyze Image` or `Analyze Images` returns Report Kind `palette-mood` and a Palette section. The response carries no screenshots; the Preview tab shows one picture per kept image, taken from the uploads the page held at submit."
  - `features/analyze-images.md:24`: in the list of expected checks, replace `viewportShots has one entry per kept image (2)` with `response returns no screenshots (no viewportShot, no viewportShots)` and `Preview shows the 2 uploaded image(s), in order`. After the sentence about the AI lane being off, add: "The scenario then removes image 1 from the form. Expect `clean-light.png thumbnail is gone after the analysis` and `Preview still shows the images held at submit time`; `04-form-edited-after-result.png` shows one thumbnail and two preview pictures."
  - `features/analyze-images.md:25`: "one preview is returned" becomes "one preview picture is shown".
  - `features/analyze-images.md`, `Gotchas`: add "After a result, a thumbnail's file name is also part of each preview picture's alt text (`Source image 1 of clean-light.png +1 more`). Match a thumbnail with `exact: true`, and find preview pictures by `Screenshot of` or `Source image N of`."
  - `features/analyze-url.md:23`: add to the list of expected checks `meta has no legacy viewportShot`, `meta.viewportShots holds the screenshots as PNG data URLs` and `Preview shows every viewportShots entry, in order`.
  - `features/analyze-api.md:30`: "A URL response embeds base64 screenshots of several hundred KB. Save the body to a file rather than printing it. An image response has none."
- **Mirror**: `.claude/skills/verify/features/analyze-images.md:24` (check names quoted verbatim in backticks), `.claude/skills/verify/features/README.md:29-31` (the four-section contract)
- **Validate**: `! grep -rn "one entry per kept image" .claude/skills/verify` and `for l in "meta has no legacy viewportShot" "response returns no screenshots (no viewportShot, no viewportShots)" "Preview still shows the images held at submit time" "thumbnail is gone after the analysis"; do grep -rlF "$l" .claude/skills/verify/features .claude/skills/verify/scripts | wc -l; done` (must print 2 four times: each label in `drive.ts` and in one feature file)

### Task 6: Check that nothing reads the removed field, and that the patch is in place

- **File**: none (read-only checks)
- **Action**: run
- **Implement**: Run step 1 of End-to-End Verification. The reverse check of the patch passes only while the four patched files still hold exactly what the patch wrote; if a task needed to change one of them, say so in the report.
- **Mirror**: `.agents/plans/completed/todo-25-remove-native-gemini-provider-path-plan.md`, Task 1 (`git apply --check -R` as the proof that the patch is applied)
- **Validate**: `git apply --check -R .agents/plans/todo-15-stop-repeating-screenshots-in-analyze-response-prototype.patch && npm run typecheck && npm run lint`

### Task 7: Drive the app and the API

- **File**: `.verify/` (git-ignored evidence; no tracked file changes)
- **Action**: run
- **Implement**: Follow steps 2 and 3 of End-to-End Verification, with the AI lane off (the default of `verify.sh up`). Do not start it with `VERIFY_AI=1`. End with `verify.sh down`, also when a step fails.
- **Mirror**: `.claude/skills/verify/features/analyze-url.md:23`, `.claude/skills/verify/features/analyze-images.md:24-25`, `.claude/skills/verify/features/analyze-api.md:19-23`
- **Validate**: `test ! -e .verify/current.env` after the run, with every scenario and the probe having exited 0

### Task 8: Run the full gate

- **File**: none
- **Action**: run
- **Implement**: With no instance up, run `npm run check`. It must exit 0 with eval at 100% for each of the three fixtures and `✓ all gates passed`.
- **Mirror**: `AGENTS.md`, "Git policy" ("After completing a task, run `npm run check` to verify")
- **Validate**: `test ! -e .verify/current.env && npm run check`

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Eval gate (must print 100% for each of the three fixtures and "all gates passed")
npm run eval

# Everything CI runs: typecheck → lint → build → eval (no verify.sh instance may be up)
npm run check
```

`npm run eval` does not load the route or the page. The checks that exercise the change are the steps below.

## End-to-End Verification

`V=.claude/skills/verify/scripts/verify.sh` below. All commands run from the project root. No step calls a model or any outside service: the AI lane is off and the fixtures are local pages.

### 1. Static: nothing reads the removed field (first acceptance criterion)

```bash
git apply --check -R .agents/plans/todo-15-stop-repeating-screenshots-in-analyze-response-prototype.patch
grep -rnE "meta\.viewportShot\b" app lib                                     # must print nothing (main: app/page.tsx:646)
grep -nE "^\s*viewportShot:" app/api/analyze/route.ts lib/api.ts             # must print nothing (main: route.ts:204, :247; api.ts:20)
grep -c "viewportShots" app/api/analyze/route.ts                             # must print 2: the comment on the image path and the field on the URL path
grep -nE "neutral-|dark:" app/page.tsx app/layout.tsx                        # must print nothing (docs/architecture/frontend.md)
```

### 2. App, AI lane off: both scenarios of the fourth acceptance criterion, plus the neighbors that share code

```bash
$V up && $V doctor                                          # doctor must print "ai-lane off" and every line "ok"
$V drive analyze-url
$V drive analyze-images
$V drive analyze-images --fixtures clean-light --remove 0   # the one-picture branch of Preview
$V drive tabs-downloads                                     # shares checkDesignReport with analyze-url
source .verify/current.env
grep -c "viewportShot" "$RUN_DIR"/evidence/analyze-images-*/response.json    # must print 0 for each file
grep -A3 '"viewportShots"' "$RUN_DIR"/evidence/analyze-url-*/response.json   # two "<N chars>" entries, and no "viewportShot" key
tail -3 "$RUN_DIR"/evidence/analyze-images-*/*form-edited-after-result.aria.yaml
wc -c "$RUN_DIR"/evidence/*/console-errors.txt              # every file 0 bytes
```

Each `drive` must end with `all checks passed`. The checks that this change adds, and what each proves:

| Scenario | Check | Proves |
|----------|-------|--------|
| `analyze-url`, `tabs-downloads` | `meta has no legacy viewportShot` | the singular field is gone |
| `analyze-url`, `tabs-downloads` | `meta.viewportShots holds the screenshots as PNG data URLs — 2` | the URL response still carries its screenshots |
| `analyze-url`, `tabs-downloads` | `Preview shows every viewportShots entry, in order — 2 of 2` | the page reads the plural field, `viewportShots[0]` first |
| `analyze-images` | `response returns no screenshots (no viewportShot, no viewportShots)` | the uploads are not sent back |
| `analyze-images` | `Preview shows the 2 uploaded image(s), in order — 2 of 2` (`1` in the single-image run) | each preview `src` equals the data URL of the uploaded file |
| `analyze-images` | `clean-light.png thumbnail is gone after the analysis` | the form was edited after the result |
| `analyze-images` | `Preview still shows the images held at submit time` | the preview reads the `done` state, not the live form |

The two-image run's ARIA tail must end with `img "Source image 1 of clean-light.png +1 more"` and `img "Source image 2 of clean-light.png +1 more"`; the single-image run's with `img "Screenshot of clean-light.png"`. Open `03-result-preview.png` and `04-form-edited-after-result.png` of the two-image run (the single-image run has no removal step, so its files are numbered `02-` and `03-`) and confirm that both show the two pictures side by side under the palette, and that the second shows one thumbnail in the form. Cite `GIT_HEAD` and `ai-lane off` from `doctor` with the proof.

### 3. API, AI lane off: every request shape, and the bytes (first and second acceptance criteria)

The UI sends only data URLs under `images`. This probe also sends raw base64 and the deprecated `image` alias, which the route still accepts (`app/api/analyze/route.ts:136-139`), and it counts the image data in each response. Save it as `shots-probe.mjs` in a new evidence directory of the run that step 2 left up, so that the script is kept with its output and nothing is added to the tracked tree:

```bash
source .verify/current.env
E="$RUN_DIR/evidence/api-$(date +%H%M%S)"; mkdir -p "$E"
# write the script below to $E/shots-probe.mjs, then:
node "$E/shots-probe.mjs" "$APP_URL" "$FIXTURE_URL" "$(ls -d "$RUN_DIR"/evidence/analyze-images-*/inputs | head -1)" | tee "$E/shots-probe.txt"
$V down
```

The inputs directory must be one of a run that uploaded both `clean-light` and `dark-mode`, which the default `analyze-images` run of step 2 does.

```javascript
// Direct-API check for #179: which screenshot fields POST /api/analyze returns, and what they cost.
// usage: node shots-probe.mjs <APP_URL> <FIXTURE_URL> <dir holding clean-light.png and dark-mode.png>
// Plain Node (built-in fetch), no project imports. Exits 1 when a check fails.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [app, fixtures, inputs] = process.argv.slice(2);
if (!app || !fixtures || !inputs) throw new Error("usage: node shots-probe.mjs <APP_URL> <FIXTURE_URL> <inputs-dir>");

const kib = (n) => `${(n / 1024).toFixed(1)} KiB`;
const count = (text, needle) => text.split(needle).length - 1;
let failed = 0;
function check(label, ok, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function post(body) {
  const sent = JSON.stringify(body);
  const res = await fetch(`${app}/api/analyze`, {
    method: "POST",
    // Its own rate-limit bucket, so the probe cannot starve the UI scenarios of the same run.
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.79" },
    body: sent,
  });
  const text = await res.text();
  const json = JSON.parse(text);
  return { status: res.status, sent: sent.length, text, json, meta: json.meta ?? {} };
}

for (const f of ["clean-light", "dark-mode", "adversarial-shell"]) {
  const r = await post({ url: `${fixtures}/${f}.html`, mode: "both" });
  const shots = Array.isArray(r.meta.viewportShots) ? r.meta.viewportShots : [];
  const shotBytes = shots.reduce((n, s) => n + s.length, 0);
  check(`url ${f}: 200`, r.status === 200, `status ${r.status}`);
  check(`url ${f}: no meta.viewportShot`, !("viewportShot" in r.meta));
  check(
    `url ${f}: meta.viewportShots holds PNG data URLs`,
    shots.length > 0 && shots.every((s) => s.startsWith("data:image/png;base64,")),
    `${shots.length} shots, ${kib(shotBytes)}`,
  );
  check(
    `url ${f}: every image in the response is a viewportShots entry`,
    count(r.text, "data:image/") === shots.length,
    `${count(r.text, "data:image/")} data URLs for ${shots.length} shots, response ${kib(r.text.length)}`,
  );
}

const b64 = (f) => readFileSync(join(inputs, `${f}.png`)).toString("base64");
const dataUrl = (f) => `data:image/png;base64,${b64(f)}`;
const imageCases = {
  "2 data URLs": { images: [{ data: dataUrl("clean-light"), name: "clean-light.png" }, { data: dataUrl("dark-mode"), name: "dark-mode.png" }] },
  "1 data URL": { images: [{ data: dataUrl("clean-light"), name: "clean-light.png" }] },
  "raw base64, no name": { images: [{ data: b64("dark-mode") }] },
  "legacy image alias": { image: b64("clean-light"), imageName: "legacy.png" },
};
for (const [label, body] of Object.entries(imageCases)) {
  const r = await post({ ...body, mode: "both" });
  check(`images, ${label}: 200 palette-mood`, r.status === 200 && r.json.report?.reportKind === "palette-mood", `status ${r.status}`);
  check(
    `images, ${label}: no meta.viewportShot, no meta.viewportShots`,
    !("viewportShot" in r.meta) && !("viewportShots" in r.meta),
    Object.keys(r.meta).join(", "),
  );
  check(
    `images, ${label}: the response holds no image data`,
    count(r.text, "data:image/") === 0 && r.text.length < r.sent / 4,
    `response ${kib(r.text.length)} for a ${kib(r.sent)} request`,
  );
}

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks ok");
process.exit(failed ? 1 : 0);
```

It must exit 0 and end with `all checks ok` (24 checks). Measured while planning:

| Request | `main` | Prototype |
|---------|--------|-----------|
| URL `clean-light` | 3 data URLs for 2 shots, response 384.3 KiB | 2 for 2, 265.1 KiB |
| URL `dark-mode` | 3 for 2, 351.9 KiB | 2 for 2, 249.7 KiB |
| URL `adversarial-shell` | 3 for 2, 335.4 KiB | 2 for 2, 229.2 KiB |
| 2 images as data URLs (222.9 KiB request) | 345.8 KiB | 3.1 KiB |
| 1 image as a data URL (120.0 KiB request) | 242.8 KiB | 2.9 KiB |
| 1 image as raw base64, no name (102.9 KiB request) | 208.8 KiB | 2.9 KiB |
| Legacy `image` alias (119.9 KiB request) | 242.8 KiB | 2.9 KiB |

The sizes vary by a few hundred bytes with `elapsedMs` and `capturedAt`; the counts must match exactly. The cache holds the same object that the route returns (`app/api/analyze/route.ts:221-223`, `:258-260`), so these sizes are also what each cache entry holds.

### 4. Full gate (fourth acceptance criterion, `npm run check`)

With no instance up (`test ! -e .verify/current.env`), `npm run check` must exit 0 with the eval scores of the baseline (100% for each fixture, `✓ all gates passed`). `git status --short` must list only the files of the Files to Change table, this plan, its patch and the report.

## Risks

| Risk | Mitigation |
|------|------------|
| An outside client of the API reads `meta.viewportShot`, or expects its uploads back in `meta.viewportShots` | The owner decided both removals on 2026-10-13 (issue description). In scope: the README, the API write-up and the PRD sample describe the new response. Out of scope: a deprecation period or a version bump |
| The preview shows the live form instead of what was analyzed | The patch reads one snapshot, `submittedImages`, and stores it in the `done` state. `analyze-images` edits the form after the result and compares the preview with the uploaded bytes; the mutation run showed that the check fails when the preview reads the form. In scope |
| A URL response arrives without `viewportShots` and the preview shows nothing | Cannot happen today: the route always puts the viewport shot first. `Preview` renders nothing for an empty list instead of an `<img>` with no `src`. `analyze-url` checks that the list is non-empty. In scope |
| The `done` state keeps the uploads' data URLs alive after the user removes them from the form | They are the same string objects that the form held, not copies, and they are released by the next analysis. On `main` the echoed response kept a second copy of every upload in the same state, so memory use goes down. Out of scope: nothing to do |
| The new driver checks find preview pictures by alt text (`Screenshot of`, `Source image N of`) | A changed alt text fails the checks loudly (`0 of 2`), it does not pass silently. Task 5 records the handles in the feature file. In scope |
| `analyze-images` now ends with one image removed from the form, so the last screenshot differs from the one before this change | `03-result-preview` is taken before the edit and is unchanged; the edit has its own `04-form-edited-after-result` step. Task 5 documents it. In scope |
| `tabs-downloads` gains three checks through the shared `checkDesignReport` | They ran green on the prototype. Step 2 runs the scenario. In scope |
| Another change lands in one of the four patched files before `/implement` runs, and the patch no longer applies | `git apply --check` on the patch tells at once. The patch is 4 files and about 110 changed lines; re-create it from the Decisions of the Summary and the Files to Change table if it has to be redone by hand |
| The PRD sample keeps a second stale field, `"aiApplied": true` (`.agents/PRDs/PRD.md:261`; the field is `aiOutcome` since #172) | Out of scope: it is not this issue's. Flag it in the report so that `/update-prd` picks it up |
| The owner's stash `WIP: PRD.md phase 8 sweep` touches the same file as Task 4 | Task 4 changes three lines (4, 262, 263). Never run `git stash` in this tree. If the owner would rather keep the PRD untouched until the stash is applied, skip Task 4 (Open Questions) |
| `npm run check` is started while a verify instance is up | `scripts/guard-build.mjs` blocks the build; step 3 ends with `$V down`, and Task 8's validation tests for it first |

## Open Questions

- **Should the PRD's response sample be corrected in this change?** The acceptance criteria name only `README.md` and `docs/architecture/api-route.md`, but `.agents/PRDs/PRD.md:262-263` documents the removed field and "images: one per source". Proposed default: yes, Task 4, three lines. The last plan that changed a documented contract did the same (TODO-25, Task 5), and a sample that shows a removed field misleads the next reader. If the owner prefers to leave the PRD to `/update-prd`, or to keep it untouched because of the stash, skip Task 4 and say so in the report.
- **For image input, is `meta.viewportShots` absent or an empty array?** The issue says "returns no screenshots" and does not say which. Proposed default: absent, as the patch does. The field is already optional in `AnalyzeMeta`, and the repo's rule is that a signal the server does not have is omitted (`AGENTS.md`). The alternative, a required `viewportShots: []`, lets an API client skip one `undefined` check; it would need the type, the image path of the route, the `response returns no screenshots` check of `drive.ts` and the probe changed together.

## Acceptance Criteria

- [ ] All tasks completed
- [ ] The response has no `viewportShot`; the page reads `viewportShots[0]` (step 1; step 2, `meta has no legacy viewportShot` and `Preview shows every viewportShots entry, in order`; step 3)
- [ ] In image mode the response returns no screenshots, and the preview shows the images captured at submit time (step 2, the four `analyze-images` checks; step 3, the four image requests)
- [ ] `README.md` and `docs/architecture/api-route.md` describe the new response (Tasks 1 and 2)
- [ ] `/verify` (`analyze-url`, `analyze-images`) passes, with the `viewportShots` check in `drive.ts` updated (step 2)
- [ ] `npm run check` passes with unchanged eval scores (step 4)
- [ ] The verify skill's Markdown names the checks that `drive.ts` now prints (Task 5)
- [ ] Follows existing patterns, and `docs/architecture/frontend.md`'s colour-token rule still holds for `app/page.tsx`
