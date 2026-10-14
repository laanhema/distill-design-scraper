# Code Review: feature/todo-26-prune-non-essential-comments

**Scope**: branch `feature/todo-26-prune-non-essential-comments` vs merge base `37f57d8` (`main`), all changes uncommitted: 49 modified files under `lib/`, `app/`, `eval/` (+617/−1305), plus the untracked plan, prototype patch and implementation report under `.agents/` (read as context). Issue #212.
**Recommendation**: APPROVE WITH NITS

## Summary

A comments-only prune across `lib/`, `app/` and `eval/`: ticket/PRD references gone, history narration and "what" comments removed, long blocks cut down to their invariant, and five comments that contradicted the code corrected. I read the whole diff file by file. I re-ran the plan's comment gate, and ran a second, independent check of my own: each changed file at `main` and in the working tree, printed by the TypeScript printer and by `transpileModule`, with comments removed. That check catches structural or ASI changes that a token stream can miss. The only differences it finds are printer formatting of `catch {\n}` versus `catch {}` in 4 files (5 blocks), which is not a semantic change. Security, SSRF, bounded-resource, Playwright-workaround and threshold comments survive in substance. The remaining findings are four Low nits about comment accuracy and formatting.

Acceptance criteria:
- **Redundant, narrative comments removed across `lib/`, `app/`, `eval/`**: met. The gate reports comment lines 1957 → 1270 (35% fewer) and 0 planning/ticket references left. The diff read confirms that restating comments ("Sort clusters by area weight descending", "Cleanup temporary attribute", field docs that repeat the name) and history ("The old 1024 was…", "used to be two copies…") are gone.
- **Essential comments preserved**: met. The gate's keep list passes (`ok essential comments kept`). I also checked by reading: the SSRF/DNS-rebinding and `page.route()`/`microsoft/playwright#34994` rationale (`lib/ingest.ts:307-321`), the body ceiling (`app/api/analyze/route.ts:33-38`), the rate-limiter/cache bounds, the IPv4-mapped-IPv6 note (`lib/security/ssrfGuard.ts:109-113`), `fullPage` duplication, `MERGE_DELTA_E`, the `in`-not-`instanceof` note, the self-contained `createStateScanner` contract and the three prompt-injection notes. The technical notes' `next.config.mjs` and Dockerfile are untouched.
- **No runtime or type change**: met. Plan gate: `ok code and types identical once comments are ignored`, `ok tool-directive comments … unchanged`. My emit/printer comparison of all 49 files agrees, as described above.
- **`npm run check` passes with zero regressions**: met. Exit 0; eval 100% on all three required fixtures; `eval/baseline.json` unchanged.

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions (Low)

- **L1** `app/api/analyze/route.ts:30` — The prune removed the sentence that named `MAX_IMAGES`, so the remaining comment ("Bound the measured-lane palette merge; the AI lane applies its own, tighter cap … on top of whatever's accepted here") no longer names anything. It stands alone between two blank lines, with no declaration under it. **Why:** a reader cannot tell what is being bounded. This is a small hit to AC3's "documentation integrity". **Fix:** name the subject, e.g. "`MAX_IMAGES` (`@/lib/api`) bounds the measured-lane palette merge; the AI lane applies its own, tighter cap (…)", or move the sentence onto `MAX_IMAGES` in `lib/api.ts`.
- **L2** `lib/extract/structure/tokenLink.ts:9` — The rewritten Stage 8b header still says components are joined to the report "by exact token match". The code matches background colors by ΔE ≤ 2 (`nearestPaletteRole`, `ROLE_MATCH_DELTA_E = 2`) and gaps with a 2px tolerance (`GAP_MATCH_TOLERANCE`, `nearestScaleValue` at `:47`). Only the radius match is exact. **Why:** the plan's rubric 7 says to fix a comment that contradicts the code, and this sentence was rewritten in this change but kept the contradiction. The same file's `GAP_MATCH_TOLERANCE` doc two lines below says the opposite. **Fix:** "then to the report by the nearest palette role or scale step within a small tolerance".
- **L3** `lib/extract/mode.ts:2-3` — The condensed header says "empty input returns `fallback`" and drops the old "otherwise returns `undefined`". The one-argument overload `mode<T>(values: T[]): T` still returns `undefined` typed as `T` on empty input, and that sentence was the only warning of it. **Why:** today's callers all guard (`tokens.ts:104`, `typography.ts:196-237`), but a new one-argument caller gets an unsound `T`. **Fix:** "empty input returns `fallback`, or `undefined` (despite the one-argument overload's `T`)".
- **L4** `lib/extract/structureFromImage.ts:150` — The re-wrapped prompt-injection comment leaves one 116-column line, while the rest of the block wraps at ~80. Also, `lib/extract/structure/structureAI.ts:80-81`: removing a doc comment left two consecutive blank lines before `DigestListEntry`. **Why:** cosmetic only; the change's own diff is the only place these appear. **Fix:** re-wrap the line and drop the extra blank line.

**Noted, not a finding**: The `measured lane (§10)` string printed by `eval/run.ts:156` and the `§10` references in `expected.yaml` headers stay, because the plan scoped them out (output and test data, not comments). Deviation 1 of the implementation report (the `error` verify scenario's `console-errors.txt` holds the browser's log of the deliberately provoked 400) reproduces on unchanged `main` according to the report, and it does not bear on a comments-only diff.

## Validation Results

| Check | Status | Notes |
|-------|--------|-------|
| Build / Type Check | PASS | `npm run check` (the command CI runs) → `tsc --noEmit`, `next build` "Compiled successfully"; host; no `verify.sh` instance up |
| Warnings | NONE | `npm run check` printed no TypeScript, ESLint or Next build warnings |
| Lint | PASS | `npm run check` → `eslint .`; host |
| Tests | PASS | `npm run check` → `tsx eval/run.ts`: `clean-light`, `dark-mode`, `adversarial-shell` combined 100%, `✓ all gates passed`; the optional live entries `stripe`, `linear`, `vercel` were skipped (no committed capture, `optional: true`), as on `main`. Plan's comment gate re-run independently (`node <scratchpad>/check-comments.mjs main`): `all checks ok`, 0 references, 1957 → 1270 comment lines. Extra check (scratchpad): `transpileModule` and printer output with comments removed, `main` vs working tree, 49 files; only `catch {}` formatting in 4 files differs |
| UI verification | N/A | No rendered or behavioural change: token streams and emitted JS are identical, so the UI cannot differ. The implementer's `verify.sh` runs (`analyze-url` ×2, `tabs-downloads`, `analyze-images`, `cross-origin`, `error`) are recorded in the implementation report |

## What's Good

- The token-identity gate, with its negative controls in the plan, gives strong proof for AC3. Its own keep list also guards against deleting the security comments.
- Comments that were wrong were fixed rather than deleted: the palette header's ΔE, the harvester bucket size, the structure-emit stage number, the cross-origin `.cssRules` note, and the `deltaE` near-duplicate claim. I checked each fix against the code.
- Repeated rationales are now stated once, with short pointers elsewhere (the seed/temperature facts sit on `ModelCall.seed`; the transient-structure-failure caching rule is stated in the image path). That makes the remaining comments easier to keep true.
- The stale `pruner.ts:42-46` line citation in `squash.ts` was replaced with the `pruneAndCollapse` symbol, so it can't go stale again.

## Recommendation

Mergeable once the nits are addressed (or now, since none of them affects behaviour). `/fix-findings .agents/reviews/feature-todo-26-prune-non-essential-comments-review.md` handles L1–L4, comments only; re-run the comment gate and `npm run check` after it.
