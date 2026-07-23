# Code Review: Tailwind Theme Spike Deliverables (DIST-006)

**Scope**: Untracked changes on `feature/tailwind-theme-spike` — two new documentation files, no code:
- `.agents/plans/completed/tailwind-theme-spike-plan.md`
- `.agents/reports/tailwind-theme-spike-report.md`

**Recommendation**: APPROVE

## Summary

Reviewed the spike plan and its report for issue #7. Since the deliverable is a claims document rather than code, the review verified the report's factual claims against the codebase: every cited file/line reference, the corpus data values, and the issue's acceptance criteria. All claims verified — including replaying both eval-corpus captures through `extractFromCapture` to confirm the measured values the report quotes (spacing scale `[8,12,16,20,24,48,96]` / `baseUnitPx: 4`, absent `paletteDark` in both corpus reports, the dark-mode `mono` family, h1 = 44px/700/1.1/-0.01em, radius `8px/12px/9999px`, empty shadows, sample palette hexes, even the `capturedAt` timestamp in the sample header comment). The repo is clean: no `lib/`, `app/`, or `eval/` changes, and the eval gate passes at 100% against the untouched baseline.

## Issues Found

### Critical

None.

### High Priority

None.

### Medium Priority

1. **`npm run lint` cannot pass — no ESLint config exists in the repo.** `next lint` drops into an interactive "How would you like to configure ESLint?" prompt (no `.eslintrc*`, no `eslint.config.*`, no `eslintConfig` in `package.json`). Both the plan's Validation section and CLAUDE.md list lint as a required gate, so the plan's "`npm run lint` — must pass" claim was never satisfiable non-interactively. This is a **pre-existing repo gap**, not introduced by these files — but the spike docs repeat the claim, and it should be fixed repo-wide (commit an ESLint config) or the gate description corrected.

### Suggestions

1. **The report omits validation results.** Plan Task 5 / acceptance criterion 5 required `typecheck` + `lint` + `eval` to pass with zero baseline change, but the report never states they were run. Verified during this review: typecheck PASS, eval PASS (100%, baseline untouched), lint blocked per the medium finding above. Future spike reports should include a one-line validation section.
2. **Plan acceptance criterion 6 is worded too narrowly.** It says "Only `.agents/reports/tailwind-theme-spike-report.md` is new in the repo", but the plan file itself is also new/untracked. Committing completed plans to `.agents/plans/completed/` is the established convention (8 predecessors), so this is a wording nit, not a real violation.

## Claim Verification (spot checks)

| Report claim | Verified against | Result |
|---|---|---|
| `renderCssVariables` at `lib/emit.ts:296-338`, `cssFontName` at `:286-288`, `buildReport` spread style at `:41-55` | source | ✓ exact |
| `app/page.tsx:55` tab union, `:133-148` `downloadActiveMarkdown` | source | ✓ exact |
| `extractDarkPalette` ΔE gate at `lib/extract/palette.ts:490` | source | ✓ exact |
| Replay path `eval/run.ts:52` | source | ✓ exact |
| Issue #7 exists with the four quoted acceptance criteria; all four addressed in §1–§4 | `gh issue view 7` | ✓ |
| Spacing scale/base, `paletteDark` absent in *both* corpus reports, dark-mode `mono` family, h1/radius/shadow values, sample hexes, `capturedAt` timestamps | offline corpus replay via `extractFromCapture` | ✓ all match |
| Every measured spacing step is a multiple of `baseUnitPx` (`8→p-2` … `96→p-24`) | replayed values | ✓ |
| `tailwindcss ^4.0.0` pinned in repo | `package.json` | ✓ |
| Corpus slugs `clean-light`/`dark-mode`; `.agents/reports/motion-spike.md` precedent exists | filesystem | ✓ |

Not independently reproduced: the Tailwind fresh-project build outputs (§1.2 sub-key CSS, §1.3 shadowing behavior, §3 build log) — the scratchpad artifacts are session-scoped and gone. The report's inline excerpts are internally consistent and the claimed v4 behaviors match documented Tailwind v4 semantics; the follow-up story will re-verify them by construction.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | BLOCKED — no ESLint config in repo (pre-existing; interactive prompt) |
| Tests (`npm run eval`) | PASS — clean-light 100%, dark-mode 100%, aggregate 100%, no baseline change |

## What's Good

- **Exemplary honesty discipline.** The report flags that the `dark-mode` corpus doesn't actually carry `paletteDark` (dark-by-default site) instead of quietly pretending the dark path was exercised end-to-end, and labels the synthetic fixture as such. The omitted-fields table explains *why* each field has no honest mapping rather than hand-waving.
- **Empirically decided open questions.** Both plan-level open decisions (§1.2 sub-keys vs. parallel namespaces, §1.3 base-unit vs. positional spacing) were resolved by real builds with the failure mode demonstrated (`p-1` > `p-1.5` shadowing footgun), not by preference.
- **Every citation is accurate.** All nine file/line references resolve to exactly the code described — rare in a document this citation-dense.
- **Deviations are declared** (§Deviations), including the justified widening of `families[0]` to per-role families driven by real corpus data.
- **Scope held.** No production code leaked out of the scratchpad; eval baseline untouched, matching the DIST-005 spike precedent.

## Recommendation

APPROVE — commit both files as-is. Two follow-ups, neither blocking:

1. Open a small repo-hygiene issue for the missing ESLint config so `npm run lint` becomes a real gate.
2. Proceed with the report's §4 follow-up story (`emitTailwindTheme` in `lib/emit.ts` + download button); the mapping is fully specified and the corpus-verified claims hold.
