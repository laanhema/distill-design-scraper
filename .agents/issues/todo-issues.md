# TODO Issues

Generated from `TODO.md` on 2026-10-04.
Extended from `.agents/reviews/codebase-analysis-review.md` on 2026-10-13 (TODO-6 to TODO-22, one per finding).
Extended from the conversation on 2026-10-14 (TODO-23 and TODO-24, follow-ups of TODO-12 that the owner agreed to).
Extended from the conversation on 2026-10-14 (TODO-25, a follow-up of TODO-13 that the owner agreed to).
Extended from `TODO.md` on 2026-10-14 (TODO-26).
Extended from `TODO.md` on 2026-10-14 (TODO-27).
Last Updated: 2026-10-14

## Status

24 issues are done (TODO-2, TODO-4 to TODO-26) and 3 are pending (TODO-1, TODO-3, TODO-27): #156, #158 and #218 are open on GitHub with no pull request. The spike issue #166 of TODO-1 is still open on GitHub although its report, `.agents/reports/overlay-mitigation-spike.md`, exists.

| Issue | Title | Pull request | Status | Acceptance criteria ticked |
| --- | --- | --- | --- | --- |
| #156 | [TODO-1] Handle Inaccessible URLs, Bot-Blocks, and View-Obscuring Overlays Gracefully | none | pending | 0 of 4 |
| #157 | [TODO-2] Set Cursor Pointer on Interactive UI Buttons | #162 | done | 3 of 3 |
| #158 | [TODO-3] Investigate Secure Local Distribution and Sharing Models (Docker / BYOK) | none | pending | 0 of 3 |
| #159 | [TODO-4] Prevent Layout Shift and Button Width Changes on Tab Selection and State Changes | #165 | done | 3 of 3 |
| #160 | [TODO-5] Remove "Copy .md" Button from the Workbench Header | #161 | done | 4 of 4 |
| #170 | [TODO-6] Validate the `/api/analyze` request body | #187 | done | 5 of 5 |
| #171 | [TODO-7] Share one typed response contract between the route and the page | #189 | done | 6 of 6 |
| #172 | [TODO-8] Show the AI lane's real status instead of "skipped (no key)" | #190 | done | 5 of 5 |
| #173 | [TODO-9] Hold the analysis lifecycle in one state value | #191 | done | 4 of 4 |
| #174 | [TODO-10] Type the in-page style walker and remove its double cast | #192 | done | 5 of 5 |
| #175 | [TODO-11] Run the two model calls of the URL path concurrently | #193 | done | 5 of 5 |
| #176 | [TODO-12] Fetch cross-origin stylesheets concurrently, with a timeout, once per analysis | #194 | done | 5 of 5 |
| #177 | [TODO-13] Bring the AI lane's JSON Schema back in line with its Zod schema | #198 | done | 3 of 3 |
| #178 | [TODO-14] Cache nearest-color lookups in the palette area pass | #202 | done | 3 of 3 |
| #179 | [TODO-15] Stop repeating screenshots in the `/api/analyze` response | #203 | done | 4 of 4 |
| #180 | [TODO-16] Remove the dead `Page` overload of `extractStructure` | #188 | done | 3 of 3 |
| #181 | [TODO-17] Delete three unused leftovers | #188 | done | 4 of 4 |
| #182 | [TODO-18] Replace seventeen casts with annotations or narrowing | #204 | done | 4 of 4 |
| #183 | [TODO-19] Validate `expected.yaml` with a strict schema | #205 | done | 3 of 3 |
| #184 | [TODO-20] Make `CorpusEntry` a union of fixture and URL entries | #206 | done | 3 of 3 |
| #185 | [TODO-21] Include the verify driver in the type check | #188 | done | 3 of 3 |
| #186 | [TODO-22] Declare the capture artifacts once | #188 | done | 4 of 4 |
| #196 | [TODO-23] Add a permanent two-origin check of the cross-origin stylesheet pass | #213 | done | 6 of 6 |
| #197 | [TODO-24] Warn when a cross-origin stylesheet refetch times out | #214 | done | 5 of 5 |
| #199 | [TODO-25] Remove the native Gemini provider path and run the AI lane over OpenRouter only | #201 | done | 5 of 5 |
| #212 | [TODO-26] Prune Non-Essential Comments Across the Codebase | #217 | done | 4 of 4 |
| #218 | [TODO-27] Keep page sections that share a shape from collapsing into one repeated component | none | pending | 0 of 6 |

Criteria were checked on 2026-10-14 against the code at `4291324`, with offline `npm run typecheck`, `npm run lint`, `npm run eval` and `npm run build` runs (all passed) and the CI run on `4291324` (passed); the product was not run in this check. A criterion that needs a live run (`/verify`, a key, a timing) is ticked on the validation table of the issue's report in `.agents/reports/todo-N-*-plan-report.md`, where the code still holds the behaviour; TODO-16, TODO-17, TODO-21 and TODO-22 shipped together in PR #188, which has no report. Plans are in `.agents/plans/completed/`, reports in `.agents/reports/`, reviews in `.agents/reviews/`.

### Open Items Without an Issue

**Specified in the source but not built**

