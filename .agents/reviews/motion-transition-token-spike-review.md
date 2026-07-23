# Code Review: Unstaged changes (motion-transition-token-spike)

**Scope**: Unstaged/staged changes on `feature/motion-transition-token-spike` — spike deliverable (`.agents/reports/motion-spike.md`, `.agents/reports/motion-transition-token-spike-report.md`, `.agents/plans/completed/motion-transition-token-spike-plan.md`), a PRD checkbox flip (`.agents/PRDs/PRD.md`), plus a batch of unrelated doc-hygiene changes carried on this branch: `.plan.md`/`.stories.md` → `-plan.md`/`-stories.md` renames (and the resulting cross-reference fixups in reports/plans/reviews), `AGENTS.md`/`GEMINI.md` collapsed to `@CLAUDE.md` imports, and a Prettier-style table reformat in `panorama-capture-report.md`.
**Recommendation**: APPROVE

## Summary

This is a documentation-only research spike (issue #6 / DIST-005) — no `lib/`, `eval/corpus/*`, or `app/` files are touched, confirmed via `git diff --stat`. The report is well-evidenced (concrete prototype snippets, not just assertions), honestly documents a measured/inferred boundary (JS-driven transitions correctly excluded), and lands a GO recommendation with sized follow-up stories. The unrelated renames/AGENTS.md changes riding along on this branch are cosmetic and self-consistent. One dangling path reference found (see Low).

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions
- **Dead path reference** — `.agents/reports/motion-spike.md:4` says `**Plan**: \`.agents/plans/motion-transition-token-spike-plan.md\`` (no `/completed/` segment), but the plan actually lives at `.agents/plans/completed/motion-transition-token-spike-plan.md` — confirmed the former path doesn't exist. The sibling file `.agents/reports/motion-transition-token-spike-report.md:3` gets this right. Low severity (doc-only, doesn't affect any consumer), but a one-line fix.
- Two files carry the same content under different names (`motion-spike.md` is the actual issue-#6 deliverable; `motion-transition-token-spike-report.md` is the standard plan-execution report referencing it). Not a defect — matches this repo's existing plan/report convention — but worth confirming that's intentional and not an accidental duplicate before merging, since the two now also disagree on the plan path (see above).

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | N/A — `next lint` prompts interactively for ESLint setup on this repo (pre-existing, unrelated to this branch, noted in the report) |
| Eval (`npm run eval`) | PASS — `aggregate combined: 100%`, both fixtures unchanged, all gates passed |
| Scope check (`git diff --stat -- lib/ eval/corpus app/`) | PASS — empty, confirms no extraction/schema code was touched |
| Scratch-artifact cleanup | PASS — no `motion-prototype.ts`/`motion-fixture.html` left in the tree |

## What's Good

- Honors the spike's own scope boundary precisely: report + PRD checkbox only, zero `lib/schema.ts`/`lib/emit.ts`/`eval/corpus` changes, exactly as the plan mandated.
- The measured-vs-inferred findings are backed by inline prototype evidence (actual JSON output, actual gotchas like the `cubic-bezier` comma-splitting bug and `transitionProperty` defaulting to `"all"`), not hand-waved.
- Correctly identifies that `@keyframes` piggybacks on the existing stylesheet walk (`scanRules`) rather than requiring a new page pass, and that attribution should target `recipeElementSchema` (not a color role) based on actually reading `recipes.ts`'s `classify()` — a real "checked, didn't assume" moment (Deviations §41 in the implementation report).
- Deliberately left the unrelated `distill-evaluation.md` untracked file alone rather than scooping it into this change, and said so explicitly — good scope discipline. Verified independently: that file's mtime predates the plan's creation and its content (Stripe evaluation notes) is unrelated to this spike.
- Follow-up story sizing cites and matches the actual house style in `.agents/stories/phase-4-hardening-stories.md` (Type/Priority/Complexity/Phase/Labels/Dependencies fields all present in that file).

## Recommendation

Approve as-is. Optionally fix the one dead path reference in `motion-spike.md:4` (`.agents/plans/motion-transition-token-spike-plan.md` → `.agents/plans/completed/motion-transition-token-spike-plan.md`) before merging — trivial, doesn't block. No action needed on the carried-along rename/AGENTS.md changes; they're consistent across every file that references the renamed paths.
