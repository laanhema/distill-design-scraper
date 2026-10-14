# Implementation Report

**Plan**: `.agents/plans/completed/todo-26-prune-non-essential-comments-plan.md`
**Branch**: `feature/todo-26-prune-non-essential-comments`
**Status**: COMPLETE

## Summary

Pruned non-essential comments across `lib/`, `app/` and `eval/` (49 files, comments only). Every planning/ticket reference (`§…`, `DIST-nnn`, `TODO-n`, `#nn`, `Phase N`, `Pn-m`, "the AC", "review S6") was removed from comments, keeping the fact each one backed in words; `microsoft/playwright#34994` stays. History narration was dropped or turned into present-tense warnings, "what" comments that restate code were removed, and long blocks were cut down to their invariant. Security, bounded-resource, browser-workaround, threshold, ordering, drift-guard and "omitted, never faked" comments were kept. Comments that contradicted the code were corrected.

The plan's comment gate (End-to-End Verification §1) shows `all checks ok`: code, types and strings are token-identical to `main`, tool directives are unchanged, 0 references remain, and every listed essential comment is present. Comment lines went from 1957 on `main` to 1270 (35% fewer). The prototype patch for `lib/ingest.ts` applied cleanly first.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Save the gate, apply the prototype patch, confirm the start (`186 found`, `1957 → 1869`) | scratch `check-comments.mjs`, `lib/ingest.ts` | PASS |
| 2 | Security, API route, cache, env | `app/api/analyze/route.ts`, `lib/api.ts`, `lib/cache.ts`, `lib/env.ts`, `lib/security/*` | PASS |
| 3 | AI lane | `lib/aiLane.ts`, `lib/interpret.ts`, `lib/extract/structure/structureAI.ts`, `lib/extract/structureFromImage.ts` | PASS |
| 4 | Tokens lane and style dump | `lib/extract/{styleDump,palette,imagePalette,typography,tokens,recipes,states,motion,mode,roleMatch,imageMediaType}.ts`, `lib/color.ts` | PASS |
| 5 | Structure lane | `lib/extract/structureSchema.ts`, `lib/extract/structure/*.ts` | PASS |
| 6 | Schema, emit, orchestration | `lib/schema.ts`, `lib/emit.ts`, `lib/emitTailwind.ts`, `lib/analyze.ts` | PASS |
| 7 | UI | `app/page.tsx` | PASS |
| 8 | Eval harness | `eval/{run,score,scoreStructure,stability,corpus,capture}.ts` | PASS |
| 9 | Sweep, gate, verify scenarios, `npm run check` | all of the above | PASS |

## Validation Results

| Check | Result | Command / environment |
|-------|--------|-----------------------|
| Type check | PASS | `npm run typecheck` (also inside `npm run check`) — host, Node v22 |
| Lint | PASS | `npm run lint` (also inside `npm run check`) — host |
| Build | PASS | `npm run check` → `next build` "Compiled successfully" — host, no `verify.sh` instance up |
| Tests (eval gate) | PASS (3/3 fixtures at combined 100%, `✓ all gates passed`; baseline untouched) | `npm run eval`, inside `npm run check` — host |
| Comment gate (E2E §1) | PASS: `all checks ok`, `0 found`, `1957 on main, 1270 now (35% fewer)` | `node <scratch>/check-comments.mjs main` — host |
| Verify `doctor` | PASS (8 ok lines) | `.claude/skills/verify/scripts/verify.sh doctor` |
| Verify `analyze-url` (clean-light) | PASS (13 ok, exit 0, console-errors empty) | `verify.sh drive analyze-url` |
| Verify `analyze-url --target adversarial-shell` | PASS (13 ok, exit 0, console-errors empty) | `verify.sh drive analyze-url --target adversarial-shell` |
| Verify `tabs-downloads` | PASS (22 ok, exit 0, console-errors empty) | `verify.sh drive tabs-downloads` |
| Verify `analyze-images` | PASS (18 ok, exit 0, console-errors empty) | `verify.sh drive analyze-images` |
| Verify `cross-origin` | PASS (24 ok, exit 0, render 7.9 s < 20 s, console-errors empty) | `verify.sh drive cross-origin` |
| Verify `error`, variant | PASS (substitute; the step as written was not met): 5 ok, exit 0, but `console-errors.txt` is not empty | `verify.sh drive error`, compared with the same run on an export of unchanged `main` |
| `npm run check` (E2E §3) | PASS (exit 0) | `npm run check` — host, after `verify.sh down` |

