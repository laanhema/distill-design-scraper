# TODO Stories

Generated from `TODO.md` on 2026-10-04.
Last Updated: 2026-10-13

## Status

3 stories are done (TODO-2, TODO-4, TODO-5), 2 stories are pending (TODO-1, TODO-3). Issues #156 and #158 remain open on GitHub; spike #166 was completed for #156.

| Story | Issue | Pull request | Phase | Status | Acceptance criteria ticked |
| --- | --- | --- | --- | --- | --- |
| [TODO-1] Handle Inaccessible URLs, Bot-Blocks, and View-Obscuring Overlays Gracefully | #156 | none | Backlog | pending | 0 of 4 |
| [TODO-2] Set Cursor Pointer on Interactive UI Buttons | #157 | #162 | Backlog | done — issue closed, PR #162 merged | 3 of 3 |
| [TODO-3] Investigate Secure Local Distribution and Sharing Models (Docker / BYOK) | #158 | none | Backlog | pending | 0 of 3 |
| [TODO-4] Prevent Layout Shift and Button Width Changes on Tab Selection and State Changes | #159 | #165 | Backlog | done — issue closed, PR #165 merged | 3 of 3 |
| [TODO-5] Remove "Copy .md" Button from the Workbench Header | #160 | #161 | Backlog | done — issue closed, PR #161 merged | 4 of 4 |

Criteria checked on 2026-10-13 against the codebase at HEAD (`e1f25e7`) and GitHub issue/PR records. Ticked boxes indicate empirical verification in code and tests. Delivery records are in git history and PRs #161, #162, #163, #165, and `.agents/reports/overlay-mitigation-spike.md`.

### Open Items Without a Story

**Known issues**

None

**Specified in the source but not built**

- Overlay and bot mitigation implementation (spiked in #166; unbuilt in code for #156)
- Distribution and BYOK strategy (pending in #158)

**Open GitHub issues that no story names**

- #166 [TODO-1] Spike: bypass or detect view-obscuring overlays, cookie walls, and paywalls before capture

## Skipped

(None — all 5 items from `TODO.md` were structured into issues.)

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