- Overlay and bot mitigation (TODO-1, #156; spiked in #166)
- Distribution and BYOK strategy (TODO-3, #158)
- Page sections that share a shape collapse into one repeated component (TODO-27, #218)

**Open GitHub issues that no issue entry names**

- #166 [TODO-1] Spike: bypass or detect view-obscuring overlays, cookie walls, and paywalls before capture

## Skipped

(None — all 5 items from `TODO.md` were structured into issues.)

From `.agents/reviews/codebase-analysis-review.md` (2026-10-13), not tasks:

- The eight bullets under `## What's Good` (observations of what was checked and found sound).
- The rows of the `## Validation Results` table (results of the baseline checks).
- The rows of the `## Fix Priority Order` table (batches that group the 17 findings; each row's "Verified by" cell is used as the verification criterion of its findings).
- The `Noted, not a finding` paragraph (six points that a written decision of the project rules out).

---

## [TODO-1] Handle Inaccessible URLs, Bot-Blocks, and View-Obscuring Overlays Gracefully

**GitHub**: #156
**Status**: pending — issue open, spike #166 complete; 4 criteria not met
**Type**: Bug
**GitHub Label**: bug
**Priority**: High
**Complexity**: Medium
**Phase**: Backlog
**Labels**: bug, extraction, frontend
**Source**: `TODO.md:1` — "Sometimes Playwright gets blocked from accessing the given URL resulting in no analysis whatsoever. Or sometimes there is a popup that blocks some of the website that makes the analysis fail. There should be a mechanism that will check if something comes up and blocks a clear view and handles it gracefully. Or if the website isn't accessible then it will show an error."

### Description

When Playwright navigates to URLs that block headless browsers (e.g. Cloudflare / 403 / anti-bot challenges) or encounters modal overlays/popups that obscure the page, analysis fails or yields corrupted captures. The ingestion pipeline should detect navigation/access failures and return clear errors to the UI, and enhance banner/overlay detection and handling to prevent obscured viewport captures.

### Acceptance Criteria

- [ ] Ingestion pipeline catches HTTP errors (e.g. 403 Forbidden, 401, 5xx) and bot-challenge pages during navigation and reports an explicit, human-readable error.
  - *Not met:* HTTP error and bot-challenge detection not yet implemented in `lib/ingest.ts`.
- [ ] If navigation fails or times out, the API returns a structured error message indicating the site is inaccessible rather than crashing or hanging.
  - *Not met:* Structured inaccessible-site error responses not yet implemented in `app/api/analyze/route.ts`.
- [ ] Common modal popups, paywalls, and overlay backdrops (e.g., newsletter dialogs, cookie walls) that obstruct view are detected and dismissed or mitigated prior to viewport screenshotting.
  - *Not met:* Prototyped in spike #166 (`.agents/reports/overlay-mitigation-spike.md`); not yet integrated into `lib/ingest.ts`.
- [ ] The frontend displays the specific accessibility/block error state clearly to the user.
  - *Not met:* Frontend block/inaccessible error UI not yet implemented in `app/page.tsx`.

### Technical Notes

- Modify `lib/ingest.ts` (`renderUrl`, `dismissConsentBanner`, `capturePage`) to check HTTP response status on `page.goto` and detect challenge titles (e.g., Cloudflare "Just a moment...", 403 Forbidden).
- Expand consent and modal dismissal patterns or close button selectors (e.g. `[aria-label*="close" i]`, backdrop clicks) in `lib/ingest.ts`.
- Ensure `app/api/analyze/route.ts` and `app/page.tsx` pass through and display friendly error messages when navigation is blocked or access is denied.

### Dependencies

- Blocked by: None
- Blocks: None

---

## [TODO-2] Set Cursor Pointer on Interactive UI Buttons

**GitHub**: #157
**Status**: done — issue closed, PR #162 merged
**Type**: Enhancement
**GitHub Label**: enhancement
**Priority**: Medium
**Complexity**: Small
**Phase**: Backlog
**Labels**: enhancement, frontend
**Source**: `TODO.md:2` — "Make the UI buttons to turn the cursor into a pointer when hovering over them."

### Description

Buttons in the web workbench currently retain the default arrow cursor on hover because Tailwind v4 does not enforce `cursor: pointer` on button elements by default. Update the styles so all interactive buttons display a pointer cursor when hovered.

### Acceptance Criteria

- [x] All clickable buttons across the UI (mode toggles, submit buttons, remove image buttons, tabs, download buttons) show a pointer cursor on hover.
- [x] Disabled buttons show appropriate non-interactive cursor (e.g., `cursor: not-allowed` or default) instead of pointer.
- [x] Can be implemented cleanly via global CSS (`app/globals.css`) or Tailwind utilities.

### Technical Notes

- Add `button:not(:disabled), [role="button"]:not([aria-disabled="true"]) { cursor: pointer; }` to `app/globals.css`, or add `cursor-pointer` to button components in `app/page.tsx`.
- Check disabled states (`disabled:cursor-not-allowed`).

### As Built

- Global CSS rules added in `app/globals.css:13-19` using `:where(button:not(:disabled), [role="button"]:not([aria-disabled="true"])) { cursor: pointer; }` and `:where(button:disabled, [role="button"][aria-disabled="true"]) { cursor: not-allowed; }`.
- `cursor-pointer` utility verified on file input and workbench controls.

### Dependencies

- Blocked by: None
- Blocks: None

---

## [TODO-3] Investigate Secure Local Distribution and Sharing Models (Docker / BYOK)

**GitHub**: #158
**Status**: pending — issue open; 3 criteria not met
**Type**: Spike
**GitHub Label**: spike
**Priority**: Medium
**Complexity**: Medium
**Phase**: Backlog
**Labels**: spike, docker, infra, security
**Source**: `TODO.md:3` — "How can I share this software with others? Is it just by making them spin up a docker container or running the dev server? Because I can't make people to insert their API keys to a deployed application that's kind of the problem. They should be able to do it themselves locally and securely if they want to do so."

### Description

Investigate approaches for sharing Distill with external users without requiring them to trust a multi-tenant deployed server with their personal API keys (Gemini / OpenRouter). Evaluate local distribution methods (Docker image, docker-compose, desktop wrapper, or client-side BYOK in browser localStorage) to balance ease of setup, security of credentials, and headless Chromium execution.

### Acceptance Criteria

- [ ] Document trade-offs between local Docker container execution (`docker run -p 3000:3000`), a packaged desktop executable, and a hosted deployment with client-side Bring-Your-Own-Key (BYOK) passed per request.
  - *Not met:* Distribution trade-off analysis document not yet written.
- [ ] Determine how Playwright Chromium requirements impact non-technical users in local distribution.
  - *Not met:* Packaging investigation pending.
- [ ] Define concrete recommendations and file follow-up implementation issues for the chosen distribution strategy.
  - *Not met:* Follow-up implementation issues not yet filed.

### Technical Notes

- `Dockerfile` already exists using `mcr.microsoft.com/playwright:v1.61.1-jammy`.
- Storing user API keys in browser localStorage / session and sending via request header `X-Gemini-Key` / `X-OpenRouter-Key` would allow a hosted demo where users provide their own keys without server persistence.
- Alternatively, providing a one-command `docker compose` or pre-built container image on GitHub Container Registry (ghcr.io) for easy local run.

### Dependencies

- Blocked by: None
- Blocks: None

---

## [TODO-4] Prevent Layout Shift and Button Width Changes on Tab Selection and State Changes

**GitHub**: #159
**Status**: done — issue closed, PR #165 merged
**Type**: Enhancement
**GitHub Label**: enhancement
**Priority**: Medium
**Complexity**: Small
**Phase**: Backlog
**Labels**: enhancement, frontend
**Source**: `TODO.md:4` — "The buttons change width depending on which is selected currently, which makes for a sloppy visual look..."

### Description

In the results header, the action buttons dynamically change their text (e.g. "Copy Design System .md" vs "Copy Structure .md", and "Download Design System .md" vs "Download Structure .md", or when toggling copied state), causing the buttons to shift width and jitter layout when users switch tabs or trigger actions. Standardize button sizing or labels so that selecting tabs maintains stable button widths without visual layout shifts.

### Acceptance Criteria

- [x] Action buttons in the results header maintain stable widths when switching between "Design System Preview", "Design System Markdown", and "Layout Structure Markdown" tabs.
- [x] Buttons do not unexpectedly resize or cause neighboring elements to jitter during tab switching or state toggling.
- [x] Layout remains visually aligned and responsive across desktop and smaller viewports.

### Technical Notes

- In `app/page.tsx`, examine the workbench action buttons inside the tab bar (`ml-auto flex gap-2`).
- Either simplify button labels to static concise text (e.g. "Download .md", "Download Markdown", or paired with TODO-5 / #160) or assign consistent min-width / flex constraints to prevent width jumps.

### As Built

- In `app/page.tsx:363-375`, both label spans ("Download Design System .md" and "Download Layout Structure .md") share a single CSS grid cell (`col-start-1 row-start-1`), reserving the width of the longer label so the button does not resize when switching tabs.
- Added `scenarioTabLayout` to `.claude/skills/verify/scripts/drive.ts` and automated verification across 1280px, 1024px, 768px, and 390px viewports.

### Dependencies

- Blocked by: None
- Blocks: None

---

## [TODO-5] Remove "Copy .md" Button from the Workbench Header

**GitHub**: #160
**Status**: done — issue closed, PR #161 merged
**Type**: Enhancement
**GitHub Label**: enhancement
**Priority**: Medium
**Complexity**: Small
**Phase**: Backlog
**Labels**: enhancement, frontend, cleanup
**Source**: `TODO.md:5` — "Get rid of the "Copy ... .md" button altogether. I feel like users want to download the .md file pretty much always not just copy the text because in that case they need to make a .md file themselves, which is a hassle."

### Description

Remove the "Copy Design System .md" / "Copy Structure .md" button from the workbench action bar. Users predominantly download the Markdown artifact directly rather than copying raw text into manual files, making the copy button redundant and simplifying the UI.

### Acceptance Criteria

- [x] The "Copy ... .md" button is removed from `app/page.tsx`.
- [x] The `copyActiveMarkdown` function and `copied` state are cleaned up if no longer used elsewhere.
- [x] The workbench action bar cleanly displays only the "Download ... .md" and "Download Tailwind @theme" buttons.
- [x] Typecheck and lint pass with no unused variables or broken references.

### Technical Notes

- Remove `copyActiveMarkdown` and `copied` state from `app/page.tsx` (around lines 86, 167-173, and 372-381).
- Also eliminates one of the button width shift triggers from TODO-4 (#159).

### As Built

- Removed `copyActiveMarkdown`, `copied` state, and the Copy button element from `app/page.tsx`.
- Action bar in `app/page.tsx` renders only download buttons with consistent styling.

### Dependencies

- Blocked by: None
- Blocks: None

---

## [TODO-6] Validate the `/api/analyze` request body

**GitHub**: #170
**Status**: done — issue closed, PR #187 merged
**Type**: Bug
**GitHub Label**: bug
**Priority**: High
**Complexity**: Medium
**Phase**: Backlog
**Labels**: bug, api
**Source**: `.agents/reviews/codebase-analysis-review.md:18` — "**H1** `app/api/analyze/route.ts:96` — The result of `JSON.parse` (`any`) is assigned to `AnalyzeBody` with no validation, so the declared types of `url`, `images` and `mode` are claims that nothing checks."

### Description

`POST /api/analyze` assigns the result of `JSON.parse` straight to `AnalyzeBody` without checking it. Currently `null`, `{"url":123}` and `{"images":[null]}` throw a `TypeError` out of the handler (a framework 500), `{"images":"abc"}` and `{"images":[{"data":5}]}` return the generic 502, and an unknown `mode` returns a degraded 200 that is cached. Expected: every malformed body gets a 400 that names the invalid field.

### Acceptance Criteria

- [x] The request body is parsed as `unknown` and validated with a Zod schema before any field is read.
- [x] `null`, `{"url":123}`, `{"images":[null]}`, `{"images":"abc"}` and `{"images":[{"data":5}]}` each get a 400 that names the invalid field; none throws out of the handler or returns 502.
- [x] An unknown `mode` gets a 400 and is not cached; an absent `mode` still defaults to `"both"`.
- [x] The mode type is exported once and replaces the repeated literal union in `lib/analyze.ts`.
- [x] `npm run check` and `/verify` (`error`, `analyze-url`, `analyze-images`) pass.

### Technical Notes

- `app/api/analyze/route.ts:94-111`: replace the bare assignment at line 96 with a Zod `safeParse`. Lines 104 and 120 run before either `try` (132, 144), which is why the errors escape today.
- Schema: `url`, `image` and `imageName` as optional strings, `images` as an optional array of `{ data: string, name?: string }`, `mode` as `z.enum(["tokens", "structure", "both"]).default("both")`, `forceRefresh` as an optional boolean. Zod 4.4.3 is already a dependency.
- Keep the deprecated `image`/`imageName` alias merged into `images` (`docs/architecture/api-route.md`).
- Use the exported mode type at `lib/analyze.ts:185` and `:335`.
- Read `docs/architecture/api-route.md` and `docs/architecture/security.md` before editing (AGENTS.md).
- Finding H1 of `.agents/reviews/codebase-analysis-review.md`; rule: ts-best-practices, `unknown` over `any`.

### As Built

- `analyzeBodySchema.safeParse` in `app/api/analyze/route.ts` validates the parsed `unknown` body before any field is read; a failure returns 400 naming each failing path, before the cache lookup.
- `modeSchema` and `AnalyzeMode` are exported from `lib/analyze.ts` and used by the route.
- The malformed-body reproduction and the verify runs are recorded in `.agents/reports/todo-6-validate-analyze-request-body-plan-report.md`.

### Dependencies

- Blocked by: None
- Blocks: None

---

## [TODO-7] Share one typed response contract between the route and the page

**GitHub**: #171
**Status**: done — issue closed, PR #189 merged
**Type**: Technical
**GitHub Label**: technical
**Priority**: Medium
**Complexity**: Medium
**Phase**: Backlog
**Labels**: technical, api, frontend
**Source**: `.agents/reviews/codebase-analysis-review.md:21` — "**M1** `app/page.tsx:144` — The response of `/api/analyze` has no shared type: the client re-declares `Meta`, `Refinement` and `AnalyzeResponse` (lines 7-36) and casts `res.json()` to them, while the server builds two untyped success literals (`route.ts:158`, `:215`) and seven error literals."

### Description

The response of `/api/analyze` has no shared type: `app/page.tsx` re-declares `Meta`, `Refinement` and `AnalyzeResponse` and casts `res.json()` to them, while `route.ts` builds untyped literals. The two sides have drifted (`Refinement.from`, the `ok` field on error replies), and a reply that is not JSON shows the parser's own message. Declare the contract once and use it on both sides.

### Acceptance Criteria

- [x] One type-only module declares `AnalyzeResponse` as a union discriminated on `ok`; `app/page.tsx` and `app/api/analyze/route.ts` both import it, and `page.tsx` no longer declares `Meta`, `Refinement` or `AnalyzeResponse`.
- [x] Both success payloads in `route.ts` are checked with `satisfies`, and every error reply carries `ok: false`.
- [x] `MAX_IMAGES` is declared once and imported by both files.
- [x] A reply that is not JSON shows a readable error, and the client narrows on `ok` with no cast on `res.json()`.
- [x] A refinement with no previous role does not render as "undefined→…".
- [x] `npm run check` and `/verify` (`error`, `analyze-url`, `analyze-images`) pass.

### Technical Notes

- New type-only module (for example `lib/api.ts`) exporting `AnalyzeResponse = AnalyzeSuccess | AnalyzeFailure` and `MAX_IMAGES`. It must import types only, so that the page's client chunk stays free of zod and js-yaml (`docs/architecture/schema.md`).
- `route.ts`: success literals at lines 158 and 215; error replies without `ok` at 89, 99 and 115.
- `page.tsx`: interfaces at lines 7-36, cast at 144, check at 145, fallbacks at 149-158, error text at 161, refinement rendering at 490. `Refinement.from` is `string` there but `from?: ColorRole` in `lib/interpret.ts:213`.
- `MAX_IMAGES` is declared in `page.tsx:49` and in `route.ts:21`.
- Finding M1 of `.agents/reviews/codebase-analysis-review.md`; rule: ts-best-practices, Discriminated unions.

### As Built

- `lib/api.ts` is type-only and holds `AnalyzeResponse = AnalyzeSuccess | AnalyzeFailure`, `AiOutcome`, `MAX_IMAGES` and the `isAnalyzeResponse` guard.
- `app/page.tsx` reads `res.json()` as `unknown`, shows "server returned an unexpected non-JSON response" when parsing fails, and narrows with `isAnalyzeResponse`; a refinement without `from` renders as `#hex →to`.

### Dependencies

- Blocked by: None
- Blocks: TODO-8, TODO-9, TODO-15

---

## [TODO-8] Show the AI lane's real status instead of "skipped (no key)"

**GitHub**: #172
**Status**: done — issue closed, PR #190 merged
**Type**: Bug
**GitHub Label**: bug
**Priority**: Medium
**Complexity**: Medium
**Phase**: Backlog
**Labels**: bug, frontend, ai-lane
**Source**: `.agents/reviews/codebase-analysis-review.md:22` — "**M2** `app/page.tsx:423` — The AI lane's status reads "skipped (no key)", and the setup hint of line 427 tells the user to set a key, whenever `meta.aiApplied` is false, which also happens when a key is set and the model failed."

### Description

The preview's AI-lane field reads "skipped (no key)" and shows the setup hint whenever `meta.aiApplied` is false. That is also the case when a key is set and the model failed twice (for example on a rate limit), so the page states something false. Expected: the page says which outcome happened.

### Acceptance Criteria

- [x] `enrichWithAI` returns the lane's outcome as `"applied" | "no-key" | "failed" | "not-requested"`.
- [x] `meta` carries that outcome in place of `aiApplied`.
- [x] The preview shows one label per outcome, and the setup hint only for `"no-key"`.
- [x] With a key set and a failing model, the page does not say "no key".
- [x] `drive.ts` asserts the new label; `npm run check` and `/verify` (`analyze-url`, `tabs-downloads`, `analyze-images`) pass.

### Technical Notes

- `lib/analyze.ts`: `enrichWithAI` returns the same value at line 143 (no key) and at line 150 (two failed attempts); `aiApplied` is derived at 293 and 370. In `mode: "structure"` the enrichment is not requested.
- `app/page.tsx:423` (label) and `:427` (setup hint).
- `.claude/skills/verify/scripts/drive.ts:129` asserts the current text.
- `meta` is part of the shared response type of TODO-7.
- Finding M2 of `.agents/reviews/codebase-analysis-review.md`; rule: ts-best-practices, Impossible states.

### As Built

- `enrichWithAI` returns `outcome`, carried as `meta.aiOutcome: AiOutcome`; `AI_LANE_LABELS` in `app/page.tsx` maps the four values to `applied` / `skipped (no key)` / `failed` / `skipped (not requested)`.
- The setup hint shows only for `no-key`; `drive.ts` asserts `meta.aiOutcome` and the visible label.

### Dependencies

- Blocked by: TODO-7
- Blocks: None
- Related: #74 (DIST-040) made an AI failure visible in the server log only; this issue makes it visible in the response and on the page.

---

## [TODO-9] Hold the analysis lifecycle in one state value

**GitHub**: #173
**Status**: done — issue closed, PR #191 merged
**Type**: Technical
**GitHub Label**: technical
**Priority**: Medium
**Complexity**: Medium
**Phase**: Backlog
**Labels**: technical, frontend
**Source**: `.agents/reviews/codebase-analysis-review.md:23` — "**M3** `app/page.tsx:77` — One request lifecycle is held in eight separate `useState` calls (lines 77-84), so combinations that cannot occur still compile and the render must ask for them."

### Description

`Home` in `app/page.tsx` keeps one request lifecycle in eight separate `useState` calls, so the render tests combinations (`status === "done" && report && meta`) and `analyze` makes fifteen setter calls per request. Because the result does not own its inputs, the download names are derived from the live form and change when the form is edited after an analysis. Hold the lifecycle in one discriminated value.

### Acceptance Criteria

- [x] One union over `idle`, `loading`, `error` and `done` replaces the eight `useState` calls of `app/page.tsx:77-84`.
- [x] Each transition sets the state once, and no render guard reads `status === "done" && report && meta`.
- [x] The download file names come from the analysed result and do not change when the form is edited afterwards.
- [x] `npm run check` and `/verify` (`analyze-url`, `tabs-downloads`, `analyze-images`) pass.

### Technical Notes

- State at `app/page.tsx:77-84`; resets at 117-124; fills at 148-159; guards at 335, 342 and 348; `deriveHost` at 170.
- Shape from the finding: `{ status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "done"; result: AnalyzeSuccess; sourceName: string }`. `AnalyzeSuccess` comes from TODO-7.
- The `tab` state can stay separate; keep the fallback to `preview` when a result has no structure report (`docs/architecture/frontend.md`).
- Colours stay on the semantic tokens (`docs/architecture/frontend.md`).
- Finding M3 of `.agents/reviews/codebase-analysis-review.md`; rule: ts-best-practices, Impossible states.

### As Built

- `app/page.tsx` holds an `AnalysisState` union (`idle` / `loading` / `error` / `done`); the `done` value carries the result, `sourceName` and `sourceImages`, and `tab` stays a separate state.
- `deriveHost(sourceName, defaultHost)` builds the download names from the analyzed result.

### Dependencies

- Blocked by: TODO-7
- Blocks: TODO-15

---

## [TODO-10] Type the in-page style walker and remove its double cast

**GitHub**: #174
**Status**: done — issue closed, PR #192 merged
**Type**: Technical
**GitHub Label**: technical
**Priority**: Medium
**Complexity**: Small
**Phase**: Backlog
**Labels**: technical, extraction, tokens-lane
**Source**: `.agents/reviews/codebase-analysis-review.md:24` — "**M4** `lib/extract/styleDump.ts:609` — The in-page style walker returns through `as unknown as StyleDump`, and inside it every record is a `Record<string, unknown>` (lines 369, 372, 523), so the compiler checks nothing between the collector and `NodeStyle`."

### Description

`collectStyleDump` builds every record inside `page.evaluate` as `Record<string, unknown>` and returns through `as unknown as StyleDump`, so the compiler checks nothing between the collector and `NodeStyle`. A renamed field would compile and silently remove a lane from the report, and `npm run eval` replays frozen captures and cannot catch it. Type the in-page code the way `harvester.ts` already does.

### Acceptance Criteria

- [x] Records, the node list and the color list inside the walker are typed `NodeStyle`, `NodeStyle[]` and `NodeStyle["colors"]`.
- [x] `collectStyleDump` has no `as unknown as StyleDump`; the return type of `page.evaluate` is inferred.
- [x] `scanRules` is typed `ReturnType<typeof createStateScanner>` at both call sites.
- [x] The style dump of the fixture pages is the same as before the change.
- [x] `npm run check` and `/verify` (`analyze-url`) pass.

### Technical Notes

- `lib/extract/styleDump.ts`: untyped records at lines 369, 372 and 523; the cast at 609; `scanRules` as an implicit `any` at 579 and 636; the hand-written annotations it forces at 594, 595, 673, 698, 704 and 722.
- Reference: `lib/extract/structure/harvester.ts:80` returns `RawHarvestNode` from inside `page.evaluate` with no cast.
- Keep the `createStateScanner.toString()` mechanism (DIST-048) and the `__name` shim at lines 282-285. Types are erased, so the serialized function does not change.
- Read `docs/architecture/tokens-lane.md` first. Do not refresh `eval/corpus/*/capture.json`: the capture shape does not change.
- TODO-12 edits the same function.
- Finding M4 of `.agents/reviews/codebase-analysis-review.md`; rule: ts-best-practices, No `as` casts.

### As Built

- `collectStyleDump` in `lib/extract/styleDump.ts` builds typed `NodeStyle` records with no `as unknown as StyleDump`; both scanner sites are annotated `ReturnType<typeof createStateScanner>`.
- The one remaining `as unknown as` is the `__name` shim on `globalThis`, which the issue left in place.

### Dependencies

- Blocked by: None
- Blocks: None

---

## [TODO-11] Run the two model calls of the URL path concurrently

**GitHub**: #175
**Status**: done — issue closed, PR #193 merged
**Type**: Enhancement
**GitHub Label**: enhancement
**Priority**: Medium
**Complexity**: Medium
**Phase**: Backlog
**Labels**: enhancement, performance, ai-lane, structure-lane
**Source**: `.agents/reviews/codebase-analysis-review.md:25` — "**M5** `app/api/analyze/route.ts:205` — On the URL path the two model round-trips run in series: `analyzeUrl` awaits `enrichWithAI` (`lib/analyze.ts:354`), and only then does the route start the structure lane, whose Stage 7 makes the second call (`lib/extract/structure/structureAI.ts:205`)."

### Description

With an API key, a URL analysis makes two model calls in series: `analyzeUrl` awaits `enrichWithAI`, and only then does the route start the structure lane, whose Stage 7 makes the second call. The labelling call needs nothing from the enriched report, so the two can run at the same time, as the image path already does.

### Acceptance Criteria

- [x] On the URL path the Stage 7 labelling call starts together with `enrichWithAI`, not after it.
- [x] Stages 8a and 8b still receive the enriched report.
- [x] A failure of the structure lane still yields `structureUnavailableReason` and a response that is not cached.
- [x] `npm run eval` prints the same scores.
- [x] Checked in the running app with an API key (`AI_LANE=on`).

### Technical Notes

- `lib/analyze.ts:354` (enrichment awaited), `app/api/analyze/route.ts:205` (structure lane starts), `lib/extract/structure/structureAI.ts:205` (the Stage 7 call).
- Only Stages 8a and 8b read the report: `regionMetrics.ts:109` and `tokenLink.ts:36`. Split `extractStructure` (`lib/extract/structure/index.ts`) at Stage 7.
- Pattern to follow: the `Promise.all` at `lib/analyze.ts:239`.
- `eval/run.ts` calls `extractStructureFromCapture` with `forceHeuristicNaming: true`; that entry point must keep working offline.
- The duration of the saved round-trip was not measured, because it needs a key.
- Read `docs/architecture/orchestration.md` and `docs/architecture/structure-lane.md` first.
- Finding M5 of `.agents/reviews/codebase-analysis-review.md`; rule: react-best-practices, `async-dependencies`.

### As Built

- `analyzeUrl` runs `enrichWithAI` and `extractStructureThroughStage7` together with `Promise.all`, then passes the enriched report to `finalizeStructure` (Stages 8a–10).
- The `VERIFY_AI=1` run is recorded in `.agents/reports/todo-11-run-url-model-calls-concurrently-plan-report.md` (`aiOutcome: "applied"`).

### Dependencies

- Blocked by: None
- Blocks: None

---

## [TODO-12] Fetch cross-origin stylesheets concurrently, with a timeout, once per analysis

**GitHub**: #176
**Status**: done — issue closed, PR #194 merged
**Type**: Enhancement
**GitHub Label**: enhancement
**Priority**: Medium
**Complexity**: Medium
**Phase**: Backlog
**Labels**: enhancement, performance, extraction, states
**Source**: `.agents/reviews/codebase-analysis-review.md:26` — "**M6** `lib/extract/styleDump.ts:622` — Cross-origin stylesheets are fetched one at a time inside a `for` loop, with no timeout, and the whole loop runs twice per analysis."

### Description

`collectStyleDump` fetches cross-origin stylesheets one at a time with no timeout, and it runs for both the light and the dark render, so each sheet is downloaded twice. Playwright's default request timeout is 30 s, so two stalled hosts use the route's whole 60 s. Fetch the sheets concurrently with a short timeout, once per analysis.

### Acceptance Criteria

- [x] Cross-origin stylesheets are fetched concurrently, each with an explicit timeout of a few seconds.
- [x] Their rules are applied in the original stylesheet order.
- [x] The dark-scheme pass reuses the CSS text that the light pass fetched.
- [x] A sheet that fails or times out is skipped without failing the analysis.
- [x] Checked on a page with a cross-origin stylesheet: the same hover/focus states and keyframes are recovered as before.

### Technical Notes

- Loop at `lib/extract/styleDump.ts:620-735`, request at line 622. Callers: `lib/ingest.ts:305` (light render) and `:176` (dark render).
- Keep the pass best-effort and merge-only (`docs/architecture/tokens-lane.md`): a fetched value never overwrites one that the in-page pass measured.
- The refetch is outside the SSRF guard by a documented decision (README, "Layer 2 — network-restrict the container"); this issue does not change that.
- The check needs a local page with a cross-origin sheet; `.agents/reports/cross-origin-states-spike.md` describes the two-origin fixture.
- TODO-10 edits the same function.
- Finding M6 of `.agents/reviews/codebase-analysis-review.md`; rule: react-best-practices, `async-parallel`.

### As Built

- `fetchCrossOriginSheet` requests every sheet at once under `CROSS_ORIGIN_SHEET_TIMEOUT_MS` (5 s), and the texts are applied in stylesheet order.
- A `CrossOriginSheetCache` that `capturePage` creates per capture is shared by the light and dark dumps; a failed sheet is remembered as `null` and not retried.

### Dependencies

- Blocked by: None
- Blocks: None

---

## [TODO-13] Bring the AI lane's JSON Schema back in line with its Zod schema

**GitHub**: #177
**Status**: done — issue closed, PR #198 merged
**Type**: Technical
**GitHub Label**: technical
**Priority**: Medium
**Complexity**: Small
**Phase**: Backlog
**Labels**: technical, ai-lane, schema
**Source**: `.agents/reviews/codebase-analysis-review.md:27` — "**M7** `lib/interpret.ts:52` — `OUTPUT_SCHEMA`, the hand-written JSON Schema copy of `aiResponseSchema`, has drifted from it."

### Description

`OUTPUT_SCHEMA` in `lib/interpret.ts` is a hand-written JSON Schema copy of `aiResponseSchema`, and it lacks the bounds that Zod enforces. A reply that the provider accepts against the copy can fail Zod, and after two attempts the whole AI lane is dropped. Make the schema that is sent state what Zod checks.

### Acceptance Criteria

- [x] The schema sent for the interpretation lane states the bounds of `aiResponseSchema`: 3 to 6 adjectives, a non-empty archetype and description, and at least one hero and one texture query.
- [x] `npm run eval:ai` passes with a key on Gemini, and the request is accepted over OpenRouter.
- [x] `npm run check` passes.

### Technical Notes

- The copy is at `lib/interpret.ts:52-93`; the Zod bounds are at `lib/schema.ts:307-318`; the rejection is at `interpret.ts:180`.
- Two ways, from the finding: derive both schemas with `z.toJSONSchema`, or add the missing bounds to the copy by hand. zod 4.4.3 has `z.toJSONSchema`; on `aiResponseSchema` it emits `minItems`, `maxItems`, `minLength` and `pattern`, plus `$schema` and `default`.
- `STRUCTURE_SCHEMA` (`lib/extract/structure/structureAI.ts:31`) is a second hand-written copy, in sync today. It uses `additionalProperties` dictionaries, which is why the OpenRouter request is not `strict` (`lib/aiLane.ts:147-155`).
- Only a live call shows whether a provider accepts the generated keywords, so keep this change in a pull request of its own.
- Finding M7 of `.agents/reviews/codebase-analysis-review.md`; outside the guides.

### As Built

- `OUTPUT_SCHEMA = z.toJSONSchema(aiResponseSchema)` in `lib/interpret.ts`, sent non-strict; `STRUCTURE_SCHEMA` stays a hand-written mirror.
- At the time, the stability gate of `npm run eval:ai` failed on the native Gemini API while the schema was accepted; the native path was removed later (#199), and `npm run eval:ai` has passed over OpenRouter on the default Gemini model since #209 (`.agents/reports/issue-209-seed-interpretation-lane-plan-report.md`).

### Dependencies

- Blocked by: None
- Blocks: None

---

## [TODO-14] Cache nearest-color lookups in the palette area pass

**GitHub**: #178
**Status**: done — issue closed, PR #202 merged
**Type**: Enhancement
**GitHub Label**: enhancement
**Priority**: Medium
**Complexity**: Small
**Phase**: Backlog
**Labels**: enhancement, performance, palette
**Source**: `.agents/reviews/codebase-analysis-review.md:28` — "**M8** `lib/extract/palette.ts:156` — The area pass converts every sampled pixel to Lab and scans all canonical colors for it, although a screenshot holds few distinct colors."

### Description

The palette's area pass converts every sampled pixel to Lab and scans all canonical colors for it. On the three committed captures this takes 108-204 ms for about 300,000 pixels, most of `extractPalette`, and it runs synchronously on the server's one thread. A cache keyed by the RGB value gave identical credits in 5-41 ms.

### Acceptance Criteria

- [x] The area pass takes each pixel's nearest canonical color from a per-call cache keyed by its RGB value, and computes Lab only on a miss.
- [x] Area weights and image-sourced colors are identical to before for the three committed captures.
- [x] `npm run eval` prints the same scores, with the baseline untouched.

### Technical Notes

- Loop at `lib/extract/palette.ts:152-180` (`assignAreaWeights`); the conversion is at line 156.
- Cache: a `Map<number, number>` from `(r << 16) | (g << 8) | b` to the nearest canonical index, or -1 for "no match". A pixel that hits -1 must still count toward `farCount` and its `farBuckets` entry, as it does today.
- Workflow from AGENTS.md: make the change, run `npm run eval`, and do not refresh the baseline, because the scores must not move.
- Read `docs/architecture/tokens-lane.md` first.
- Finding M8 of `.agents/reviews/codebase-analysis-review.md`; rule: react-best-practices, `js-cache-function-results`.

### As Built

- `assignAreaWeights` in `lib/extract/palette.ts` keys a per-call cache by `(r << 16) | (g << 8) | b`; a miss still counts toward `farCount`/`farBuckets`.

### Dependencies

- Blocked by: None
- Blocks: None

---

## [TODO-15] Stop repeating screenshots in the `/api/analyze` response

**GitHub**: #179
**Status**: done — issue closed, PR #203 merged
**Type**: Enhancement
**GitHub Label**: enhancement
**Priority**: Medium
**Complexity**: Medium
**Phase**: Backlog
**Labels**: enhancement, api, performance, frontend
**Source**: `.agents/reviews/codebase-analysis-review.md:29` — "**M9** `app/api/analyze/route.ts:169` — The response carries the same screenshots more than once, and in image mode it sends the uploads back to the client that sent them."

### Description

The response carries `viewportShot` in addition to `viewportShots[0]`, and in image mode it returns every uploaded image to the client that sent it; each response is also kept in the cache. Remove the legacy field and stop returning the uploads (decided on 2026-10-13: both changes).

### Acceptance Criteria

- [x] The response has no `viewportShot`; the page reads `viewportShots[0]`.
- [x] In image mode the response returns no screenshots, and the preview shows the images captured at submit time.
- [x] `README.md` and `docs/architecture/api-route.md` describe the new response.
- [x] `/verify` (`analyze-url`, `analyze-images`) passes, with the `viewportShots` check in `drive.ts` updated.

### Technical Notes

- `app/api/analyze/route.ts:169-174` (image path) and `:225-228` (URL path); the cache writes are at lines 189 and 236.
- `app/page.tsx:632-650` reads the singular field when the plural has one entry or none.
- In image mode the page shows the previews it held at submit time; keep them in the `done` state of TODO-9, not in the live form.
- `.claude/skills/verify/scripts/drive.ts`: line 288 checks that `viewportShots` has one entry per kept image, and `slim` (lines 64-71) reads both fields.
- Docs to update: `README.md:59` and `docs/architecture/api-route.md:3`.
- Measured on `clean-light`: 119 KiB of the 366 KiB of image data is the repeat.
- Finding M9 of `.agents/reviews/codebase-analysis-review.md`; outside the guides.

### As Built

- The URL response carries only `meta.viewportShots` (viewport, then panorama); the image response carries no screenshots, and the page shows the `sourceImages` it held at submit.
- `docs/architecture/api-route.md` describes the response; the README described it when the issue closed, but the rewrite of the README in `a3dd6ef` removed its API section, so the README no longer mentions the response.

### Dependencies

- Blocked by: TODO-7, TODO-9
- Blocks: None

---

## [TODO-16] Remove the dead `Page` overload of `extractStructure`

**GitHub**: #180
**Status**: done — issue closed, PR #188 merged
**Type**: Technical
**GitHub Label**: technical
**Priority**: Low
**Complexity**: Small
**Phase**: Backlog
**Labels**: technical, cleanup, structure-lane
**Source**: `.agents/reviews/codebase-analysis-review.md:32` — "**L1** `lib/extract/structure/index.ts:38` — The `Page` overload of `extractStructure` is dead: the only caller (`lib/analyze.ts:119`) passes an options object, and `git log -S"extractStructure(page"` finds no commit that ever passed a page since the function was added (1434c3f)."

### Description

`extractStructure` accepts a Playwright `Page` or an options object, but its only caller passes options and no commit has ever passed a page. The overload forces two casts and makes `rawHarvestNode` optional with a run-time check. Remove it.

### Acceptance Criteria

- [x] `extractStructure` takes one options parameter with `rawHarvestNode` required.
- [x] The `Page` branch, its two casts and the `harvestDomTree` import are gone from `lib/extract/structure/index.ts`.
- [x] `npm run check` passes.

### Technical Notes

- `lib/extract/structure/index.ts:38-76`; the caller is `lib/analyze.ts:119`, which already checks `capture.rawHarvestNode` at line 116.
- History: the overload was added in 1434c3f; `git log -S"extractStructure(page"` finds no commit.
- Finding L1 of `.agents/reviews/codebase-analysis-review.md`; rule: ts-best-practices, Impossible states.

### As Built

- `ExtractStructureOptions.rawHarvestNode` is required in `lib/extract/structure/index.ts`, which imports no Playwright `Page` and no `harvestDomTree`.

### Dependencies

- Blocked by: None
- Blocks: None

---

## [TODO-17] Delete three unused leftovers

**GitHub**: #181
**Status**: done — issue closed, PR #188 merged
**Type**: Technical
**GitHub Label**: technical
**Priority**: Low
**Complexity**: Small
**Phase**: Backlog
**Labels**: technical, cleanup
**Source**: `.agents/reviews/codebase-analysis-review.md:33` — "**L2** `lib/extract/palette.ts:464` — Three leftovers have no caller: the `additionalScreenshotsPngBase64` field (also lines 498, 501), the `foldCutoffY` parameter of `pruneAndCollapse` (`lib/extract/structure/pruner.ts:8`), and `lightness` (`lib/color.ts:47`)."

### Description

Three leftovers have no caller: the `additionalScreenshotsPngBase64` field of `PaletteInput`, the `foldCutoffY` parameter of `pruneAndCollapse`, and `lightness` in `lib/color.ts`. The first is the way back to the double count of above-the-fold pixels that DIST-074 removed.

### Acceptance Criteria

- [x] `additionalScreenshotsPngBase64` is removed from `PaletteInput` and from `extractPalette`.
- [x] The `foldCutoffY` parameter is removed from `pruneAndCollapse`.
- [x] `lightness` is removed from `lib/color.ts`.
- [x] `npm run check` passes.

### Technical Notes

- `lib/extract/palette.ts:464`, `:498`, `:501`; `lib/extract/structure/pruner.ts:8`, `:14`, `:17`; `lib/color.ts:46-50`.
- History: e954cca (DIST-074, #136) stopped passing the extra screenshots; `foldCutoffY` has never been passed since 1434c3f; `lightness` has never been called since 4936522.
- Finding L2 of `.agents/reviews/codebase-analysis-review.md`; outside the guides.

### As Built

- `additionalScreenshotsPngBase64`, `foldCutoffY` and `lightness` no longer appear in `lib/`.

### Dependencies

- Blocked by: None
- Blocks: None

---

## [TODO-18] Replace seventeen casts with annotations or narrowing

**GitHub**: #182
**Status**: done — issue closed, PR #204 merged
**Type**: Technical
**GitHub Label**: technical
**Priority**: Low
**Complexity**: Medium
**Phase**: Backlog
**Labels**: technical, cleanup
**Source**: `.agents/reviews/codebase-analysis-review.md:34` — "**L3** `lib/analyze.ts:242` — Seventeen casts stand where a type annotation or a narrowing check does the same job."

### Description

Seventeen type assertions stand where an annotation or a narrowing check does the same job. Replace them; no behaviour changes.

### Acceptance Criteria

- [x] The casts at `lib/analyze.ts` 242, 264, 270, 275, 276 and 359 and at `lib/extract/imagePalette.ts:142` give way to one declared outcome type and annotations.
- [x] `app/page.tsx:54` and `lib/color.ts:55` test with `typeof`; `lib/extract/styleDump.ts:351` and `lib/extract/structure/harvester.ts:52`, `:54` narrow with `instanceof`.
- [x] `lib/extract/states.ts:73` keeps `{ target, state }` in the bucket; `getCache` returns `unknown`; the maps of `eval/score.ts` are typed `Map<string, …>`; `lib/aiLane.ts:168` reads the reply as `unknown` and narrows it.
- [x] `npm run check` passes with the same eval scores.

### Technical Notes

- Count today: 39 assertions, from `npx eslint . --rule '{"@typescript-eslint/consistent-type-assertions":["error",{"assertionStyle":"never"}]}'`.
- Not in scope: `lib/interpret.ts:249` (inside a type guard), the `__name` shim at `styleDump.ts:283`, and the casts that TODO-7, TODO-10, TODO-16 and TODO-19 remove.
- `getCache<T>` (`lib/cache.ts:75`) has one caller, `app/api/analyze/route.ts:123`, which already passes `unknown`.
- Finding L3 of `.agents/reviews/codebase-analysis-review.md`; rule: ts-best-practices, Narrowing hierarchy.

### As Built

- Fifteen casts were replaced, not seventeen: the other two (`lib/analyze.ts:242` and `:359`) had already gone with #172; the trial lint rule went from 38 assertions to 23.
- 61 recorded outputs were identical before and after (`.agents/reports/todo-18-replace-seventeen-casts-with-annotations-or-narrowing-plan-report.md`).

### Dependencies

- Blocked by: None
- Blocks: None

---

## [TODO-19] Validate `expected.yaml` with a strict schema

**GitHub**: #183
**Status**: done — issue closed, PR #205 merged
**Type**: Technical
**GitHub Label**: technical
**Priority**: Low
**Complexity**: Small
**Phase**: Backlog
**Labels**: technical, eval
**Source**: `.agents/reviews/codebase-analysis-review.md:35` — "**L4** `eval/run.ts:50` — `expected.yaml` is loaded with `as ExpectedSpec`, and the captures and the baseline with `as Capture` and an annotation (`run.ts:49`, `:173`, `eval/stability.ts:62`)."

### Description

`eval/run.ts` loads each hand-written `expected.yaml` with `as ExpectedSpec`. A misspelt key is not an error: the scorer treats the missing part as a full score, so the only correctness gate would weaken without a message. Validate the spec at load.

### Acceptance Criteria

- [x] `expected.yaml` is parsed with a strict Zod schema at load, and `as ExpectedSpec` is gone.
- [x] A spec with an unknown key fails `npm run eval` with a message that names the key.
- [x] `npm run eval` passes with the three committed specs unchanged.

### Technical Notes

- `eval/run.ts:49-50` and `:173`; `eval/stability.ts:62`; the types are at `eval/score.ts:14-25` and `eval/scoreStructure.ts:3-15`.
- The silent paths: `eval/scoreStructure.ts:42-49` returns 1.0 for a missing spec, and `eval/score.ts:136` substitutes the palette score for missing typography.
- The fix covers the spec. The `as Capture` reads of the captures are named in the finding but are not required here.
- Do not edit `eval/corpus/adversarial-shell/expected.yaml` to make it fit (AGENTS.md).
- Finding L4 of `.agents/reviews/codebase-analysis-review.md`; rule: ts-best-practices, No `as` casts.

### As Built

- `loadExpectedSpec` in `eval/run.ts` parses each spec with `expectedSpecSchema` (`z.strictObject` in `eval/score.ts`), whose structure part is `expectedStructureSpecSchema` in `eval/scoreStructure.ts`.

### Dependencies

- Blocked by: None
- Blocks: None

---

## [TODO-20] Make `CorpusEntry` a union of fixture and URL entries

**GitHub**: #184
**Status**: done — issue closed, PR #206 merged
**Type**: Technical
**GitHub Label**: technical
**Priority**: Low
**Complexity**: Small
**Phase**: Backlog
**Labels**: technical, eval
**Source**: `.agents/reviews/codebase-analysis-review.md:36` — "**L5** `eval/corpus.ts:23` — `CorpusEntry` declares `fixture?` and `url?` as two optional fields although exactly one must be set."

### Description

`CorpusEntry` declares `fixture?` and `url?` as two optional fields although exactly one must be set, so `eval/capture.ts` needs two non-null assertions and an entry with neither compiles. Make it a union.

### Acceptance Criteria

- [x] An entry has either `fixture` or `url`; one with neither does not compile.
- [x] `eval/capture.ts` narrows with `in` and has no `!` on `entry.url` or `entry.fixture`.
- [x] `npm run eval` passes.

### Technical Notes

- `eval/corpus.ts:14-29`; `eval/capture.ts:23-25`, `:47` and `:75`.
- Finding L5 of `.agents/reviews/codebase-analysis-review.md`; rule: ts-best-practices, Discriminated unions.

### As Built

- `CorpusEntry` in `eval/corpus.ts` is a union of a `fixture` entry and a `url` entry, and `eval/capture.ts` narrows with `"fixture" in entry`.

### Dependencies

- Blocked by: None
- Blocks: None

---

## [TODO-21] Include the verify driver in the type check

**GitHub**: #185
**Status**: done — issue closed, PR #188 merged
**Type**: Technical
**GitHub Label**: technical
**Priority**: Low
**Complexity**: Small
**Phase**: Backlog
**Labels**: technical, tooling
**Source**: `.agents/reviews/codebase-analysis-review.md:37` — "**L6** `tsconfig.json:21` — `.claude/skills/verify/scripts/drive.ts` (345 lines) is outside the type check: the `**/*.ts` pattern does not enter directories whose name starts with a dot, and `tsc --listFilesOnly` lists no file under `.claude`."

### Description

`.claude/skills/verify/scripts/drive.ts` (345 lines) is outside the type check, because the `**/*.ts` pattern of `tsconfig.json` does not enter directories whose name starts with a dot. A probe config that included the file gave 0 errors, so the setting is free to turn on.

### Acceptance Criteria

- [x] `tsconfig.json` includes `.claude/skills/verify/scripts/**/*.ts`.
- [x] `tsc --listFilesOnly` lists `drive.ts`.
- [x] `npm run check` passes.

### Technical Notes

- `tsconfig.json:21`.
- `next build` type-checks the same program, so the driver must keep compiling under `npm run check`.
- Finding L6 of `.agents/reviews/codebase-analysis-review.md`; outside the guides.

### As Built

- `tsconfig.json` includes `.claude/skills/verify/scripts/**/*.ts`, and `tsc --listFilesOnly` lists `drive.ts`.

### Dependencies

- Blocked by: None
- Blocks: None

---

## [TODO-22] Declare the capture artifacts once

**GitHub**: #186
**Status**: done — issue closed, PR #188 merged
**Type**: Technical
**GitHub Label**: technical
**Priority**: Low
**Complexity**: Medium
**Phase**: Backlog
**Labels**: technical, cleanup, ingestion
**Source**: `.agents/reviews/codebase-analysis-review.md:38` — "**L7** `lib/analyze.ts:304` — The set of capture artifacts is declared three times (`RenderResult` at `lib/ingest.ts:18`, the return type of `capturePage` at `:284`, `Capture` at `lib/analyze.ts:28`) and copied field by field three times (`lib/ingest.ts:446`, `lib/analyze.ts:304`, `eval/capture.ts:44`)."

### Description

The set of capture artifacts is declared three times and copied field by field three times. Every field is optional, so a new one that is missed in any of the six places compiles and is silently dropped, which already happened to `motion` in a hand-listed copy. Declare the set once.

### Acceptance Criteria

- [x] The capture artifacts are declared once, in `lib/ingest.ts`.
- [x] `RenderResult`, the return type of `capturePage` and `Capture` are built from that one type.
- [x] `renderUrl`, `captureFromRender` and `eval/capture.ts` copy the artifacts with a spread, not field by field.
- [x] `npm run check` passes.

### Technical Notes

- Declarations: `lib/ingest.ts:18` (`RenderResult`), `:284` (the return type of `capturePage`), `lib/analyze.ts:28` (`Capture`).
- Copies: `lib/ingest.ts:446`, `lib/analyze.ts:304`, `eval/capture.ts:44`.
- The shape of `capture.json` must not change, and the committed captures are not refreshed.
- Precedent: the comment at `lib/analyze.ts:157-160`.
- Finding L7 of `.agents/reviews/codebase-analysis-review.md`; outside the guides.

### As Built

- `CaptureArtifacts` in `lib/ingest.ts` is extended by `RenderResult` and `Capture` and is the return type of `capturePage`; `renderUrl`, `captureFromRender` and `eval/capture.ts` copy it with a rest/spread.
- PR #188 also added `scripts/guard-build.mjs` as the `prebuild` guard and the Rules & Enforcements table of `AGENTS.md`.

### Dependencies

- Blocked by: None
- Blocks: None

---

## [TODO-23] Add a permanent two-origin check of the cross-origin stylesheet pass

**GitHub**: #196
**Status**: done — issue closed, PR #213 merged
**Type**: Technical
**GitHub Label**: technical
**Priority**: Medium
**Complexity**: Medium
**Phase**: Backlog
**Labels**: technical, tooling, states, extraction
**Source**: `TODO.md:6` — "Add a permanent two-origin check of the cross-origin stylesheet pass to the verify skill: a second origin in the fixture server and a `drive.ts` scenario."

### Description

The second pass of `collectStyleDump` refetches cross-origin stylesheets and recovers their hover/focus states and keyframes. `npm run eval` replays frozen captures and CI runs nothing else, so no committed check executes that pass: TODO-12 was proved by a scratch script that was deleted afterwards. Add a check to the verify skill that can be rerun with one command.

### Acceptance Criteria

- [x] The verify fixture server serves a stylesheet from a second origin, and a fixture page links it.
- [x] A `verify.sh drive` scenario analyzes that page and checks that the hover/focus states and the keyframes of the cross-origin sheet are in the report.
- [x] The scenario fails on a tree where the cross-origin pass is disabled, shown once before the change is merged. (inferred)
- [x] The scenario also covers a cross-origin sheet that never answers: the analysis completes, and that sheet is skipped. (inferred)
- [x] The feature map and the scenario table of the verify `SKILL.md` list the new scenario. (inferred)
- [x] `npm run check` passes. (inferred)

### Technical Notes

- The scratch script of TODO-12 is embedded verbatim in `.agents/plans/completed/todo-12-fetch-cross-origin-stylesheets-concurrently-plan.md`, under "End-to-End Verification". It checks one fetch per sheet per capture, stylesheet order, a sheet that never answers, and a sheet that stalls in its body. `.agents/reports/cross-origin-states-spike.md` describes the first two-origin fixture.
- Files: `.claude/skills/verify/scripts/fixture-server.mjs` (one origin today), `verify.sh` (starts it at line 71, writes `FIXTURE_PORT` and `FIXTURE_URL` to `.verify/current.env`, doctor check at line 115), `drive.ts` (scenarios at lines 140-313, dispatch at lines 337-341), `features/README.md`, `SKILL.md`.
- A second port on `127.0.0.1` is a different origin, and the app already runs with `SSRF_ALLOWLIST_HOSTS=127.0.0.1`. The refetch itself is outside the SSRF guard (README, "Layer 2 — network-restrict the container").
- The fixture server serves `eval/fixtures/`. A new page there is not scored by eval unless `eval/corpus.ts` lists it; do not add it to the corpus, and do not refresh the committed captures.
- The verify proof standard applies: drive the real UI or `/api/analyze`, not `collectStyleDump` directly.
- CI does not run the verify skill, so this check stays a manual gate. Assumption: that is enough for "permanent".
- `drive.ts` is type-checked and linted with the repo.

### As Built

- The fixture server serves `eval/fixtures/*.css` on a second port of `127.0.0.1`; `eval/fixtures/cross-origin.html` links `cross-origin.css` and `cross-origin-stalled.css`, the second answered only for the browser's own load.
- `scenarioCrossOrigin` in `drive.ts` checks the states, the keyframes, the skipped stalled sheet and a 20 s render budget; the negative controls are recorded in `.agents/reports/todo-23-add-two-origin-cross-origin-stylesheet-check-plan-report.md`.
- CI does not run it; it is a manual gate.

### Dependencies

- Blocked by: None
- Blocks: None
- Related: TODO-12 (#176)

---

## [TODO-24] Warn when a cross-origin stylesheet refetch times out

**GitHub**: #197
**Status**: done — issue closed, PR #214 merged
**Type**: Enhancement
**GitHub Label**: enhancement
**Priority**: Medium
**Complexity**: Small
**Phase**: Backlog
**Labels**: enhancement, extraction, states
**Source**: `TODO.md:7` — "Log a `console.warn` when a cross-origin stylesheet refetch times out (not on a 404), so that a stalled host is visible in the server log."

### Description

`fetchCrossOriginSheet` gives each cross-origin stylesheet 5 s and turns every failure into a silent skip. A host that is slow or stalled therefore removes hover/focus states and keyframes from the report, and the server log does not say why. Log a warning for a timeout, as the other best-effort passes of `lib/ingest.ts` do for their failures.

### Acceptance Criteria

- [x] A cross-origin sheet whose refetch times out produces a `console.warn` that names the sheet's URL and the timeout.
- [x] A sheet that answers with a status that is not ok, or with an empty body, is still skipped without a log line.
- [x] The warning appears once per sheet per analysis; the dark-scheme pass does not repeat it. (inferred)
- [x] The analysis still completes, and the report is the same as without the warning. (inferred)
- [x] `npm run check` passes. (inferred)

### Technical Notes

- `fetchCrossOriginSheet` is at `lib/extract/styleDump.ts:128-146`; its `.catch(() => null)` swallows every rejection. `CROSS_ORIGIN_SHEET_TIMEOUT_MS` is at line 114.
- Playwright's `request.get` rejects on a timeout and resolves on a non-ok status, so the two cases already take different branches. A refused connection or a DNS failure also rejects; the warning must tell a timeout from those.
- Assumption: other request failures (refused connection, DNS) stay silent, because the owner asked for the timeout only.
- The promise is cached per capture in `CrossOriginSheetCache`, so a warning in the fetch itself is logged once for both passes.
- Pattern: the `console.warn` calls of the best-effort passes at `lib/ingest.ts:160`, `:189`, `:279`, `:316`.
- `npm run eval` does not run this path. Check it with a scratch script against a local server that never answers (`AGENTS.md`, "Manually verifying extraction changes"), or with the scenario of TODO-23 when it exists.

### As Built

- `fetchCrossOriginSheet` logs a `console.warn` naming the URL and `CROSS_ORIGIN_SHEET_TIMEOUT_MS` only for a Playwright `errors.TimeoutError`, from inside the cached promise, so once per analysis; other failures stay silent.

### Dependencies

- Blocked by: None
- Blocks: None
- Related: TODO-12 (#176), TODO-23

---

## [TODO-25] Remove the native Gemini provider path and run the AI lane over OpenRouter only

**GitHub**: #199
**Status**: done — issue closed, PR #201 merged
**Type**: Technical
**GitHub Label**: technical
**Priority**: Medium
**Complexity**: Medium
**Phase**: Backlog
**Labels**: technical, ai-lane, cleanup
**Source**: `TODO.md:8` — "Remove the native Gemini provider path so that the AI lane runs over OpenRouter only: delete `callGeminiModel`, the `GEMINI_API_KEY` and `GEMINI_MODEL` variables, the Gemini-only `thinkingLevel` knob, and the `@google/genai` dependency, and update the tooling and the docs that name Gemini as a provider."

### Description

`callModel` has two provider paths, and the native Gemini one is never taken while `OPENROUTER_API_KEY` is set, which is how the owner runs the app. Keeping it costs a second path to verify (TODO-13 was blocked on it), a Gemini-only `thinkingLevel` knob that the OpenRouter path ignores with a warning, and the `@google/genai` dependency. Remove it, so that the AI lane has one provider, OpenRouter, which still routes to Gemini models.

### Acceptance Criteria

- [x] `callModel` has one path, OpenRouter: `callGeminiModel`, `AI_MODEL`, and every read of `GEMINI_API_KEY` and `GEMINI_MODEL` are gone from the code, and `@google/genai` is removed from `package.json` and the lockfile.
- [x] `ModelCall` has no `thinkingLevel` field, the three callers do not pass one, and the once-per-process warning about it is gone.
- [x] The tooling and the docs name OpenRouter as the only provider: the README, `techstack.md`, `docs/architecture/orchestration.md`, the PRD, the verify skill, the skip message of `npm run eval:ai`, and the setup hint in the UI.
- [x] All three AI lanes still return a validated reply over OpenRouter: `npm run eval:ai` passes, and a `VERIFY_AI=1` run of the verify skill shows an applied interpretation for a URL and an inferred structure for an image.
- [x] `npm run check` passes.

### Technical Notes

- `lib/aiLane.ts`: the SDK import at line 10, the re-export of `ThinkingLevel` at 18, `AI_MODEL` at 21, `aiLaneAvailable` at 25 (reads both keys), the Gemini key check at 45-50, `thinkingLevel` in `ModelCall` at 73, the warning at 91-97, `callGeminiModel` up to line 202, and the dispatch in `callModel` at 211-216.
- The callers that pass `thinkingLevel`: `lib/interpret.ts:151`, `lib/extract/structure/structureAI.ts:168`, `lib/extract/structureFromImage.ts:99`. The OpenRouter path already ignores it, so removing it does not change how the app runs with an OpenRouter key; the live run of the fourth criterion confirms it.
- Messages that name the Gemini key: `lib/analyze.ts:279`, `app/page.tsx:428`, `eval/stability.ts:16` and `:93`. Comments: `lib/extract/structureFromImage.ts:16`, `lib/extract/structure/structureAI.ts:184`, `eval/run.ts:62`, `lib/extract/imageMediaType.ts:18`, and `lib/interpret.ts:36` and `:62-66` (the sentence about Gemini's documented keywords, added for TODO-13, no longer applies).
- Tooling: `.claude/skills/verify/scripts/verify.sh:79` sets both keys empty; `.claude/skills/verify/SKILL.md:28` and `features/analyze-images.md:11` describe them.
- Docs: `README.md:68-92` (the provider list and the `.env.local` options) and `:155` (the `docker run` example), `techstack.md:28` and `:57-58`, `docs/architecture/orchestration.md:7` and `:9`, and `.agents/PRDs/PRD.md`.
- The default model `google/gemini-3.5-flash` at `lib/aiLane.ts:89` is an OpenRouter model id and stays.
- Assumption (owner approved): a setup that has only `GEMINI_API_KEY` gets the same no-key behavior as a setup with no key, with no migration message.
- The README's option A, a free Gemini key with no credit card, goes away: a person who is given the app needs an OpenRouter key. That touches the open question of TODO-3.
- CI has no key, so nothing in `npm run check` reaches a provider; the live checks need `OPENROUTER_API_KEY`.
- The plans, reports and reviews under `.agents/` that mention Gemini are history and are not edited.

### As Built

- `lib/aiLane.ts` talks to OpenRouter only, `ModelCall` has no `thinkingLevel`, and `package.json` has no model SDK.
- `techstack.md` no longer exists (`TECHSTACK.md` was deleted in `949dc12`, and `PROJECT-GUIDE.md` took its place).
- When the issue closed, the stability gate of `npm run eval:ai` failed as written (also on unchanged `main`); it has passed in 5 of 5 runs since #209 seeded the interpretation lane. The `VERIFY_AI=1` run showed `aiOutcome: applied` for a URL and images and `fidelity: inferred`.

### Dependencies

- Blocked by: None
- Blocks: None
- Related: TODO-13 (#177), TODO-3 (#158)

---

## [TODO-26] Prune Non-Essential Comments Across the Codebase

**GitHub**: #212
**Status**: done — issue closed, PR #217 merged
**Type**: Technical
**GitHub Label**: technical
**Priority**: Medium
**Complexity**: Medium
**Phase**: Backlog
**Labels**: technical, cleanup
**Source**: `TODO.md:9` — "There are so many comments all over the codebase. Prune them - keep only the absolutely necessary ones."

### Description

Audit and prune excessive, redundant, or narrative comments across the codebase. Retain only necessary comments: non-obvious architectural invariants, critical security/SSRF constraints, and complex domain math rationale.

### Acceptance Criteria

- [x] Redundant, narrative comments that merely restate what adjacent code does (e.g. obvious fall-throughs or mechanical step descriptions) are removed across `lib/`, `app/`, and `eval/`.
- [x] Essential comments are preserved: non-obvious design constraints, safety/security invariants (SSRF/rate-limit bounds), and tricky color math or Playwright browser workarounds.
- [x] Code documentation integrity is maintained without altering runtime behavior or types.
- [x] `npm run check` (typecheck, lint, build, eval) passes with zero regressions.

### Technical Notes

- Scan `lib/`, `app/`, and `eval/` for obsolete, conversational, or line-by-line narrative comments.
- Keep comments that explain "why" (architectural constraints, Chromium bundling requirements in `next.config.mjs`, Docker base image version coupling, SSRF DNS-rebinding mitigations).
- Remove comments that explain "what" where the TypeScript types or self-explanatory function names already express it clearly.
- Ensure strict adherence to repository guidelines (`AGENTS.md`) and run `npm run check`.

### As Built

- PR #217 pruned comments across `lib/`, `app/` and `eval/`; the comments on the SSRF residual gaps (`lib/ingest.ts`), the panorama warning and the Docker tag lockstep remain.
- `npm run typecheck`, `npm run lint` and `npm run eval` passed on 2026-10-14 at `4291324`, and CI passed on the same commit.

### Dependencies

- Blocked by: None
- Blocks: None

---

## [TODO-27] Keep page sections that share a shape from collapsing into one repeated component

**GitHub**: #218
**Status**: pending
**Type**: Bug
**GitHub Label**: bug
**Priority**: Medium
**Complexity**: Medium
**Phase**: Backlog
**Labels**: bug, structure-lane, extraction
**Source**: `TODO.md:11` — "Stage 5 repetition merges two page sections that share a shape (a heading over a card grid), so the second one, with different content (pricing after features), vanishes from the skeleton and the page-sections digest. Keep page bands apart, or compare more than tag shape, so `saas-landing` scores 1.00."

### Description

Stage 5 (`detectRepetition` in `lib/extract/structure/repetition.ts`) collapses sibling nodes whose signature matches, and the signature is only the node's tag plus the tags of its first five children. Two page sections with the same shape but different content therefore count as one repeated component: the first is kept with `instanceCount: 2` and the second is dropped from the tree. On the `saas-landing` eval fixture, the features and the pricing section become one `SectionCard ×2`, so the pricing band is missing from the skeleton and the page-sections digest, and every later section shifts by one position.

### Acceptance Criteria

- [ ] Two sibling page sections with the same tag shape but different content stay two nodes in the skeleton and two entries in the page-sections digest.
- [ ] Repeated content that really is one component (the cards inside a grid, the logos of a logo cloud, FAQ `details`) still collapses to `×N` as today.
- [ ] `saas-landing` scores 1.00 in `npm run eval`, with its `expected.yaml` unchanged, and `eval/baseline.json` is refreshed deliberately in the same change.
- [ ] `clean-light`, `dark-mode` and `adversarial-shell` keep their scores.
- [ ] The responsive diff still aligns the trees, since Stage 7b runs the same stages on each secondary-viewport harvest. (inferred)
- [ ] `npm run check` passes. (inferred)

### Technical Notes

- The collapse is the `count >= 2` branch of `detectRepetition`: the first match is pushed with `instanceCount: count`, every later match hits `continue`. `getBaseSignature` builds `tag[childTag,…]` from at most five children.
- On `saas-landing`, both sections squash to `section[h2,div]` (Stage 4b merges the `max-w` wrapper), which is why they match.
- Two directions, not decided: keep the bands that `findDigestBands` (`sections.ts`) reports out of the collapse, or make the signature compare more than tag shape (for example the subtree's text or child count). The first keeps the change small and leaves card grids alone; the second also affects footer columns, which collapse the same way.
- The fixture's `expected.yaml` documents the defect and must not be edited to match the collapsed output (`docs/architecture/eval.md`).
- Read `docs/architecture/structure-lane.md` and `docs/architecture/eval.md` first.

### Dependencies

- Blocked by: None
- Blocks: None
- Related: TODO.md:10 (eval headroom)