The scenarios ran twice: once after Task 9's first sweep, and again on the final tree. Both runs gave the results above. The AI lane was off.

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `app/api/analyze/route.ts` | UPDATE | +22/-37 |
| `app/page.tsx` | UPDATE | +9/-17 |
| `eval/capture.ts` | UPDATE | +3/-5 |
| `eval/corpus.ts` | UPDATE | +4/-13 |
| `eval/run.ts` | UPDATE | +9/-18 |
| `eval/score.ts` | UPDATE | +5/-8 |
| `eval/scoreStructure.ts` | UPDATE | +7/-12 |
| `eval/stability.ts` | UPDATE | +10/-19 |
| `lib/aiLane.ts` | UPDATE | +19/-46 |
| `lib/analyze.ts` | UPDATE | +21/-36 |
| `lib/api.ts` | UPDATE | +4/-5 |
| `lib/cache.ts` | UPDATE | +11/-24 |
| `lib/color.ts` | UPDATE | +9/-22 |
| `lib/emit.ts` | UPDATE | +13/-31 |
| `lib/emitTailwind.ts` | UPDATE | +1/-2 |
| `lib/env.ts` | UPDATE | +4/-11 |
| `lib/extract/imageMediaType.ts` | UPDATE | +4/-9 |
| `lib/extract/imagePalette.ts` | UPDATE | +14/-41 |
| `lib/extract/mode.ts` | UPDATE | +3/-11 |
| `lib/extract/motion.ts` | UPDATE | +4/-5 |
| `lib/extract/palette.ts` | UPDATE | +30/-52 |
| `lib/extract/recipes.ts` | UPDATE | +15/-33 |
| `lib/extract/roleMatch.ts` | UPDATE | +3/-6 |
| `lib/extract/states.ts` | UPDATE | +3/-6 |
| `lib/extract/structure/annotationSegments.ts` | UPDATE | +7/-13 |
| `lib/extract/structure/harvester.ts` | UPDATE | +2/-8 |
| `lib/extract/structure/index.ts` | UPDATE | +11/-25 |
| `lib/extract/structure/ontology.ts` | UPDATE | +16/-25 |
| `lib/extract/structure/pruner.ts` | UPDATE | +6/-11 |
| `lib/extract/structure/regionMetrics.ts` | UPDATE | +11/-17 |
| `lib/extract/structure/repetition.ts` | UPDATE | +3/-8 |
| `lib/extract/structure/responsive.ts` | UPDATE | +8/-15 |
| `lib/extract/structure/scaleMatch.ts` | UPDATE | +5/-12 |
| `lib/extract/structure/sections.ts` | UPDATE | +15/-38 |
| `lib/extract/structure/squash.ts` | UPDATE | +14/-27 |
| `lib/extract/structure/structureAI.ts` | UPDATE | +29/-55 |
| `lib/extract/structure/structureEmit.ts` | UPDATE | +19/-44 |
| `lib/extract/structure/styleMatch.ts` | UPDATE | +1/-1 |
| `lib/extract/structure/tokenLink.ts` | UPDATE | +6/-9 |
| `lib/extract/structureFromImage.ts` | UPDATE | +19/-33 |
| `lib/extract/structureSchema.ts` | UPDATE | +20/-59 |
| `lib/extract/styleDump.ts` | UPDATE | +48/-97 |
| `lib/extract/tokens.ts` | UPDATE | +2/-11 |
| `lib/extract/typography.ts` | UPDATE | +16/-40 |
| `lib/ingest.ts` | UPDATE | +45/-135 |
| `lib/interpret.ts` | UPDATE | +34/-67 |
| `lib/schema.ts` | UPDATE | +27/-44 |
| `lib/security/rateLimiter.ts` | UPDATE | +15/-25 |
| `lib/security/ssrfGuard.ts` | UPDATE | +11/-17 |

