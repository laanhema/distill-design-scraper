# Code Review: feature/image-palette-semantic-swatches (issue #15)

**Scope**: Diff of branch `feature/image-palette-semantic-swatches` against `main`, including uncommitted changes — one modified file, `lib/extract/imagePalette.ts` (+5/−16). Untracked `.agents/` plan/report artifacts and a pre-existing `.agents/temp/temp.txt` are process artifacts, not reviewed code.
**Recommendation**: APPROVE (with one low-severity nit)

## Summary

The change deletes the "fill remaining required roles" loop that iterated all of `COLOR_ROLES` and stamped unassigned roles (`muted`, `border`, `on-primary`, `success`, `warning`, `danger`) with arbitrary leftover pixel clusters — falling back to `clusters[0]`, which duplicated already-assigned hexes. Unassigned roles are now omitted, matching the URL-lane behavior (`lib/extract/palette.ts:506-509` skips unassigned roles) and the schema's own contract (`lib/schema.ts:29-34`: semantic roles "assigned only on strong evidence … never synthesized"). The now-dead `COLOR_ROLES` value import and `ColorRole` type import were correctly removed. This is a minimal, correct, delete-only fix that directly satisfies issue #15's acceptance criteria via the review-recommended "omit outright" option.

Downstream safety was verified against every consumer: `renderPalette` and `renderCssVariables` in `lib/emit.ts` iterate `palette.colors` (absent role ⇒ absent line, absent CSS variable); the contrast-pair block in `imagePalette.ts:202-203` already guards with `find(...)`; `applyRoleRefinements` in `lib/interpret.ts` only relabels existing hexes; `app/page.tsx:383` keys swatches by role, which remains unique. No code path requires the removed roles.

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions (Low)
1. `lib/extract/imagePalette.ts:195-198` — The new comment's parenthetical "(muted, border, on-primary, success, warning, danger)" reads as an exhaustive list of omittable roles, but `surface`/`text`/`primary`/`accent` can also legitimately end up omitted when their heuristics find no distinct cluster (e.g. the highest-contrast cluster was already claimed as `surface`, so `text` is skipped at line 149). Consider rewording to "e.g. muted, border, and the semantic states" or dropping the parenthetical, so the comment doesn't overpromise which roles are always present.

### Out of scope (pre-existing, noted for future issues)
- `lib/extract/imagePalette.ts:110` (`clusters[0]` for background) and `:140` (`bestTextCluster = clusters[0]`) would throw/misbehave on an all-transparent image — pre-existing, untouched by this diff, and flagged for the DIST-015/DIST-016 work in the same file.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | UNRUNNABLE — repo has no ESLint config; `next lint` opens its interactive setup wizard. Pre-existing repo-wide condition, unrelated to this diff. |
| Tests (`npm run eval`) | PASS unchanged — clean-light 100%, dark-mode 100%, aggregate 100%, all gates passed; baseline untouched (correct, since eval replays URL captures that never enter `imagePalette.ts`). |

## What's Good

- Exactly the fix the issue asked for, at minimal diff size — deliberately delete-only so DIST-015/DIST-016 (same file) rebase trivially.
- Restores the project's core "measured, never faked" invariant and aligns the image lane with the URL lane's omission semantics.
- Replacement comment cites the invariant and the schema section (§P5-1), preserving the codebase's documentation style.
- Dead imports cleaned up in the same change.

## Recommendation

Approve. The Low nit is optional wording polish; no functional changes required. Next step: commit and open a PR when the user asks (per the project's git policy), then `/issue-done 15` after merge.
