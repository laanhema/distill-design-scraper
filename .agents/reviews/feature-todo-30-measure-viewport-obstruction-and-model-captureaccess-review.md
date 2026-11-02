# Code Review: feature/todo-30-measure-viewport-obstruction-and-model-captureaccess

**Scope**: branch `feature/todo-30-measure-viewport-obstruction-and-model-captureaccess` against merge base `993d229` (uncommitted changes only; no commits on branch), checked against issue #226
**Recommendation**: APPROVE WITH NITS

## Summary

Reviewed the uncommitted changes across `lib/schema.ts`, `lib/api.ts`, `lib/ingest.ts`, `lib/analyze.ts`, and `lib/emit.ts`; the untracked plan, patch, and implementation report under `.agents/` were read as context. The pre-existing uncommitted modifications in `.agents/issues/todo-issues.md` are unrelated and were excluded from this review as instructed. The implementation faithfully fulfills the specifications established in spike report `.agents/reports/overlay-mitigation-spike.md` (§4 and §6) and meets every acceptance criterion of issue #226.

Acceptance criteria:
- **`CaptureAccess` and its related types (`Mitigation`, `Obstruction`) are defined as a discriminated union in `lib/schema.ts` and threaded into `CaptureArtifacts`, `RenderResult`, `Capture`, and metadata in `lib/analyze.ts`**: met. `mitigationSchema` (discriminating on `kind`) and `captureAccessSchema` (discriminating on `state`: `clear`, `obstructed`, `blocked`) model capture access state strictly and prevent illegal representations. Types are threaded into `CaptureArtifacts` (`lib/ingest.ts:62`), `RenderResult`, `Capture` (`lib/analyze.ts:33`), `extractFromCapture` (`lib/analyze.ts:83`), `analyzeUrl` meta (`lib/analyze.ts:425`), and `AnalyzeMeta` (`lib/api.ts:24`).
- **`measureObstruction` in `lib/ingest.ts` measures viewport coverage via a 24×15 grid sample with `elementFromPoint`, checking topmost fixed layers, scroll locks on `html`/`body`, and visible dialogs/modals**: met. Samples 360 points across the viewport in page context, traverses shadow roots, detects scroll locks via `overflow`/`overflowY: hidden` on `html` and `body`, identifies outermost `position: fixed` ancestors, and returns `{ coverage, scrollLocked, culprit, at }` or `null` when clean (`lib/ingest.ts:267-431`).
- **Top-anchored banners shorter than 20% of viewport height count as headers, and landmark elements (`header`, `nav`, `[role=banner]`, `[role=navigation]`) are excluded from obstruction coverage**: met. `isLandmark` checks for matches, ancestors, or descendants of landmark elements (`lib/ingest.ts:290-297`). Fixed ancestors with `rect.top <= 1 && rect.left <= 5 && rect.width >= vw * 0.5 && rect.height < 0.20 * vh` are treated as headers and excluded (`lib/ingest.ts:389-395`).
- **Visible `[aria-modal]` or `dialog` elements count as obstructing only if a hit test at their center confirms they are visible**: met. `modalCandidates` are checked for connectivity, rendered styles (`display`, `visibility`, `opacity`, `pointerEvents`), positive dimensions, and an `elementFromPoint(cx, cy)` hit at the element's center coordinate (`lib/ingest.ts:312-343`).
- **`renderMarkdown` in `lib/emit.ts` includes capture access condition notes in frontmatter and body when mitigations or obstructions are present**: met. `buildReport` populates `capture: { access }` only when conditions exist (`obstructed`, `blocked`, or mitigations present), serialized to YAML frontmatter by `yamlDump`. `renderBody` renders the summary note under the main title (`lib/emit.ts:44-57, 83-122, 132-135`).
- **Existing eval corpus captures replay unchanged without requiring `access` (additive by construction)**: met. `access` is optional across all contracts. Replaying offline eval with `npm run eval` succeeds with 100% aggregate across all five committed corpus captures.
- **`npm run check` passes**: met. Full CI gate (`tsc --noEmit`, `eslint .`, `next build`, `tsx eval/run.ts`) passes with 0 errors.

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions (Low)

- **L1** `lib/emit.ts:90-94` — When a page is obstructed solely by a scroll lock with no fixed overlay elements (`coverage: 0` and `scrollLocked: true`), `renderAccessNote` outputs `"Captured with 0% viewport obstruction; scroll locked"`. **Why:** While accurate in measuring zero coverage from fixed layers, stating "0% viewport obstruction" alongside "Captured with..." can read awkwardly to users when no overlay elements are present. **Fix:** When `obs.coverage === 0 && obs.scrollLocked`, omit the `"0% viewport obstruction; "` prefix so the note reads `"Captured with scroll locked"`.

**Noted, not a finding**:
- Multi-tile re-checks during panorama scrolling and active overlay dismissal/cookie blocking (Ghostery adblocker and autoconsent) are explicitly scoped out of TODO-30 and scheduled for follow-up issues TODO-31 (#227) and TODO-32 (#228).
- `bannerDismissed: false` is retained on `CaptureArtifacts` and `RenderResult` for backwards compatibility until TODO-31 replaces the legacy banner dismissal flow.

## Validation Results

| Check | Status | Notes |
|-------|--------|-------|
| Build / Type Check | PASS | `npm run check` (steps `tsc --noEmit` and `next build`): `✓ Compiled successfully in 2.7s`; host, Node 22.23.1 |
| Warnings | NONE | Zero warnings in `tsc`, `eslint`, or `next build` output |
| Lint | PASS | `npm run check` (step `eslint .`): passed on host with no errors |
| Tests | PASS | `npm run check` (step `tsx eval/run.ts`): 5/5 sites passed at 100% aggregate combined score; live measurement verified in headless Chromium with synthetic probe covering clean page, fixed header exclusion, bottom cookie banner, scroll lock, and open dialog |
| UI verification | N/A | Backend measurement and report formatting change; no client markup, styles, or page components altered |

## What's Good

- `captureAccessSchema` and `mitigationSchema` use Zod discriminated unions cleanly, making illegal states (such as a blocked state carrying measured obstructions) unrepresentable.
- The 24×15 grid sampling in `measureObstruction` correctly traverses shadow roots via `shadowRoot.elementFromPoint`, ensuring web-component overlays (common in consent managers) are properly hit-tested.
- Exclusion of landmark elements and top-anchored short headers prevents false positives on sticky navigation bars.
- Center hit-testing for modal candidates prevents phantom obstructions from hidden or off-screen dialogs.
- Defensive initialization of `globalThis.__name` inside `page.evaluate` protects against runtime reference errors when transpiled by tooling like `tsx`.
- Offline eval replays 100% unchanged, proving zero regression on existing captures.

## Recommendation

Merge after optionally addressing L1 (`/fix-findings .agents/reviews/feature-todo-30-measure-viewport-obstruction-and-model-captureaccess-review.md L1`).
