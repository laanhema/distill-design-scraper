# Plan: DIST-051 — Stop capturing a full-page screenshot that is immediately discarded

## Summary

`lib/ingest.ts` currently makes a second, expensive `page.screenshot({ fullPage: true })` call per render, stores the result as `fullPageShot` on both `capturePage`'s return type and `RenderResult`, and assigns it in two places — but nothing downstream ever reads it (`captureFromRender` in `lib/analyze.ts` never copies it into `Capture`, and no other file in `lib/`, `app/`, or `eval/` references it). This is a purely subtractive change confined to `lib/ingest.ts`: remove the screenshot call, the two type fields, and the two assignments, while keeping — and slightly expanding — the comment that explains why the manual tile-and-composite `panoramaShot` path exists instead of just reusing Playwright's native `fullPage` screenshot (tile-boundary duplication of `position: fixed`/sticky elements on tall pages). That comment currently references `fullPageShot` by name as the thing being warned about, so the wording needs a small rewrite once the field it points at no longer exists.

## User Story

As a maintainer
I want the render path to stop paying for a screenshot nothing consumes
So that tall-page analyses don't burn one of the pipeline's most expensive calls plus a base64 payload for no result

## Metadata

| Field | Value |
|-------|-------|
| Type | REFACTOR (dead-code removal) |
| Complexity | LOW |
| Systems Affected | `lib/ingest.ts` only |
| GitHub Issue | #99 |

---

## Patterns to Follow

### Optional/omitted-field convention (why this removal is safe, not just "unused")
```
// SOURCE: CLAUDE.md — "measured, never faked" invariant
// Every schema field for an unmeasured lane is optional and simply omitted
// rather than synthesized — capture fields follow the same "omit, don't
// fabricate" rule (see panoramaShot / scrollShots comments in lib/ingest.ts).
```
`fullPageShot` was never optional and never omitted-when-absent — it just had no reader anywhere. Removing it is strictly cleanup, not a behavior change to any consumer.

### Comment-preservation pattern (the thing being asked for)
```
// SOURCE: lib/ingest.ts:49-57 (current panoramaShot doc comment)
/** Single seamless full-page screenshot stitched from gapless viewport
 *  tiles captured toward the bottom, same session — feeds the area-weight
 *  pixel pass and the frontend gallery. Not Playwright's native `fullPage`
 *  screenshot (see `fullPageShot`): that internally scroll-and-stitches
 *  too, which is known to duplicate `position: fixed`/sticky elements at
 *  tile boundaries on tall pages — this manual tile-and-composite path
 *  avoids that. Omitted when the page fits in one viewport, or on capture
 *  failure. */
panoramaShot?: string;
```
The `(see \`fullPageShot\`)` cross-reference must be rewritten since the field is going away — the *warning* (native `fullPage` duplicates fixed/sticky elements at tile boundaries) is what has to survive, not the specific field name.