Total: 49 files changed, +617/−1305 (comments only; the gate proves the token streams identical). Not changed: `app/distill-theme.css`, `app/layout.tsx`, `app/globals.css`, and everything outside `lib/`, `app/` and `eval/`.

## Deviations from Plan

1. **E2E §2, `error` scenario: `console-errors.txt` is not empty.** The plan expects every scenario's `console-errors.txt` to be empty. The `error` scenario's file holds one line: `Failed to load resource: the server responded with a status of 400 (Bad Request)`. That is Chromium logging the 400 that the scenario deliberately provokes and asserts. I ran `verify.sh drive error` once on a scratch `git worktree` of unchanged `main` (`37f57d8`), and its `console-errors.txt` holds the same line verbatim. So the plan's premise is wrong for this one scenario, and the change cannot have caused it. All 5 checks of the scenario pass, and the other five scenarios' files are empty. Reported as a substitute pass; the step as written was not met.
2. **More comments corrected than the plan lists (rubric 7).** Besides the planned palette-header fix (`ΔE ≈ 2.5` → `ΔE ≤ MERGE_DELTA_E`), these comments contradicted the code and were corrected:
   - `lib/extract/styleDump.ts`: the in-page note "Cross-origin stylesheets throw on `.cssRules`; skipped" now says their href goes to the re-fetch pass, which is what the code does.
   - `lib/extract/structure/harvester.ts`: "Bucket … by 10% tolerance (approx 20px buckets)" now says 25px buckets. The code rounds to 25.
   - `lib/extract/structure/structureEmit.ts`: the header said "Stage 8 — Structure Emit". It now says Stage 10, matching `index.ts` and the architecture doc.
   - `lib/extract/structure/tokenLink.ts`: dropped "same guardrail as the deterministic extractor". `tokens.ts` collapses mixed corners to the mode corner rather than skipping them.
   - `lib/color.ts`: `deltaE` claimed "ΔE ≈ 2–3 is near-duplicate". Each caller sets its own threshold, and the DOM lane merges at 1.5.
3. **Task 9 sweep went further than the per-file lists.** After Tasks 2–8, the gate showed only 16% fewer comment lines. Under the plan's "below ~35% → sweep again" guidance (Open Question 3), I swept every file once more, removing "what" comments and condensing long blocks (rubrics 4–6). Comments the plan lists as "keep" were kept, though some were condensed. During the sweep I briefly removed a few listed keepers, then restored them before the final run (`analyze.ts` `captureFromRender`, the `tokens.ts` threshold note, the `pruner.ts` landmark and drop notes, `cache.ts` `evictIfAtCapacity`, the interpret retry note, the `structureAI.ts` `DigestListEntry`/`requestOnce` docs, the `schema.ts` refinable-roles note, the `typography.ts` `firstFamily`/`letterSpacingEm` docs, the `recipes.ts` no-background constants, the `emit.ts` `renderMarkdown`/`cssFontName` docs, the `color.ts` `isNeutral` doc and the `mode.ts` empty-input rule). I also kept a short omission note at `imagePalette.ts` (`clusters.length === 0`) under rubric 1.
4. **Repeated rationales collapsed (rubric 6) beyond the two named examples.** The seed/temperature facts are stated once on `ModelCall.seed` (`lib/aiLane.ts`); `SEED` in `lib/interpret.ts` and the `eval/stability.ts` header point to it. The `requestOnce` "parse loosely" note in `interpret.ts` was removed, since `parseJsonLoose`'s doc says the same.
5. **`lib/color.ts:58` (`wcagGrade`)**: removed, as the plan says.

## Tests Written

| Test File | Test Cases |
|-----------|------------|
| none (no unit-test framework in this repo; comment-only change) | Covered by the plan's scratch comment gate (token-stream identity against `main`, directive check, reference check, essential-comment keep list), `npm run eval`, and the six verify scenarios. The scratch gate and the temporary `main` worktree were removed after use. |
