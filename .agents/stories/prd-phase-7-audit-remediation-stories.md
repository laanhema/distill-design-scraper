# Stories — PRD §12 Phase 7: Codebase Health Audit Remediation

**Source:** `.agents/PRDs/PRD.md` §12 Phase 7 (2026-07-29 full-codebase sweep), plus the §4 "In Scope — Technical" unchecked regression line.
**Generated:** 2026-07-29
**Repository:** `laanhema/distill-design-scraper`
**Baseline commit:** `67c00f0`
**Story ID range:** DIST-048 → DIST-061 (continues from DIST-047 / issue #94)
**Last Updated:** 2026-10-14

Every finding below was re-verified against the code at `67c00f0` before a story was written for it.

## Status

All 14 stories are done: each issue (#96–#109) is closed as completed and each pull request (#110–#123) is merged into `main`. No issue or pull request of this file is still open.

| Story | Issue | Pull request | Phase | Status | Acceptance criteria ticked |
| --- | --- | --- | --- | --- | --- |
| DIST-048 CSSOM state scanner dedup | #96 | #110 | 7 | done | 5 of 5 |
| DIST-049 Unraceable SSRF redirect check | #97 | #111 | 7 | done | 5 of 6 |
| DIST-050 structureUnavailableReason on no-key | #98 | #112 | 7 | done | 5 of 5 |
| DIST-051 Drop unused full-page screenshot | #99 | #113 | 7 | done | 5 of 5 |
| DIST-052 Remove dead analyzeUrlStructure | #100 | #114 | 7 | done | 3 of 3 |
| DIST-053 Deduplicate download plumbing | #101 | #115 | 7 | done | 6 of 6 |
| DIST-054 Rename populateMissingComponentDefs | #102 | #116 | 7 | done | 4 of 4 |
| DIST-055 Drop redundant @types/js-yaml | #103 | #117 | 7 | done | 5 of 5 |
| DIST-056 OpenRouter ModelCall parity | #104 | #118 | 7 | done | 5 of 7 |
| DIST-057 Setup hint names OPENROUTER_API_KEY | #105 | #119 | 7 | done | 2 of 4 |
| DIST-058 Add npm run build to CI | #106 | #120 | 7 | done | 5 of 5 |
| DIST-059 Remove stale Anthropic comment | #107 | #121 | 7 | done | 3 of 3 |
| DIST-060 Eval fail on missing corpus capture | #108 | #122 | 7 | done | 4 of 5 |
| DIST-061 Carry viewport through Capture | #109 | #123 | 7 | done | 6 of 6 |

The criteria were checked on 2026-10-14 against the code at `4291324`, with offline `npm run typecheck`, `npm run lint` and `npm run eval` runs (all passed) and the CI run on `4291324` (passed); the product was not run. A criterion that only a run can show (a live render, a timing, a fresh install) rests on the validation section of the story's implementation report in `.agents/reports/`, where the code still holds the behaviour. Four unticked criteria (two each in DIST-056 and DIST-057) name the native Gemini path, which #199 removed on purpose. A ticked box means the code satisfies the criterion now, an unticked box carries a note with what differs, and an As Built section records where the result differs from the text or where it lives. Plans are in `.agents/plans/completed/`, reviews in `.agents/reviews/`.

### Open Items Without a Story

**Open GitHub issues that no story names**

- #156 [TODO-1] Handle inaccessible URLs, bot-blocks, and view-obscuring overlays gracefully
- #158 [TODO-3] Investigate secure local distribution and sharing models (Docker / BYOK)
- #166 [TODO-1] Spike: bypass or detect view-obscuring overlays, cookie walls, and paywalls before capture

---

## Created GitHub issues

| Issue | Story | Title | Labels | Priority |
|---|---|---|---|---|
| [#96](https://github.com/laanhema/distill-design-scraper/issues/96) | DIST-048 | Deduplicate the two CSSOM state scanners and fix the cross-origin property-name mismatch | `bug` `extraction` `states` | High |
| [#97](https://github.com/laanhema/distill-design-scraper/issues/97) | DIST-049 | Make the SSRF redirect check unraceable — and correct the claim about what it prevents | `bug` `security` `ingestion` | High |
| [#98](https://github.com/laanhema/distill-design-scraper/issues/98) | DIST-050 | Set `structureUnavailableReason` when the AI lane has no API key | `bug` `api` `frontend` | High |
| [#99](https://github.com/laanhema/distill-design-scraper/issues/99) | DIST-051 | Stop capturing a full-page screenshot that is immediately discarded | `technical` `ingestion` `performance` | Medium |
| [#100](https://github.com/laanhema/distill-design-scraper/issues/100) | DIST-052 | Remove the dead `analyzeUrlStructure` export | `technical` `cleanup` | Low |
| [#101](https://github.com/laanhema/distill-design-scraper/issues/101) | DIST-053 | Extract the duplicated download plumbing in the workbench | `technical` `frontend` `cleanup` | Low |
| [#102](https://github.com/laanhema/distill-design-scraper/issues/102) | DIST-054 | Rename `populateMissingComponentDefs` to describe what it actually does | `technical` `structure-lane` `cleanup` | Low |
| [#103](https://github.com/laanhema/distill-design-scraper/issues/103) | DIST-055 | Drop the redundant, version-mismatched `@types/js-yaml` | `technical` `tooling` `cleanup` | Low |
| [#104](https://github.com/laanhema/distill-design-scraper/issues/104) | DIST-056 | Honor the full `ModelCall` contract on the OpenRouter path — or declare it explicitly degraded | `bug` `ai-lane` | High |
| [#105](https://github.com/laanhema/distill-design-scraper/issues/105) | DIST-057 | Setup hint must name `OPENROUTER_API_KEY`, not just `GEMINI_API_KEY` | `enhancement` `frontend` | Medium |
| [#106](https://github.com/laanhema/distill-design-scraper/issues/106) | DIST-058 | Add `npm run build` to CI | `technical` `ci` `tooling` | Medium |
| [#107](https://github.com/laanhema/distill-design-scraper/issues/107) | DIST-059 | Remove the stale `Anthropic` reference in the structure pipeline | `technical` `documentation` `cleanup` | Low |
| [#108](https://github.com/laanhema/distill-design-scraper/issues/108) | DIST-060 | Make a missing eval corpus capture fail rather than skip | `technical` `eval` `tooling` | Medium |
| [#109](https://github.com/laanhema/distill-design-scraper/issues/109) | DIST-061 | Carry the render viewport through `Capture` into the structure lane | `technical` `structure-lane` `schema` | Low |

**Repository:** `laanhema/distill-design-scraper` · **Milestone:** none (consistent with DIST-001 → DIST-047)
Each issue body carries the description, context, acceptance criteria, and dependencies; Technical Notes were added as the first comment on each. Phase ordering follows the PRD's own P0 → P1 → P2 → P3 priority grouping rather than implementation phases.

---

## Already closed — no story created

Two PRD Phase-7 items are **already fixed on `main`** and were verified as such during this sweep. They need a PRD checkbox update, not a story:

| Finding | PRD claim | Verified state at `67c00f0` |
|---|---|---|
| **P0-1** — AI lane silently deletes the motion lane | `enrichWithAI` re-lists fields and omits `motion` | **Fixed.** `lib/analyze.ts:160-165` now spreads `...measured.report` into `buildReport`, with an in-code comment naming the exact drift this prevents. No lane can be dropped by enumeration any more. |
| **P2-2** — `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` undocumented | Absent from `README.md` and the §9 config table | **Fixed.** `README.md:69` (provider list), `:90-91` (`.env.local` sample), `:156` (Docker run example); PRD §9 table already carries both rows. |

Recommend ticking `[x]` on P0-1 and P2-2 in the PRD and adding a one-line "closed by" note, so the audit record matches the tree.

Also note: **P0-2 does not get its own story.** The PRD explicitly directs *"Fix as part of P1-1, not in place"* — patching the constant without deduplicating the scanners invites a third divergence. P0-2 and P1-1 are therefore delivered together as **DIST-048**.

---

## Ordering & dependency graph

```
P0  DIST-048  cross-origin scanner dedup + property-name fix   (P0-2 + P1-1)
    DIST-049  SSRF redirect race + honest claim                (P0-3)
    DIST-050  structureUnavailableReason on the keyless path   (P0-4)

P1  DIST-051  drop the discarded full-page screenshot          (P1-2)
    DIST-052  remove dead export analyzeUrlStructure           (P1-3)
    DIST-053  deduplicate the two download handlers            (P1-4)
    DIST-054  rename populateMissingComponentDefs              (P1-5)
    DIST-055  drop redundant @types/js-yaml                    (P1-6)

P2  DIST-056  honor the full ModelCall contract on OpenRouter  (P2-1, §4 regression)
    DIST-057  setup hint must name OPENROUTER_API_KEY too      (P2-3)   ← after DIST-056
    DIST-058  add `npm run build` to CI                        (P2-4)
    DIST-059  remove the stale `Anthropic` comment             (P2-5)

P3  DIST-060  make a missing corpus capture fail, not skip     (P3-1)
    DIST-061  carry viewport through Capture                   (P3-2)
```

No circular dependencies. Only one real edge: DIST-057 (UI copy about which keys enable the lane) reads better after DIST-056 settles whether OpenRouter is equal or explicitly degraded. Everything else is independently mergeable.

---

## [DIST-048] Deduplicate the two CSSOM state scanners and fix the cross-origin property-name mismatch

**Type**: Bug
**GitHub Label**: bug
**Priority**: High
**Complexity**: Medium
**Phase**: 7 — P0 correctness
**Labels**: `backend`, `extraction`
**Traces to**: PRD §12 Phase 7 / P0-2 + P1-1; §7 States row; §11 "A shipped lane measures what it claims"; §14 "Duplicated logic drifts into divergent behavior"
**Status**: done — issue closed, PR #110 merged

### Description

As a **design engineer**, I want hover/focus deltas from cross-origin stylesheets to capture background, border, and shadow — not just text color — so that the Phase-6 cross-origin state lane reports what it claims to measure.

### Context (verified at `67c00f0`)

`lib/extract/styleDump.ts` contains two near-identical copies of `STATE_PROPS`, `resolveVarRefs`, `applyRule`, and `scanRules` — the same-origin pass at lines 415-538 and the cross-origin re-fetch pass at 570-688. They have already diverged:

- Same-origin `STATE_PROPS` (line 415) maps to **kebab-case** computed names: `"border-color": "border-top-color"`. Correct.
- Cross-origin `STATE_PROPS` (line 570) maps to **camelCase**: `"background-color": "backgroundColor"`, `"border-color": "borderColor"`, `"box-shadow": "boxShadow"`.

The cross-origin pass reads those via `cs.getPropertyValue(computedProp)` (line 640), which only accepts kebab-case and returns `""` for a camelCase key. `from` is therefore always empty, the `if (!from || from === to) continue` guard fires, and 3 of 4 properties are always discarded. Only `color` survives, because its spelling is identical in both conventions. `resolveVarRefs` has also drifted independently (3 resolution passes vs 5).

### Acceptance Criteria

- [x] Given a cross-origin stylesheet declaring a `:hover` rule that changes `background-color`, when `styleDump` runs against the page, then the resulting `NodeStyle.states.hover` records a `background` delta (not just `color`).
- [x] Given the same rule changing `border-color` and `box-shadow`, when the dump runs, then both deltas are recorded.
- [x] Given the fix is applied, when the file is inspected, then `STATE_PROPS`, `resolveVarRefs`, `applyRule`, and `scanRules` exist as **one** parameterized definition shared by both passes — not two maintained copies.
- [x] Given the same-origin path, when the dump runs against a committed eval capture, then behavior is byte-identical to before (`npm run eval` passes with `eval/baseline.json` untouched).
- [x] Given `npm run typecheck` and `npm run lint`, when run after the change, then both pass clean.

### Technical Notes

- **The `page.evaluate` constraint is the hard part.** The main-pass callback is self-contained by design — no imports inside it (`CLAUDE.md`, "Design-tokens lane" §1). The cross-origin pass is a *separate* `page.evaluate` invocation (line ~570) with its own serialized closure, which is exactly why the copy exists. Options, in preference order:
  1. Define the shared scanner once as a plain function **string/factory** in module scope and pass it into both `page.evaluate` calls as a serializable argument, reconstructing it in-page — one source, two injections.
  2. Merge the two evaluates into one callback that takes the re-fetched `cssText` blobs as an argument, so there is literally one in-page scanner.
  Option 2 is cleaner if the re-fetch sequencing allows it; option 1 is the smaller diff.
- The merge must stay **merge-only** — the cross-origin pass may never overwrite a value the in-page pass already measured (`CLAUDE.md`, styleDump second pass). Preserve that when unifying.
- Take the *same-origin* `resolveVarRefs` (5-pass or 3-pass — pick the more thorough) as the single survivor and note the choice in the commit message.
- **Verification requires a live render** — no committed capture exercises cross-origin stylesheets, by construction. Follow `CLAUDE.md` "Manually verifying extraction changes": stand up **two** local `http.createServer` instances on different ports (page on A, stylesheet on B, so the sheet is genuinely cross-origin), then `renderUrl` + `captureFromRender` + `extractFromCapture` with `SSRF_ALLOWLIST_HOSTS=localhost`. Run via `npx tsx` **from the project root**. Delete the scratch script afterwards.
- Files: `lib/extract/styleDump.ts` (only).

### As Built

- `STATE_PROPS`, `resolveVarRefs`, `applyRule` and `scanRules` are defined once in `lib/extract/styleDump.ts` and used by both the in-page pass and the cross-origin pass.
- The four-property capture on a two-origin page rests on the live run recorded in `.agents/reports/dist-048-dedupe-cssom-state-scanners-report.md`; `verify.sh drive cross-origin` (#196) now re-checks the hover `background-color` and focus `border-color` changes on demand.

### Dependencies

- Blocked by: none
- Blocks: none

---

## [DIST-049] Make the SSRF redirect check unraceable — and correct the claim about what it prevents

**Type**: Bug
**GitHub Label**: bug
**Priority**: High
**Complexity**: Medium
**Phase**: 7 — P0 correctness
**Labels**: `backend`, `security`
**Traces to**: PRD §12 Phase 7 / P0-3; §9 redirect-interception bullet; §14 "A shipped security control is documented as stronger than it is"
**Status**: done — issue closed, PR #111 merged. 1 criterion is only partly verified.

### Description

As a **maintainer deploying Distill publicly**, I want the redirect SSRF check to complete before navigation resolves, and I want its documented guarantee to match what it actually does, so that I don't under-provision network-level egress filtering because an in-process guard reads as sufficient.

### Context (verified at `67c00f0`)

`lib/ingest.ts:364-379` registers `page.on("response", async (response) => { … await assertSafeUrl(targetUrl) … })`. Playwright does **not** await async event listeners, so the handler's DNS lookup races `page.goto()` resolving. The post-`goto` `if (redirectSsrfError) throw` checks (lines ~386, ~390) can both run before the lookup finishes.

The DIST-044 synthetic test passes only because it redirects to a **literal IP** (`169.254.169.254`), which "resolves" instantly and so always beats the race. A redirect to a *hostname* that resolves privately is the untested — and likely failing — case.

Separately and independently of the race: by the time a 30x `response` event fires, **Chromium has already issued the request to the redirect target**. The control gates the *result* reaching the client, not the outbound request. The DIST-044 report's "navigation is aborted immediately … before loading response bodies" overstates both properties.

### Acceptance Criteria

- [x] Given a page that 30x-redirects to a **hostname** resolving to a private/loopback address, when `renderUrl` is called, then it reliably throws `UnsafeUrlError` — across at least 10 consecutive runs, with no flakes.
- [x] Given the same scenario, when the throw happens, then no partially-captured `RenderResult` is returned and the browser context is closed.
- [ ] Given a normal public redirect chain (e.g. `http://→https://`, apex→www), when `renderUrl` is called, then navigation completes as before with no added latency regression beyond the DNS lookups already performed.
  - *Partly verified:* the recorded run covered one allowlisted `localhost` → `localhost` 302, which completed; no public `http://`→`https://` or apex→www chain was run and no latency was measured.
- [x] Given `lib/ingest.ts` after the change, when the redirect control's in-code comment and `README.md` "Deploying Publicly — Hardening Guide" are read, then they state plainly that (a) the request to the target is still issued by Chromium and (b) network-level egress filtering is the load-bearing boundary.
- [x] Given `.agents/plans/completed/` or the DIST-044 record, when it is amended, then the "aborted immediately … before loading response bodies" claim is corrected rather than left standing.
- [x] Given `npm run typecheck`, `npm run lint`, and `npm run eval`, when run, then all pass with `eval/baseline.json` untouched (this path is outside the measured lane — any score movement means the change leaked).

### Technical Notes

- Two candidate mechanisms, per the PRD's own fix note:
  1. **`page.route()` / `context.route()` interception** — validate the target *before* Chromium issues the request, and `route.abort()` on failure. This is the only option that closes the "request already sent" gap rather than just the race, so prefer it if the routing overhead is acceptable.
  2. **Await the pending validation on the navigation path** — collect each listener's promise into a set and `await Promise.allSettled(pending)` after `goto` (and after `waitForLoadState`), before proceeding to capture. Closes the race only; the request is still issued.
  Recommend (1), falling back to (2) if `route()` proves too costly on asset-heavy pages — and if (2) is chosen, say so explicitly in the comment rather than implying the request is blocked.
- Whichever is chosen, `assertSafeUrl` stays the single guard (§6 "one seam per concern"). Don't inline a second IP check.
- Test with a local redirect server: `SSRF_ALLOWLIST_HOSTS=localhost` for the entry point, redirecting to a hostname that resolves to `127.0.0.1` (e.g. `localtest.me`) — that is the case the literal-IP test never covered.
- Files: `lib/ingest.ts`, `README.md`, DIST-044 report under `.agents/`.

### As Built

- `renderUrl` collects every redirect validation into `pendingRedirectValidations` and awaits them with `Promise.allSettled` after `page.goto`, on the success and the error path; a failed check closes the page and the browser is closed in `finally`.
- The 10-of-10 hostname-redirect result rests on the run recorded in `.agents/reports/dist-049-ssrf-redirect-unraceable-report.md`.
- The DIST-044 report carries a dated "Correction (2026-07-29, DIST-049)" section.
- The README's "Layer 1: built-in SSRF guard" states that Chromium has already sent the redirect request when the check runs; the sentence was dropped in `a3dd6ef` and restored on 2026-10-14.

### Dependencies

- Blocked by: none
- Blocks: none

---

## [DIST-050] Set `structureUnavailableReason` when the AI lane has no API key

**Type**: Bug
**GitHub Label**: bug
**Priority**: High
**Complexity**: Small
**Phase**: 7 — P0 correctness
**Labels**: `backend`, `api`, `frontend`
**Traces to**: PRD §12 Phase 7 / P0-4; §10 response shape; §11 Phase-5 exit criterion
**Status**: done — issue closed, PR #112 merged

### Description

As a **user analyzing images without an API key**, I want to be told *why* the structure pane is missing, so that I can fix my setup instead of assuming the feature is broken.

### Context (verified at `67c00f0`)

`lib/analyze.ts:233` — `const wantsStructure = (mode === "structure" || mode === "both") && aiLaneAvailable();`

The `aiLaneAvailable()` conjunct means a keyless image request skips the whole structure branch, returning `undefined` for both `structureReport` **and** `structureUnavailableReason` (the `else` arm at line 263 sets the reason to `undefined`). Meanwhile:

- the doc comment at `lib/analyze.ts:193` promises the reason covers *"no API key, or the vision model failed"*, and
- the frontend type at `app/page.tsx:30` documents it as *"image mode without an API key"*.

Both docs describe behavior the code does not implement. §11's Phase-5 exit criterion is written against this exact case.

### Acceptance Criteria

- [x] Given `mode: "structure"` or `"both"` with image input and **no** `GEMINI_API_KEY` / `OPENROUTER_API_KEY` set, when `POST /api/analyze` is called, then the response carries a `structureUnavailableReason` naming the missing key as the cause.
- [x] Given that response, when the workbench renders it, then the user sees the reason rather than a silently absent structure tab.
- [x] Given `mode: "tokens"` with image input and no key, when analyzed, then `structureUnavailableReason` stays `undefined` — structure was never requested, so there is nothing to explain.
- [x] Given a keyless run, when the response is produced, then it is **not** cached under the existing transient-failure rule *only if* the reason is transient; a missing key is a persistent condition, so confirm and document which side of that line this case falls on.
- [x] Given `npm run typecheck` and `npm run lint`, when run, then both pass.

### Technical Notes

- Minimal shape: split the two conditions. `wantsStructure` becomes mode-only; inside the branch, check `aiLaneAvailable()` and set the reason (e.g. `"Structure inference for images requires an AI key — set GEMINI_API_KEY or OPENROUTER_API_KEY."`) instead of skipping.
- Mention **both** provider env vars in the message — `aiLaneAvailable()` is true if either is set (`CLAUDE.md`, aiLane section). Coordinate wording with DIST-057.
- Caching: `app/api/analyze/route.ts` deliberately skips caching responses with a *transient* `structureUnavailableReason` so a retry can succeed (`CLAUDE.md`, API route). A missing key is **not** transient — caching it is correct and cheap. If the current check is a blanket "reason present ⇒ don't cache", decide deliberately and leave a comment either way rather than letting it fall out by accident.
- Files: `lib/analyze.ts`, possibly `app/api/analyze/route.ts`, `app/page.tsx`.

### As Built

- `analyzeImages` in `lib/analyze.ts` sets `structureUnavailableReason` to "Structure inference for images requires an AI key — set OPENROUTER_API_KEY." for a keyless `structure`/`both` request; it names only `OPENROUTER_API_KEY`, since `GEMINI_API_KEY` is not read (#199).
- `app/page.tsx` renders the reason above the result; the route caches a keyless response (persistent) and skips caching a vision-call failure (transient).

### Dependencies

- Blocked by: none
- Blocks: none

---

## [DIST-051] Stop capturing a full-page screenshot that is immediately discarded

**Type**: Technical
**GitHub Label**: technical
**Priority**: Medium
**Complexity**: Small
**Phase**: 7 — P1 waste
**Labels**: `backend`, `performance`
**Traces to**: PRD §12 Phase 7 / P1-2
**Status**: done — issue closed, PR #113 merged

### Description

As a **maintainer**, I want the render path to stop paying for a screenshot nothing consumes, so that tall-page analyses don't burn one of the pipeline's most expensive calls plus a base64 payload for no result.

### Context (verified at `67c00f0`)

`lib/ingest.ts:309` — `const fullPageShotBuf = await page.screenshot({ fullPage: true });` → stored at `:328`, surfaced on `RenderResult` at `:26` / `:283` / `:405`. But `captureFromRender` (`lib/analyze.ts:286-303`) never copies it into `Capture`, and no reader exists anywhere in `lib/`, `app/`, or `eval/`. On tall pages `screenshot({ fullPage: true })` internally scroll-and-stitches — it is among the priciest calls in the pipeline — and the base64 string is then held for the remainder of the request.

The in-code comment justifies it as a dead-code fallback so a future reader doesn't "simplify" by swapping it in for the panorama. That intent is fully served by the comment alone, at zero runtime cost.

### Acceptance Criteria

- [x] Given a URL analysis, when `renderUrl` runs, then no `screenshot({ fullPage: true })` call is made.
- [x] Given `RenderResult` and `CapturedPage`, when inspected, then `fullPageShot` is gone from both.
- [x] Given the removal, when `lib/ingest.ts` is read, then the retained comment still warns a future reader why `panoramaShot` is not `screenshot({ fullPage: true })` — the knowledge survives the code.
- [x] Given a tall multi-viewport page, when analyzed before and after, then `meta.elapsedMs` improves measurably and `panoramaShot` / `scrollShots` are unchanged.
- [x] Given `npm run typecheck`, `npm run lint`, and `npm run eval`, when run, then all pass with `eval/baseline.json` untouched.

### Technical Notes

- Purely subtractive: remove the call, the two interface fields (`lib/ingest.ts:26`, `:283`), and the assignments (`:328`, `:405`). Keep and slightly expand the explanatory comment at `:52`.
- Committed eval captures never had `fullPageShot` (it never reached `Capture`), so no fixture churn.
- Files: `lib/ingest.ts` (only).

### As Built

- No `screenshot({ fullPage: true })` call remains; the `panoramaShot` field comment in `lib/ingest.ts` keeps the warning about fixed and sticky elements.
- The timing rests on `.agents/reports/dist-051-drop-unused-fullpage-screenshot-report.md`: mean `elapsedMs` 5454 → 5150 ms on an 8-viewport page.

### Dependencies

- Blocked by: none
- Blocks: none

---

## [DIST-052] Remove the dead `analyzeUrlStructure` export

**Type**: Technical
**GitHub Label**: technical
**Priority**: Low
**Complexity**: Small
**Phase**: 7 — P1 dead code
**Labels**: `backend`
**Traces to**: PRD §12 Phase 7 / P1-3
**Status**: done — issue closed, PR #114 merged

### Description

As a **maintainer**, I want unreferenced exports removed, so that the orchestration surface in `lib/analyze.ts` reflects only entry points that are actually entry points.

### Context (verified at `67c00f0`)

`lib/analyze.ts:354` exports `analyzeUrlStructure`. A repo-wide search across `lib/`, `app/`, and `eval/` returns exactly one hit: the definition itself.

### Acceptance Criteria

- [x] Given the codebase after the change, when `analyzeUrlStructure` is searched for, then there are zero occurrences.
- [x] Given `CLAUDE.md` and the PRD, when their "Orchestration entry points" descriptions are checked, then neither advertises the removed function (confirm — the current `CLAUDE.md` text names `extractFromCapture`, `extractStructureFromCapture`, `enrichWithAI`, `analyzeUrl`, `analyzeImages`, so likely no edit is needed).
- [x] Given `npm run typecheck`, `npm run lint`, and `npm run eval`, when run, then all pass with `eval/baseline.json` untouched.

### Technical Notes

- Check whether removing it orphans any import in `lib/analyze.ts` (e.g. a `StructureReport` type import used only by its signature) and clean those up too — `lint` will catch it.
- Files: `lib/analyze.ts` (only).

### As Built

- No `analyzeUrlStructure` remains in `lib/`, `app/` or `eval/`; `docs/architecture/orchestration.md` names only the live entry points.

### Dependencies

- Blocked by: none
- Blocks: none

---

## [DIST-053] Extract the duplicated download plumbing in the workbench

**Type**: Technical
**GitHub Label**: technical
**Priority**: Low
**Complexity**: Small
**Phase**: 7 — P1 redundancy
**Labels**: `frontend`
**Traces to**: PRD §12 Phase 7 / P1-4
**Status**: done — issue closed, PR #115 merged

### Description

As a **maintainer**, I want the two download handlers to share their filename-derivation and blob/anchor/revoke logic, so that a fix to one (e.g. hostname sanitizing) can't silently miss the other.

### Context (verified at `67c00f0`)

`app/page.tsx:161-199` — `downloadActiveMarkdown` and `downloadTailwindTheme` contain a **verbatim** duplicated block: the `try { host = new URL(meta?.finalUrl ?? url).hostname.replace(/^www\./, "") } catch { … images[0].file.name.replace(/\.[^/.]+$/, "") }` derivation, plus identical `Blob` → `createObjectURL` → `<a>` → `click()` → `revokeObjectURL` boilerplate. Only the default host (`"report"` vs `"theme"`), MIME type, content, and filename pattern differ.

### Acceptance Criteria

- [x] Given the refactor, when `app/page.tsx` is read, then one helper owns the hostname derivation and one helper owns blob-download, each called by both handlers.
- [x] Given a URL analysis, when "Download" is clicked on the tokens tab, then the file is named `distill-<host>.md` exactly as before.
- [x] Given a URL analysis on the structure tab, when "Download" is clicked, then the file is named `distill-structure-<host>.md` as before.
- [x] Given "Download Tailwind theme" is clicked, then the file is named `distill-theme-<host>.css` as before.
- [x] Given image input with no resolvable URL, when either download runs, then the filename still falls back to the first image's basename (and to `report` / `theme` respectively when there is no image either).
- [x] Given `npm run typecheck` and `npm run lint`, when run, then both pass.

### Technical Notes

- Keep the per-caller default host as a parameter — that is the only meaningful difference in the derivation block, and collapsing it to one shared default would change observable filenames.
- Behavior-preserving refactor; no schema, no API, no report surface touched.
- Files: `app/page.tsx` (only).

### As Built

- `deriveHost(sourceName, defaultHost)` and `downloadBlob` in `app/page.tsx` serve both downloads; the source name is the analyzed result's final URL, or the first uploaded image's file name, never the live form.

### Dependencies

- Blocked by: none
- Blocks: none

---

## [DIST-054] Rename `populateMissingComponentDefs` to describe what it actually does

**Type**: Technical
**GitHub Label**: technical
**Priority**: Low
**Complexity**: Small
**Phase**: 7 — P1 dead code / clarity
**Labels**: `backend`, `extraction`
**Traces to**: PRD §12 Phase 7 / P1-5
**Status**: done — issue closed, PR #116 merged

### Description

As a **maintainer reading the structure pipeline**, I want function names that match their behavior, so that a reader doesn't assume existing component definitions are left untouched when they are in fact mutated.

### Context (verified at `67c00f0`)

`lib/extract/structure/structureAI.ts:331` defines `populateMissingComponentDefs`, called once at `:227`. Per the audit it is a pure alias for `walkComponentMap`, and the name actively misleads — it also mutates *existing* entries' `composition` and `instances`, not only missing ones.

### Acceptance Criteria

- [x] Given the change, when `structureAI.ts` is read, then the function is either renamed to describe its real effect (e.g. `walkComponentMap` / `syncComponentDefsFromTree`) or removed in favor of the existing equivalent, with the single call site updated.
- [x] Given the change, when the structure lane runs against a committed capture, then the emitted component map is byte-identical to before.
- [x] Given `npm run eval`, when run, then it passes with `eval/baseline.json` untouched — this is a naming change, so *any* score movement means real behavior changed and must be investigated.
- [x] Given `npm run typecheck` and `npm run lint`, when run, then both pass.

### Technical Notes

- Confirm the "pure alias" claim before deleting rather than renaming — if the two functions have diverged even slightly, rename (don't merge) and note the difference.
- The structure lane is eval-scored (`eval/scoreStructure.ts`), so component-map counts are covered by the gate here.
- Files: `lib/extract/structure/structureAI.ts` (only).

### As Built

- `populateMissingComponentDefs` was removed rather than renamed, and its call site calls `walkComponentMap` directly.

### Dependencies

- Blocked by: none
- Blocks: none

---

## [DIST-055] Drop the redundant, version-mismatched `@types/js-yaml`

**Type**: Technical
**GitHub Label**: technical
**Priority**: Low
**Complexity**: Small
**Phase**: 7 — P1 redundancy
**Labels**: `tooling`
**Traces to**: PRD §12 Phase 7 / P1-6; §8 stack table
**Status**: done — issue closed, PR #117 merged

### Description

As a **maintainer**, I want type definitions to come from one place at the right version, so that TypeScript isn't fed a v4 global type-reference describing a library the project runs at v5.

### Context (verified at `67c00f0`)

`package.json` declares `"js-yaml": "^5.2.1"` (dependencies, line 20) and `"@types/js-yaml": "^4.0.9"` (devDependencies, line 32). js-yaml 5 ships its own types; per the audit, `--traceResolution` confirms TS resolves the **bundled v5** `.d.ts` for the import, while the v4 `@types` package is still pulled in as a global type-reference directive describing a different major version.

### Acceptance Criteria

- [x] Given `package.json` after the change, when inspected, then `@types/js-yaml` is absent from `devDependencies`.
- [x] Given a clean `npm ci`, when `npm run typecheck` runs, then it passes with no `js-yaml`-related errors.
- [x] Given `npx tsc --noEmit --traceResolution`, when grepped for `js-yaml`, then resolution points only at the bundled v5 declarations.
- [x] Given `npm run lint`, `npm run eval`, and `npm run build`, when run, then all pass.
- [x] Given PRD §8, when its serialization row is read, then the parenthetical about the redundant dependency is updated to reflect the removal.

### Technical Notes

- `package-lock.json` must be regenerated in the same commit.
- Run the verification against a fresh install, not the existing `node_modules` — a stale tree can mask the difference.
- Files: `package.json`, `package-lock.json`, `.agents/PRDs/PRD.md` (§8 row).

### As Built

- `package.json` has no `@types/js-yaml`; the trace-resolution check rests on `.agents/reports/dist-055-drop-types-js-yaml-report.md`.
- PRD §8 reads "js-yaml ^5.2 (ships its own types)".

### Dependencies

- Blocked by: none
- Blocks: none

---

## [DIST-056] Honor the full `ModelCall` contract on the OpenRouter path — or declare it explicitly degraded

**Type**: Bug
**GitHub Label**: bug
**Priority**: High
**Complexity**: Medium
**Phase**: 7 — P2 provider divergence
**Labels**: `backend`, `ai-lane`
**Traces to**: PRD §12 Phase 7 / P2-1; §4 "In Scope — Technical" unchecked regression; §4 Out-of-Scope superseded line; §8 AI-lane row; §14 "Provider-specific capability gaps in a single seam"
**Status**: done — issue closed, PR #118 merged. 2 criteria are not met.

### Description

As a **maintainer**, I want both provider paths behind `callModel` to honor the same call contract, so that identical code doesn't silently produce lower-quality or truncated output depending on which API key happens to be set.

### Context (verified at `67c00f0`)

`lib/aiLane.ts` now has two divergent request builders behind one nominal seam:

| Contract element | Gemini path | OpenRouter path |
|---|---|---|
| Model id | `AI_MODEL = "gemini-3.5-flash"` (`:21`), no env override | `OPENROUTER_MODEL`, default `"google/gemini-2.5-flash"` (`:74`) — a **different model generation** |
| `thinkingLevel` | `thinkingConfig: { thinkingLevel }` (`:149`) | **ignored entirely** |
| Structured output | `responseMimeType` + real `responseJsonSchema` (`:155`) | downgraded to bare `response_format: { type: "json_object" }` (`:120`) |

OpenRouter **takes precedence** when both keys are set, so the degraded path is the *default* for anyone holding both. This matters concretely: `lib/interpret.ts` pins `thinkingLevel: MINIMAL` specifically so thinking tokens don't eat its 2048-token budget and truncate the JSON — on OpenRouter that pin is a no-op.

This also leaves two documents contradicting shipped code: PRD §4 Out-of-Scope still reads "one provider, one code path" (already flagged as superseded), and `CLAUDE.md` describes `aiLane.ts` as holding *one* pinned `AI_MODEL`.

### Acceptance Criteria

- [ ] Given a lane that passes `thinkingLevel`, when it is dispatched over OpenRouter, then the level is either translated to the provider's equivalent parameter **or** the gap is asserted and documented at the call site — not silently dropped.
  - *Not met:* `thinkingLevel` no longer exists: the native Gemini path and the field were removed in #199, so no lane passes a thinking level and `ModelCall` has no such field.
- [x] Given a lane that passes `jsonSchema`, when dispatched over OpenRouter, then either a real JSON-schema `response_format` is sent, or the weaker `json_object` fallback is accompanied by an in-code note that Zod remains the only shape gate on this path.
- [x] Given `interpret.ts`'s 2048-token budget, when run over OpenRouter with a real key, then its JSON response parses without truncation (verified live, per the §12 Phase 7 validation note).
- [x] Given `CLAUDE.md` and PRD §4/§6/§8, when read after the change, then they describe the shipped two-provider reality — including whichever gaps are deliberately accepted — rather than an invariant the code no longer holds.
- [x] Given PRD §4's Out-of-Scope line, when read, then it is restated as accepted two-provider scope rather than left contradicting the code.
- [ ] Given `npm run eval:ai`, when run against each provider, then both stay within the documented Jaccard floors (0.5 adjectives / 0.3 archetype).
  - *Not met:* there is one provider since #199, so `npm run eval:ai` can only run over OpenRouter; it met the floors in 5 of 5 runs on the default model after #209.
- [x] Given `npm run typecheck`, `npm run lint`, and `npm run eval`, when run, then all pass with `eval/baseline.json` untouched.

### Technical Notes

- **This is a decision story as much as a code story.** Two legitimate outcomes:
  1. **Close the gap** — map `thinkingLevel` onto OpenRouter's reasoning-effort parameter and send `response_format: { type: "json_schema", json_schema: … }` where the routed model supports it. Strongest, but OpenRouter's support varies *per routed model*, so it can't be unconditional.
  2. **Declare it degraded** — keep the fallback, but make it loud: a one-time startup warning, an explicit note in `README.md` + §9, and a comment at each `thinkingLevel` call site saying the pin is Gemini-only. §14 already prescribes this as the acceptable alternative.
  Recommend (1) for `response_format` where feasible and (2) for `thinkingLevel`, since a per-model capability probe is out of proportion to the MVP.
- Also settle the **model-generation asymmetry**: the Gemini path pins `gemini-3.5-flash` with no override, the OpenRouter default is `gemini-2.5-flash`. Either add the `GEMINI_MODEL` override that was specced in Phase 5 but never built (PRD §12 Phase 5 "Not delivered as specced"), or align the OpenRouter default. Pick one and record it.
- `lib/aiLane.ts` remains the **only** file importing a provider SDK (`CLAUDE.md`). Do not let this fix leak provider branching into call sites.
- Files: `lib/aiLane.ts`, `README.md`, `CLAUDE.md`, `.agents/PRDs/PRD.md`.

### As Built

- `callModel` in `lib/aiLane.ts` sends a non-strict `response_format: { type: "json_schema" }`; the OpenRouter-only default is `google/gemini-3.5-flash`.
- The docs now describe one provider: `docs/architecture/orchestration.md` and PRD §4/§8 state that #199 removed the Gemini path, and PRD §4 keeps the 2026-07-29 "accepted scope" note with the 2026-10-14 reversal after it.
- The untruncated 2048-token parse rests on the live `npm run eval:ai` runs of `.agents/reports/issue-209-seed-interpretation-lane-plan-report.md`, which printed no failure line.

### Dependencies

- Blocked by: none
- Blocks: DIST-057 (UI copy should reflect the settled provider story)

---

## [DIST-057] Setup hint must name `OPENROUTER_API_KEY`, not just `GEMINI_API_KEY`

**Type**: Enhancement
**GitHub Label**: enhancement
**Priority**: Medium
**Complexity**: Small
**Phase**: 7 — P2 documentation drift
**Labels**: `frontend`
**Traces to**: PRD §12 Phase 7 / P2-3
**Status**: done — issue closed, PR #119 merged. 2 criteria are not met.

### Description

As a **user who configured OpenRouter**, I want the workbench's setup hint to name every key that enables the AI lane, so that I'm not told to set a Gemini key I don't need.

### Context (verified at `67c00f0`)

`app/page.tsx:438` renders the hint naming only `GEMINI_API_KEY`, shown whenever the AI lane didn't apply. Since #94/#95, `aiLaneAvailable()` returns true if **either** `GEMINI_API_KEY` or `OPENROUTER_API_KEY` is set, and OpenRouter takes precedence when both are present.

### Acceptance Criteria

- [ ] Given no AI key is set, when the hint renders, then it names both `GEMINI_API_KEY` and `OPENROUTER_API_KEY` as ways to enable the lane.
  - *Not met:* the hint names only `OPENROUTER_API_KEY`, because the native Gemini path was removed in #199 and `GEMINI_API_KEY` no longer enables the lane.
- [ ] Given the hint text, when read, then it still links to the free Gemini key source and keeps the existing `.env.local` guidance.
  - *Not met:* the hint links to https://openrouter.ai/keys, not to a Gemini key source; the `.env.local` guidance stays.
- [x] Given the wording, when compared against DIST-050's `structureUnavailableReason` message, then the two are consistent about which keys enable the lane.
- [x] Given `npm run typecheck` and `npm run lint`, when run, then both pass.

### Technical Notes

- Keep it to one line — this is a hint, not documentation. `README.md` already covers the full provider matrix (`:69`, `:90-91`).
- If DIST-056 lands the "explicitly degraded fallback" outcome, consider a half-sentence noting Gemini is the fuller-featured path. Don't over-explain in the UI.
- Files: `app/page.tsx` (only).

### As Built

- The hint in `app/page.tsx` shows only when `meta.aiOutcome` is `no-key`.

### Dependencies

- Blocked by: DIST-056 (soft — wording depends on how the provider gap is resolved)
- Blocks: none

---

## [DIST-058] Add `npm run build` to CI

**Type**: Technical
**GitHub Label**: technical
**Priority**: Medium
**Complexity**: Small
**Phase**: 7 — P2 gate coverage
**Labels**: `ci`, `tooling`
**Traces to**: PRD §12 Phase 7 / P2-4
**Status**: done — issue closed, PR #120 merged

### Description

As a **maintainer**, I want CI to build the app, so that a Next.js-specific failure — a client/server boundary violation, a bad route config — can't ship green.

### Context (verified at `67c00f0`)

`.github/workflows/ci.yml` is named "Build, Lint & Eval" but runs only `npm ci` → `playwright install` → `npm run typecheck` → `npm run lint` → `npm run eval`. There is no `npm run build` step. `typecheck` (`tsc --noEmit`) does not catch App Router boundary errors, which surface only during the Next.js build.

### Acceptance Criteria

- [x] Given a push or PR to `main`, when CI runs, then `npm run build` executes as a step.
- [x] Given a PR that introduces a client/server boundary violation, when CI runs, then the job fails.
- [x] Given CI runs with **no** AI key in the environment (as today), when `npm run build` executes, then it succeeds — the build must not require a key.
- [x] Given the workflow after the change, when its step order is read, then `build` runs in a position that gives fast feedback without masking earlier failures (recommended: `typecheck` → `lint` → `build` → `eval`).
- [x] Given the workflow name "Build, Lint & Eval", when compared to the steps, then it is now accurate.

### Technical Notes

- Watch total runtime — `playwright install --with-deps chromium` plus `eval` plus a Next build is not trivial on a free runner. Consider caching `.next/cache` between runs if the added time is material.
- The build must not depend on `GEMINI_API_KEY` / `OPENROUTER_API_KEY`; CI has neither by design (`CLAUDE.md`), and that property is itself worth preserving.
- Files: `.github/workflows/ci.yml` (only).

### As Built

- `.github/workflows/ci.yml` runs `npm run check` (typecheck → lint → build → eval) as one step in the job "Build, Lint & Eval"; the run on `4291324` passed with no key in the environment.

### Dependencies

- Blocked by: none
- Blocks: none

---

## [DIST-059] Remove the stale `Anthropic` reference in the structure pipeline

**Type**: Technical
**GitHub Label**: technical
**Priority**: Low
**Complexity**: Small
**Phase**: 7 — P2 documentation drift
**Labels**: `backend`
**Traces to**: PRD §12 Phase 7 / P2-5
**Status**: done — issue closed, PR #121 merged

### Description

As a **maintainer**, I want in-code comments to name the provider actually in use, so that a reader isn't sent looking for an SDK that was removed three stories ago.

### Context (verified at `67c00f0`)

`lib/extract/structure/index.ts:23` still reads *"without ever constructing the `Anthropic` client"*, describing the `forceHeuristicNaming` short-circuit used by the eval harness. `@anthropic-ai/sdk` was removed in DIST-038 (issue #72). The behavior the comment describes is still correct and still load-bearing — only the provider name is wrong.

### Acceptance Criteria

- [x] Given the codebase after the change, when `Anthropic` is searched for across `lib/`, `app/`, and `eval/`, then there are zero occurrences.
- [x] Given the amended comment, when read, then it still explains *why* the short-circuit sits ahead of the availability check (offline, deterministic eval) — the correction must not shorten the comment into uselessness.
- [x] Given `npm run typecheck` and `npm run lint`, when run, then both pass.

### Technical Notes

- Prefer provider-neutral phrasing ("without ever constructing a model client" / "without touching `aiLane`"), so the comment survives the next provider change too.
- Sweep `README.md` and `.agents/` docs for the same stale name while in there, but don't rewrite historical records under `.agents/plans/completed/` — those are a record of intent at the time.
- Files: `lib/extract/structure/index.ts`, possibly `README.md`.

### As Built

- The short-circuit comment now sits in `runStructureAILabeller` in `structureAI.ts` and says it keeps `npm run eval` offline even when `OPENROUTER_API_KEY` is set.

### Dependencies

- Blocked by: none
- Blocks: none

---

## [DIST-060] Make a missing eval corpus capture fail rather than skip

**Type**: Technical
**GitHub Label**: technical
**Priority**: Medium
**Complexity**: Medium
**Phase**: 7 — P3 gate coverage
**Labels**: `eval`, `tooling`
**Traces to**: PRD §12 Phase 7 / P3-1; §11 "Gate honesty"
**Status**: done — issue closed, PR #122 merged. 1 criterion is not met.

### Description

As a **maintainer**, I want the eval gate to be as strong as the documentation claims, so that "the correctness gate passed" means more than "two synthetic fixtures still score exactly 1.0."

### Context (verified at `67c00f0`)

`npm run eval` is presented in §11 and `CLAUDE.md` as *the* correctness gate for extraction logic. In practice it scores **two synthetic fixtures**, both pinned at exactly 1.0, and silently **skips** `stripe`, `linear`, and `vercel` — their captures are git-ignored by design (`eval/corpus.ts`). With `SITE_FLOOR = 0.7` and a baseline of `{1, 1}`, there is little headroom to detect a real-world regression, and a missing corpus entry produces a log line rather than a failure.

This is a deliberate MVP posture, not a defect — but the gap between "the correctness gate" and "two perfect-scoring fixtures" should be named and narrowed. It is also why P0-2 (DIST-048) shipped invisible to every gate.

### Acceptance Criteria

- [x] Given a `CORPUS` entry whose `capture.json` is absent, when `npm run eval` runs, then it **fails** with a clear message rather than logging a skip — unless the entry is explicitly marked optional.
- [x] Given entries that are intentionally uncommitted (`stripe`, `linear`, `vercel`), when the gate runs in CI, then their status is unambiguous: either they carry an explicit `optional: true` marker in `eval/corpus.ts`, or a sanitized capture is committed for at least one of them.
- [ ] Given at least one real-site capture is committed, when `npm run eval` runs offline, then it scores that site and the result is recorded in `eval/baseline.json` via a deliberate `UPDATE_BASELINE=1` run.
  - *Not met:* no real-site capture is committed; the third committed capture, `adversarial-shell`, is a synthetic `hostile` fixture, and `stripe`, `linear` and `vercel` stay `optional: true` with git-ignored captures.
- [x] Given CI (no API key, no network), when `npm run eval` runs, then it still passes fully offline.
- [x] Given `CLAUDE.md` and PRD §11, when read after the change, then they state what the gate does and does not cover, rather than implying blanket extraction coverage.

### Technical Notes

- Two options, per the PRD; they are complementary, not exclusive:
  1. **Fail-not-skip** — smallest change, entirely in `eval/run.ts` / `eval/corpus.ts`. Do this regardless.
  2. **Commit a sanitized real-site capture** — much stronger signal, but needs a call on size and on redistributing a third party's rendered CSS/DOM. Check `capture.json` size first (screenshots are base64 and these get large) and consider stripping `panoramaShot`/`scrollShots` from the committed copy if the extractors under test don't need them.
- If (2) is taken, the capture-shape rules apply: it lands with its `expected.yaml` and a deliberate baseline refresh in the **same** PR (`CLAUDE.md`, eval harness).
- Consider recording in the same change that a *new* lane needs coverage that actually exercises it — the §11 "Gate honesty" point. A checklist line in `CLAUDE.md` is enough; don't build a framework.
- Files: `eval/run.ts`, `eval/corpus.ts`, possibly `eval/corpus/<slug>/`, `eval/baseline.json`, `CLAUDE.md`, `.agents/PRDs/PRD.md`.

### As Built

- `eval/run.ts` fails the run when a required corpus entry lacks `capture.json` or `expected.yaml`; `eval/corpus.ts` marks the live entries `optional: true`, and the runner logs them as skipped.
- `AGENTS.md` ("Coverage scope") and PRD §11 ("Gate honesty") say what the gate covers and what it does not.

### Dependencies

- Blocked by: none
- Blocks: none

---

## [DIST-061] Carry the render viewport through `Capture` into the structure lane

**Type**: Technical
**GitHub Label**: technical
**Priority**: Low
**Complexity**: Small
**Phase**: 7 — P3 latent coupling
**Labels**: `backend`, `extraction`
**Traces to**: PRD §12 Phase 7 / P3-2
**Status**: done — issue closed, PR #123 merged

### Description

As a **maintainer**, I want region metrics measured against the viewport the page was actually rendered at, so that a future non-default `RenderOptions.viewport` doesn't silently produce wrong `padY` / height annotations.

### Context (verified at `67c00f0`)

`Capture` carries no viewport, so `extractStructureFromCapture` always lets the structure lane fall back to its 1440×900 default (`lib/extract/structure/index.ts:44`). This is correct **today** only because `renderUrl` is never called with a custom `RenderOptions.viewport`. If it ever is, `regionMetrics` measures against the wrong viewport height and the resulting annotations are wrong without any error.

Latent, not live — a trap laid for a future change rather than a current defect.

### Acceptance Criteria

- [x] Given a render at the default viewport, when `captureFromRender` builds the `Capture`, then the viewport used is recorded on it.
- [x] Given `extractStructureFromCapture`, when a capture carrying a viewport is passed, then region metrics are computed against that viewport rather than the 1440×900 default.
- [x] Given a **legacy** committed capture with no viewport field, when replayed, then the lane falls back to the existing default and scores identically — absent means "nothing observed", per the optional-field contract.
- [x] Given a render at a deliberately non-default viewport (e.g. 1280×720), when the structure lane runs, then `padY` / height annotations reflect that height.
- [x] Given `npm run eval`, when run, then it passes with `eval/baseline.json` untouched — existing captures have no viewport, so nothing may move.
- [x] Given `npm run typecheck` and `npm run lint`, when run, then both pass.

### Technical Notes

- Add the field as **optional** (`viewport?: { width: number; height: number }`) so committed captures stay valid without a fixture refresh — this is exactly the additive-lane contract in `CLAUDE.md`, and it means no `capture.json` churn.
- Do **not** regenerate eval captures for this. Verify against a live render per `CLAUDE.md` "Manually verifying extraction changes" (local synthetic server, `SSRF_ALLOWLIST_HOSTS=localhost`, `npx tsx` from the project root, delete the scratch script after).
- Files: `lib/analyze.ts` (Capture type + `captureFromRender`), `lib/ingest.ts` (surface the viewport on `RenderResult` if not already), `lib/extract/structure/index.ts`.

### As Built

- `Capture.viewport` is optional on `CaptureArtifacts` in `lib/ingest.ts`; `extractStructureFromCapture` passes it through, and `extractStructure` falls back to 1440×900 when it is absent.
- All committed captures carry a viewport since DIST-065 (#127); the non-default-viewport run rests on `.agents/reports/dist-061-carry-render-viewport-in-capture-report.md`, which records the check but not its values.

### Dependencies

- Blocked by: none
- Blocks: none

---

## Coverage check — PRD Phase 7 finding → story

| Finding | Story | Status |
|---|---|---|
| P0-1 AI lane drops motion | — | **Already fixed** at `lib/analyze.ts:160-165`; tick the PRD box |
| P0-2 cross-origin drops 3 of 4 props | DIST-048 | Merged with P1-1 per the PRD's own fix directive |
| P0-3 SSRF redirect race + overstated claim | DIST-049 | |
| P0-4 `structureUnavailableReason` unset when keyless | DIST-050 | |
| P1-1 two drifted CSSOM scanners | DIST-048 | |
| P1-2 discarded full-page screenshot | DIST-051 | |
| P1-3 dead `analyzeUrlStructure` export | DIST-052 | |
| P1-4 duplicated download plumbing | DIST-053 | |
| P1-5 `populateMissingComponentDefs` misnamed alias | DIST-054 | |
| P1-6 redundant `@types/js-yaml` | DIST-055 | |
| P2-1 OpenRouter breaks the single-seam contract | DIST-056 | Also closes the §4 unchecked technical regression line |
| P2-2 OpenRouter env vars undocumented | — | **Already fixed** in `README.md:69,90-91,156`; tick the PRD box |
| P2-3 setup hint names only `GEMINI_API_KEY` | DIST-057 | |
| P2-4 CI never builds | DIST-058 | |
| P2-5 stale `Anthropic` reference | DIST-059 | |
| P2-6 refresh stale PRD sections | — | Already `[x]` in the PRD |
| P3-1 eval gate weaker than documented | DIST-060 | |
| P3-2 latent viewport coupling | DIST-061 | |

**14 stories** cover all 14 open findings. Two findings are already closed in the tree; one is already ticked.

### Cross-cutting validation (PRD §12 Phase 7 "Validation")

Applies to every story above:

- `npm run lint` + `npm run typecheck` clean.
- **`npm run eval` passes with `eval/baseline.json` untouched.** Every P0/P1 item is either outside the measured lane or a pure dedup/removal — so *any* score movement means the change leaked into measured extraction and must be investigated, never baselined away. DIST-060 is the sole deliberate exception (it changes the corpus itself).
- DIST-048 additionally needs live cross-origin verification against a **two-server** synthetic fixture; no committed capture exercises cross-origin stylesheets.
- DIST-049 needs a redirect-to-*hostname* test, not the literal-IP case that hid the race.

### Out of scope (PRD §4) — deliberately no stories

Authentication/multi-tenancy/persistence, multi-page crawling, authenticated capture, component-level codegen, browser-extension/CLI distribution, and icon/asset extraction remain deferred. The multi-provider line is no longer a clean deferral — DIST-056 forces the choice between closing the gap and restating it as accepted scope.