### Inline comment at the call site being deleted (also carries information worth preserving)
```
// SOURCE: lib/ingest.ts:303-309 (current)
const viewportShotBuf = await page.screenshot({ fullPage: false });
// Captured but intentionally NOT threaded into Capture — Playwright's native
// `fullPage` screenshot internally scroll-and-stitches too, which is known to
// duplicate `position: fixed`/sticky elements at tile boundaries on tall
// pages. The manual tile-and-composite path in `captureFullPageTiles` is the
// panorama source; this stays as a dead-code fallback so a future reader
// doesn't "simplify" by swapping it in.
const fullPageShotBuf = await page.screenshot({ fullPage: true });
```
This comment's substance (native `fullPage` duplicates fixed/sticky at tile boundaries) is the same warning as the one on `panoramaShot` above — folding it into the retained `panoramaShot` doc comment (expanded) avoids losing the knowledge while deleting the code it was attached to.

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/ingest.ts` | UPDATE | Remove the unused `fullPageShot` capture end-to-end; expand the retained comment to keep the "why not native `fullPage`" warning alive |

---

## Tasks

### Task 1: Remove `fullPageShot` from the `RenderResult` interface

- **File**: `lib/ingest.ts`
- **Action**: UPDATE
- **Implement**: Delete the field and its doc comment at line 25-26:
  ```
  /** Full scrollable page screenshot, PNG bytes as base64. */
  fullPageShot: string;
  ```
  from the `RenderResult` interface (currently lines 18-58).
- **Mirror**: N/A — pure deletion.
- **Validate**: `npm run typecheck` (will still fail until Tasks 2-5 land; run once after all edits).

### Task 2: Expand and rewrite the `panoramaShot` doc comment

- **File**: `lib/ingest.ts`
- **Action**: UPDATE
- **Implement**: In the same `RenderResult` interface, rewrite the `panoramaShot` doc comment (lines 49-57) so it no longer cross-references the now-deleted `fullPageShot` field by name, while preserving and slightly expanding the substance of the warning — that Playwright's native `fullPage` screenshot internally scroll-and-stitches and is known to duplicate `position: fixed`/sticky elements at tile boundaries on tall pages, which is *why* this manual tile-and-composite path exists instead. Fold in the now-orphaned knowledge from the deleted call-site comment (Task 4) that this was previously kept as a literal dead-code fallback and has now been removed for that reason — e.g.:
  ```ts
  /** Single seamless full-page screenshot stitched from gapless viewport
   *  tiles captured toward the bottom, same session — feeds the area-weight
   *  pixel pass and the frontend gallery. Deliberately NOT Playwright's
   *  native `page.screenshot({ fullPage: true })`: that internally
   *  scroll-and-stitches too, but is known to duplicate `position: fixed`/
   *  sticky elements at tile boundaries on tall pages — this manual
   *  tile-and-composite path avoids that. (An earlier revision of this file
   *  also captured the native `fullPage` shot as a literal fallback; it was
   *  removed because nothing ever read it — see DIST-051 — but the
   *  duplication problem it would have reintroduced is still real, so don't
   *  bring it back as a "simplification.") Omitted when the page fits in one
   *  viewport, or on capture failure. */
  panoramaShot?: string;
  ```
  Exact wording is at the implementer's discretion; the requirement is that the warning (native `fullPage` duplicates fixed/sticky elements at tile boundaries → why `panoramaShot` exists) is fully self-contained without referring to a field that no longer exists.
- **Mirror**: `lib/ingest.ts:190-202` — the `captureFullPageTiles` function doc comment, for the house style of dense, warning-first doc comments in this file.
- **Validate**: Re-read the edited block; confirm no remaining reference to `fullPageShot` as a symbol name in comments.

### Task 3: Remove `fullPageShot` from `capturePage`'s return type and destructive removal of the second screenshot call

- **File**: `lib/ingest.ts`
- **Action**: UPDATE
- **Implement**:
  - In `capturePage`'s return type annotation (currently lines 281-291), delete `fullPageShot: string;` (line 283).
  - In the function body, delete the entire call-site comment + call (currently lines 303-309):
    ```ts
    // Captured but intentionally NOT threaded into Capture — ...
    const fullPageShotBuf = await page.screenshot({ fullPage: true });
    ```
    leaving `viewportShotBuf` capture (line 302) followed directly by `const styleDump = await collectStyleDump(page);` (line 310).
  - In the function's return object (currently lines 326-336), delete the `fullPageShot: fullPageShotBuf.toString("base64"),` line (line 328).
- **Mirror**: The existing `viewportShot` handling in the same return object — same style, one line, no conditional spread (unlike the optional fields, `fullPageShot` was never optional, so no `...(x ? {...} : {})` guard to remove either).
- **Validate**: `npm run typecheck` after this task and Tasks 1, 2, 4.

### Task 4: Remove `fullPageShot` from the `RenderResult` object literal in `renderUrl`

- **File**: `lib/ingest.ts`
- **Action**: UPDATE
- **Implement**: In `renderUrl`'s final `result` construction (currently lines 452-466), delete the line `fullPageShot: captured.fullPageShot,` (line 456).
- **Mirror**: Same object literal, same style as the other `captured.*` passthrough assignments immediately above/below it.
- **Validate**: `npm run typecheck`.

### Task 5: Full-file consistency check

- **File**: `lib/ingest.ts`
- **Action**: UPDATE (verification pass, not necessarily new edits)
- **Implement**: `grep -n "fullPageShot" lib/ingest.ts` should return zero matches. Re-read the whole file top to bottom to confirm: (a) no orphaned blank lines or dangling comments where the deleted lines were, (b) the `capturePage` function still reads cleanly (viewport shot → style dump → harvest → responsive → dark → panorama, in that order, unchanged), (c) the expanded `panoramaShot` comment from Task 2 reads coherently on its own.
- **Mirror**: N/A.
- **Validate**: `grep -n "fullPageShot" lib/ingest.ts` (expect no output), `npm run typecheck`, `npm run lint`.

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Eval harness — must pass unchanged; no baseline refresh expected since
# committed eval/corpus/*/capture.json fixtures never had fullPageShot
# (it never reached Capture) — see CLAUDE.md "eval harness" section.
npm run eval
```

Do **not** run `UPDATE_BASELINE=1 npm run eval` for this change — the issue and its technical-notes comment both state explicitly that no fixture churn or baseline movement is expected. If `npm run eval` fails or scores differ, that's a signal something else was touched by mistake, not a cue to refresh the baseline.

## End-to-End Verification

Because this is a pure removal with no behavior change to anything that reaches `Capture` or the API response, there's no new capability to exercise — the verification is that nothing regresses and the render gets (measurably) cheaper on tall pages:

