# Plan: Replace the stale `aiApplied` field in the PRD response sample and the verify skill

## Summary

#172 replaced the boolean `meta.aiApplied` of the `POST /api/analyze` response with `meta.aiOutcome` (`AiOutcome = "applied" | "no-key" | "failed" | "not-requested"`, `lib/api.ts:12`, `lib/api.ts:24`; set in `lib/analyze.ts:308` and `:439`). Two documents that describe the current response still name the removed field: the PRD response sample (`.agents/PRDs/PRD.md:261`) and the verify skill's proof standards (`.claude/skills/verify/SKILL.md:86`; the issue cites line 84, but the line is now 86). This plan swaps the field name in both places and changes nothing else. No code changes, so typecheck, lint, build and eval never read the edited text; the check that does read it is a `grep` for the field name.

Decisions:

- **The literal in the PRD sample is `"aiOutcome": "applied"`**, which keeps the sample showing an AI-applied run, as `"aiApplied": true` did.
- **The verify skill names `aiOutcome: "applied"`**, matching the issue's acceptance criterion word for word.
- **`.agents/design-system/distill-design-system/integration/distill-theme.patch:346` is not edited.** It is a context line of a diff that was already applied to `app/page.tsx`. Editing it would stop the patch applying to its own base, and the patch is a history record, like the plans and reports. The issue's history list does not name it, so the report says so.

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT (documentation) |
| Complexity | LOW |
| Systems Affected | PRD (`.agents/PRDs/PRD.md`), verify skill (`.claude/skills/verify/SKILL.md`) |
| GitHub Issue | #208 |
| PRD Phase | N/A |
| Prototype Patch | N/A |

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `.agents/PRDs/PRD.md` | UPDATE | Line 261: `"aiApplied": true` → `"aiOutcome": "applied"` in the `/api/analyze` response sample |
| `.claude/skills/verify/SKILL.md` | UPDATE | Line 86: `` `aiApplied: true` `` → `` `aiOutcome: "applied"` `` in the proof standards |

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Fix the PRD response sample

- **File**: `.agents/PRDs/PRD.md`
- **Action**: UPDATE
- **Implement**: On line 261 replace `"aiApplied": true` with `"aiOutcome": "applied"`. Leave every other key on the line (`bannerDismissed`, `capturedAt`) and the rest of the sample as they are.
- **Mirror**: `lib/api.ts:12-25` (the `AiOutcome` union and the `aiOutcome` field of `AnalyzeMeta`)
- **Validate**: `grep -n '"aiOutcome": "applied"' .agents/PRDs/PRD.md` prints line 261, and `git diff --stat .agents/PRDs/PRD.md` shows 1 insertion, 1 deletion

### Task 2: Fix the verify skill's proof standards

- **File**: `.claude/skills/verify/SKILL.md`
- **Action**: UPDATE
- **Implement**: On line 86 replace `` `aiApplied: true` `` with `` `aiOutcome: "applied"` ``. Keep the rest of the sentence.
- **Mirror**: `.claude/skills/verify/scripts/drive.ts:138-140` (it already asserts `meta.aiOutcome`)
- **Validate**: `grep -n 'aiOutcome: "applied"' .claude/skills/verify/SKILL.md` prints line 86

### Task 3: Confirm no live document names the field

- **File**: (none; check only)
- **Action**: none (verification step)
- **Implement**: Run the grep in Validation. Every remaining hit must be under `.agents/plans/`, `.agents/reports/`, `.agents/reviews/`, `.agents/issues/`, `.agents/stories/`, or the applied design-system patch.
- **Validate**: the grep command below prints nothing

---

## Validation

```bash
# The edited text: no hit outside history records (prints nothing on success; on HEAD it prints PRD.md:261 and SKILL.md:86)
grep -rn aiApplied --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git . \
  | grep -v -E '^(\./)?\.agents/(plans|reports|reviews|issues|stories)/' \
  | grep -v -E '^(\./)?\.agents/design-system/distill-design-system/integration/distill-theme\.patch:'

# Type check
npm run typecheck

# Lint
npm run lint

# Full CI gate (typecheck → lint → build → eval)
npm run check
```

## End-to-End Verification

The edited files are documents; the app never reads them. End-to-end proof is that the documents now name a field the response carries:

1. Run the grep of Validation on HEAD first: it prints `./.agents/PRDs/PRD.md:261` and `./.claude/skills/verify/SKILL.md:86`. After Tasks 1–2 it prints nothing.
2. `grep -n 'aiOutcome' lib/api.ts` shows `aiOutcome: AiOutcome` in `AnalyzeMeta` and `"applied"` as one of the union's members, so the documented literal is a value the response can carry.
3. `git diff` shows exactly two changed lines, one per file.

No `/verify` run: no code path changes, and a `VERIFY_AI=1` run would spend model calls to prove nothing new.

## Risks

| Risk | Mitigation |
|------|------------|
| The issue cites `SKILL.md:84`; the line is now 86 | Edit by content, not line number. In scope |
| `distill-theme.patch:346` still names `aiApplied` and is not in the issue's history list | It is an applied diff (history record); editing a context line breaks the patch. Leave it and name it in the report. Out of scope |
| History records under `.agents/` (plans, reports, reviews, issues, stories) keep the old name | The issue says they are not edited. Out of scope |
| The edit changes something else in the sample | Task 1's `git diff --stat` check: one line in, one line out. In scope |

## Acceptance Criteria

- [ ] The PRD response sample shows `"aiOutcome": "applied"` in place of `"aiApplied": true`, and the rest of the sample is unchanged.
- [ ] The verify skill's proof standards name `aiOutcome: "applied"` in place of `aiApplied: true`.
- [ ] `grep -rn aiApplied` finds the field only in history records under `.agents/` (plans, reports, reviews, issues and stories files, and the applied design-system patch), which are not edited.
- [ ] `npm run check` passes.
