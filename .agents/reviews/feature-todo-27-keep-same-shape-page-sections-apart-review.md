# Code Review: feature/todo-27-keep-same-shape-page-sections-apart

**Scope**: branch `feature/todo-27-keep-same-shape-page-sections-apart` vs merge base `e6ee0cb` (no commits on the branch; all changes uncommitted), checked against issue #218
**Recommendation**: APPROVE

## Summary

Reviewed `lib/extract/structure/repetition.ts`, `lib/extract/structure/sections.ts`, `docs/architecture/structure-lane.md`, `docs/architecture/eval.md` and `eval/baseline.json` in full, plus the callers of `detectRepetition` (`index.ts:84`, `responsive.ts:80`) and the other `findDigestBands` consumer (`structureAI.ts:91`). The untracked plan, prototype patch and implementation report were read as context and match the code. `.agents/issues/todo-issues.md` (modified) and `.lavish/` (untracked) are the owner's unrelated changes and were left out. Stage 5 now computes the band ids once with `findDigestBands` and skips them in the sibling collapse. That is the smaller of the two directions the issue proposes, and the change is correct and minimal.

Acceptance criteria:
- **Two same-shape sibling sections stay two nodes and two digest entries: met.** A scratch run of `extractStructureFromCapture` on the `saas-landing` capture lists the sections `SiteHeader, Hero, GridSection, Section (SectionCard ×6), Section (SectionCard ×3), Section (Details ×3), SiteFooter`, with no `instances` on any band.
- **Real repeated content still collapses: met.** The same run shows the card grids `SectionCard ×6` and `×3`, the logo cloud `Image ×6`, FAQ `Details ×3`, nav `TextLink ×4` and footer columns `SectionCard ×2`. The other three fixtures produce byte-identical structure reports before and after the fix (pre-fix tree in a throwaway worktree at `HEAD`).
- **`saas-landing` scores 1.00 with `expected.yaml` unchanged, and the baseline is refreshed: met.** `npm run eval` prints `saas-landing combined 100%`. `git diff` shows no change under `eval/corpus/`, and `eval/baseline.json` goes from 0.9571 to 1.
- **`clean-light`, `dark-mode`, `adversarial-shell` keep their scores: met.** All three stay at 100%, and their reports are byte-identical.
- **The responsive diff still aligns: met.** `responsive.ts:80` calls the same `detectRepetition`, so secondary harvests get the same exemption. The restored pricing band carries `CardGrid: 390px grid · 1col → 768px grid · 2col → 1440px grid · 3col`.
- **`npm run check` passes: met.** See Validation Results.

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions (Low)
None

**Noted, not a finding**:
- `eval/corpus/saas-landing/expected.yaml:8-15` still says the spec "scores below 1.00 on purpose" because Stage 5 collapses the two sections, and that is no longer true. AC 3 requires the file to stay unchanged, so no fix can meet both. Rewording the comment is left to the owner (plan Open Question 2).
- `sections.ts:186-187` and `structureAI.ts:94-96` (band `instanceCount` → `instances`) can no longer run on the URL path. The owner decided to keep the optional schema field and these branches (issue comment, "Owner decisions").
- These are scoped out in the plan's Risks table. A page with no `<main>` keeps today's collapse. A model rename to `MainContent` on a page without `<main>` can make Stage 5 and Stage 9 resolve different bands, and the worst case is the pre-fix behavior. A `<main>` holding N identical `<article>`s now lists N digest entries, and the Stage 5 contract in `structure-lane.md:10` documents this.

## Validation Results

| Check | Status | Notes |
|-------|--------|-------|
| Build / Type Check | PASS | `npm run check` (steps `tsc --noEmit`, `next build`); host, Node 22; no `verify.sh` instance up (checked with `pgrep` and the `prebuild` guard) |
| Warnings | NONE | No warning lines in the `npm run check` output |
| Lint | PASS | `npm run check` (step `eslint .`); host |
| Tests | PASS | `npm run check` (step `npm run eval`): 4 of 4 required sites at 100%, `✓ all gates passed`. `stripe`, `linear`, `vercel` are skipped as optional live entries with no capture (pre-existing, by design). Also a scratch before/after structure diff over the four captures (outside the repo, deleted afterwards) |
| UI verification | N/A | No UI code changed. The extraction output change was checked through the scratch run and the eval gate |

## What's Good

- It reuses `findDigestBands` instead of a second definition of a band, so the collapse, the Stage 7 prompt and the Stage 9 digest share one source, and the docs say so.
- The public `detectRepetition` signature stays the same, so Stage 7b gets the exemption without any change to `responsive.ts`.
- The plan measured why a deeper tag signature fails AC 1, and `structure-lane.md` records that reasoning.
- The baseline refresh is deliberate and limited to `saas-landing`, and `expected.yaml` was not edited to fit the output.

## Recommendation

Ready to merge. After merging, the owner may reword the stale defect comment in `eval/corpus/saas-landing/expected.yaml` in a follow-up.