1. Confirm statically: `grep -rn "fullPageShot" lib/ app/ eval/` returns no matches anywhere in the repo (not just `lib/ingest.ts`).
2. Run the existing scratch-script pattern from CLAUDE.md's "Manually verifying extraction changes": spin up a local `http.createServer` serving a tall synthetic HTML page (e.g. several thousand px of content so `capturePage`'s panorama path actually tiles), then call `renderUrl` (with `SSRF_ALLOWLIST_HOSTS=localhost` or drive Playwright directly per `eval/capture.ts`'s pattern) against it before and after the change.
   - Before: note `elapsedMs` and confirm `fullPageShot` exists on the result and is a non-trivial base64 string.
   - After: confirm the returned object has no `fullPageShot` key at all (`"fullPageShot" in result === false`), that `panoramaShot` and `scrollShots` are present and unchanged in shape/content versus the "before" run, and that `elapsedMs` is lower (one fewer full-page scroll-and-stitch screenshot per render — the exact delta will vary by page height, but it should be directionally and measurably down, not just noise).
   - Delete the scratch script after use per the CLAUDE.md convention.
3. Run `npm run eval` and confirm the combined score is byte-identical to the pre-change baseline (no site's score moves), consistent with the "no fixture churn" expectation.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Some other file reaches into `RenderResult`/`capturePage`'s return type structurally (e.g. via a wide object spread) without naming `fullPageShot` directly, so the removal breaks it silently at runtime instead of at typecheck. | Ruled out by the `grep -rn "fullPageShot\|CapturedPage"` sweep already run across `.ts`/`.tsx` outside `node_modules`: only the 6 in-file occurrences in `lib/ingest.ts` exist (lines 26, 52, 283, 309, 328, 456; note there is no separately-named `CapturedPage` interface in the codebase — the issue's phrasing refers to `capturePage`'s inline return type). `npm run typecheck` is also a hard gate that would catch any structural consumer that destructures the field by name. In scope: rely on grep + typecheck; out of scope: guarding against non-TypeScript consumers, of which none exist in this repo. |
| The rewritten `panoramaShot` comment loses precision or drops the warning while eliminating the `fullPageShot` cross-reference, silently degrading the exact hazard this issue is trying to preserve institutional memory of. | Task 2 is explicit that the *substance* (native `fullPage` duplicates `position: fixed`/sticky elements at tile boundaries on tall pages) must be fully self-contained in the new comment text, not just "field removed, comment trimmed." Review the diff for this specifically before considering the task done — this is the one part of the issue that isn't purely mechanical. In scope: get this right as part of the PR; not a follow-up. |
| Removing the second `page.screenshot({ fullPage: true })` call changes scroll position, page state, or timing in a way that affects the subsequent `collectStyleDump`/`harvestDomTree`/responsive/dark/panorama passes (e.g. because the fullPage screenshot had a side effect of settling lazy-loaded content via its internal scroll-and-stitch). | `capturePage` already explicitly nudges lazy content itself (`window.scrollTo(0, document.body.scrollHeight)` → wait → `window.scrollTo(0, 0)` → wait, lines 296-300) *before* either screenshot call, and `captureFullPageTiles` (called later) does its own explicit scrolling for the panorama. The fullPage screenshot's internal scroll is Playwright/Chromium-internal, not exposed to app state, and nothing between the deleted call and the following `collectStyleDump` call depended on it. Verified by reading the full `capturePage` body; the end-to-end scratch-script check (Verification step 2) is the empirical backstop — if scroll-dependent output changed, `panoramaShot`/`scrollShots` byte-for-byte comparison in that check would catch it. In scope for verification; not expected to actually surface an issue. |
| Eval harness is somehow sensitive to `elapsedMs` or capture shape in a way not documented in CLAUDE.md. | CLAUDE.md states plainly that committed `eval/corpus/*/capture.json` fixtures never had `fullPageShot` and the eval harness replays captures entirely offline (no live render, so `elapsedMs`/timing is not eval-scored at all). Confirmed no fixture changes needed; `npm run eval` should pass byte-identical to baseline. Out of scope to investigate further absent an actual failure. |

---

## Acceptance Criteria

- [ ] `page.screenshot({ fullPage: true })` no longer appears anywhere in `lib/ingest.ts`.
- [ ] `fullPageShot` is removed from `RenderResult`, from `capturePage`'s return type, and from both places it was assigned (`capturePage`'s return object, `renderUrl`'s `result` object).
- [ ] The comment explaining why `panoramaShot` isn't Playwright's native `fullPage` screenshot still exists in `lib/ingest.ts`, no longer cross-references the deleted `fullPageShot` field by name, and fully carries the tile-boundary-duplication warning on its own.
- [ ] `grep -rn "fullPageShot" lib/ app/ eval/` returns no matches.
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run eval` passes with `eval/baseline.json` untouched (no `UPDATE_BASELINE=1` run).
- [ ] End-to-end scratch verification (tall synthetic page, before/after) shows `elapsedMs` improves and `panoramaShot`/`scrollShots` are unchanged in shape/content.
