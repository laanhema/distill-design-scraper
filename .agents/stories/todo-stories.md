# TODO Stories

Generated from `TODO.md` on 2026-10-04.

## Skipped

(None — all 5 items from `TODO.md` were structured into issues.)

---

## [TODO-1] Handle Inaccessible URLs, Bot-Blocks, and View-Obscuring Overlays Gracefully

**GitHub**: #156
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
- [ ] If navigation fails or times out, the API returns a structured error message indicating the site is inaccessible rather than crashing or hanging.
- [ ] Common modal popups, paywalls, and overlay backdrops (e.g., newsletter dialogs, cookie walls) that obstruct view are detected and dismissed or mitigated prior to viewport screenshotting.
- [ ] The frontend displays the specific accessibility/block error state clearly to the user.

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

- [ ] All clickable buttons across the UI (mode toggles, submit buttons, remove image buttons, tabs, download buttons) show a pointer cursor on hover.
- [ ] Disabled buttons show appropriate non-interactive cursor (e.g., `cursor: not-allowed` or default) instead of pointer.
- [ ] Can be implemented cleanly via global CSS (`app/globals.css`) or Tailwind utilities.

### Technical Notes

- Add `button:not(:disabled), [role="button"]:not([aria-disabled="true"]) { cursor: pointer; }` to `app/globals.css`, or add `cursor-pointer` to button components in `app/page.tsx`.
- Check disabled states (`disabled:cursor-not-allowed`).

### Dependencies

- Blocked by: None
- Blocks: None

---

## [TODO-3] Investigate Secure Local Distribution and Sharing Models (Docker / BYOK)

**GitHub**: #158
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
- [ ] Determine how Playwright Chromium requirements impact non-technical users in local distribution.
- [ ] Define concrete recommendations and file follow-up implementation issues for the chosen distribution strategy.

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

- [ ] Action buttons in the results header maintain stable widths when switching between "Design System Preview", "Design System Markdown", and "Layout Structure Markdown" tabs.
- [ ] Buttons do not unexpectedly resize or cause neighboring elements to jitter during tab switching or state toggling.
- [ ] Layout remains visually aligned and responsive across desktop and smaller viewports.

### Technical Notes

- In `app/page.tsx`, examine the workbench action buttons inside the tab bar (`ml-auto flex gap-2`).
- Either simplify button labels to static concise text (e.g. "Download .md", "Download Markdown", or paired with TODO-5 / #160) or assign consistent min-width / flex constraints to prevent width jumps.

### Dependencies

- Blocked by: None
- Blocks: None

---

## [TODO-5] Remove "Copy .md" Button from the Workbench Header

**GitHub**: #160
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

- [ ] The "Copy ... .md" button is removed from `app/page.tsx`.
- [ ] The `copyActiveMarkdown` function and `copied` state are cleaned up if no longer used elsewhere.
- [ ] The workbench action bar cleanly displays only the "Download ... .md" and "Download Tailwind @theme" buttons.
- [ ] Typecheck and lint pass with no unused variables or broken references.

### Technical Notes

- Remove `copyActiveMarkdown` and `copied` state from `app/page.tsx` (around lines 86, 167-173, and 372-381).
- Also eliminates one of the button width shift triggers from TODO-4 (#159).

### Dependencies

- Blocked by: None
- Blocks: None
