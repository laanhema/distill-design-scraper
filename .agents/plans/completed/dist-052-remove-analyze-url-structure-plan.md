# Plan: Remove the dead `analyzeUrlStructure` export

## Summary

`lib/analyze.ts:366-371` exports `analyzeUrlStructure`, a thin wrapper (`renderUrl` → `captureFromRender` → `extractStructureFromCapture`) with zero call sites in `lib/`, `app/`, or `eval/` — confirmed by a repo-wide grep. This is a pure subtraction: delete the function and its doc comment, then verify no import in `lib/analyze.ts` becomes orphaned as a result (it doesn't — `StructureReport`, `renderUrl`, and `captureFromRender` all remain used by other exports in the same file), and run the three validation gates. No other file changes are in scope per the issue's technical note ("Files: `lib/analyze.ts` (only)").

## User Story

As a maintainer
I want unreferenced exports removed from `lib/analyze.ts`
So that the orchestration surface reflects only entry points that are actually entry points

## Metadata

| Field | Value |
|-------|-------|
| Type | REFACTOR (dead code removal) |
| Complexity | LOW |
| Systems Affected | `lib/analyze.ts` only |
| GitHub Issue | #100 (DIST-052) |

---

## Patterns to Follow

### The function being removed

```ts
// SOURCE: lib/analyze.ts:365-371
/** Full URL path for Track B structure extraction alone or combined. */
export async function analyzeUrlStructure(url: string): Promise<StructureReport> {
  const capturedAt = new Date().toISOString();
  const render = await renderUrl(url);
  const capture = captureFromRender(render, url, capturedAt);
  return extractStructureFromCapture(capture);
}
```

### Confirmed-surviving usages of the same symbols elsewhere in the file (so no import goes orphan)

```ts
// SOURCE: lib/analyze.ts:109-115 — StructureReport still used as extractStructureFromCapture's return type
export async function extractStructureFromCapture(
  capture: Capture,
  report?: Report,
  opts?: {
    forceHeuristicNaming?: boolean
  },
): Promise<StructureReport> {
```

```ts
// SOURCE: lib/analyze.ts:188 — StructureReport also used inside analyzeImages' return type
structureReport?: StructureReport;
```

```ts
// SOURCE: lib/analyze.ts:343-344 — captureFromRender (and renderUrl at line 343) still used by analyzeUrl
const render = await renderUrl(url);
const capture = captureFromRender(render, url, capturedAt);
```

### Doc-comment removal precedent (dead-code removal that also dropped its header comment)

```ts
// SOURCE: git show e07fc17 -- lib/ingest.ts (DIST-051, "remove unused fullPageShot capture")
// That commit deleted both the field and the comment block describing it — no partial removal
// left a dangling doc comment referencing removed code.
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/analyze.ts` | UPDATE | Delete the dead `analyzeUrlStructure` export (function body + its doc comment, lines 365-371) |

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Confirm zero external call sites before touching anything

- **File**: N/A (verification only)
- **Action**: N/A
- **Implement**: Run `grep -rn "analyzeUrlStructure" lib app eval` (excluding `.next/` build artifacts, which are generated and out of scope) and confirm the only source hit is the definition in `lib/analyze.ts`. This re-verifies the issue's premise before deleting.
- **Mirror**: N/A
- **Validate**: `grep -rn "analyzeUrlStructure" lib app eval` — expect exactly one match (the definition itself)

### Task 2: Remove the `analyzeUrlStructure` export

- **File**: `lib/analyze.ts`
- **Action**: UPDATE
- **Implement**: Delete lines 365-371 (the `/** Full URL path for Track B structure extraction alone or combined. */` doc comment and the `analyzeUrlStructure` function body) in their entirety. Leave the trailing newline/EOF structure of the file otherwise intact — `analyzeUrl` (ending at line 363) becomes the last export in the file.
- **Mirror**: `git show e07fc17 -- lib/ingest.ts` (DIST-051) — same shape of change: delete a dead field/function and its doc comment together, nothing else.
- **Validate**: `npm run typecheck`

### Task 3: Verify no orphaned imports

- **File**: `lib/analyze.ts`
- **Action**: UPDATE (only if lint actually flags something — expected: no changes needed)
- **Implement**: Run `npm run lint`. Per the issue's technical note, this is the mechanism that would catch an import (e.g. `StructureReport`) that's no longer used anywhere else in the file. Based on the codebase read during planning, `StructureReport` (used by `extractStructureFromCapture` and `analyzeImages`), `renderUrl`/`RenderResult` (used by `captureFromRender` and `analyzeUrl`), and `captureFromRender` itself (used by `analyzeUrl`) all remain referenced elsewhere in the file, so no import should need removal — but treat lint's output as authoritative over this prediction. If lint does flag an unused import, remove only that import line.
- **Mirror**: N/A
- **Validate**: `npm run lint`

### Task 4: Confirm zero remaining occurrences repo-wide

- **File**: N/A (verification only)
- **Action**: N/A
- **Implement**: Re-run the repo-wide search from Task 1 to satisfy acceptance criterion 1.
- **Mirror**: N/A
- **Validate**: `grep -rn "analyzeUrlStructure" lib app eval` — expect zero matches

### Task 5: Check CLAUDE.md / PRD "Orchestration entry points" text for stale references

- **File**: `CLAUDE.md`, `.agents/PRDs/PRD.md`
- **Action**: none expected (verification only, per issue AC 2 and the technical note's file scope of `lib/analyze.ts` only)
- **Implement**: `CLAUDE.md`'s "Orchestration entry points" subsection (`## Architecture` → `### Orchestration entry points (lib/analyze.ts)`) was already read during priming and names only `extractFromCapture`, `extractStructureFromCapture`, `enrichWithAI`, `analyzeUrl`, and `analyzeImages` — it never mentions `analyzeUrlStructure`, so no edit is needed there. `.agents/PRDs/PRD.md` has no "Orchestration entry points" section at all (confirmed via grep); its only `analyzeUrlStructure` mention is a Phase 7 audit-findings checklist line (line 371, `- [ ] **Dead export:** ...`) documenting the defect this issue fixes. The issue's technical note scopes files to `lib/analyze.ts` only, and sibling completed audit items (e.g. the DIST-051 fullPageShot line 370) were left unchecked in PRD.md after their own fixes shipped, so leave this checklist line as-is — do not check it off or edit PRD.md as part of this task.
- **Mirror**: N/A
- **Validate**: Visual confirmation only; no command

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Eval (extraction regression gate — must pass unchanged, eval/baseline.json untouched)
npm run eval
```

## End-to-End Verification

This is a pure dead-code deletion with no behavioral surface — nothing to exercise live. Verification is:

1. `grep -rn "analyzeUrlStructure" lib app eval` returns zero matches (acceptance criterion 1).
2. `npm run typecheck` passes — confirms no other file imported the removed export (a TS compile error would surface any missed caller instantly, since `import { analyzeUrlStructure }` anywhere would now fail to resolve).
3. `npm run lint` passes — confirms no import in `lib/analyze.ts` was left unused after the deletion.
4. `npm run eval` passes with `eval/baseline.json` unchanged (`git diff --stat eval/baseline.json` shows no diff) — confirms the measured extraction lanes (`extractFromCapture`, `extractStructureFromCapture`, which the deleted function merely wrapped) are unaffected, since the eval harness calls those directly and never through `analyzeUrlStructure`.
5. `git diff lib/analyze.ts` shows only a deletion (no other lines touched) and `git status` shows no other files modified.

---

## Risks

| Risk | Mitigation |
|------|------------|
| An import (`StructureReport`, `renderUrl`, `captureFromRender`, etc.) becomes unused after deletion and trips `npm run lint`'s unused-import rule | Already checked during planning — every import in `lib/analyze.ts` used by `analyzeUrlStructure` is also used by another surviving export. If lint disagrees, remove only the flagged import line (Task 3) — in scope. |
| A caller outside `lib/`, `app/`, `eval/` (e.g. a script in `.agents/`, a stale build artifact, or documentation) still references the name | Grep confirmed hits in `.agents/plans/completed/dist-013-...md`, `.agents/reviews/dist-013-...md`, `.agents/stories/prd-phase-7-audit-remediation-stories.md`, and `.next/server/...` (build output). These are historical/generated artifacts, not source — out of scope per the issue's explicit file list (`lib/analyze.ts` only) and per AC 1's phrasing ("the codebase," read as source, not build output or historical planning docs). Do not edit them. |
| `eval/baseline.json` drifts as a side effect | Not expected — this change touches no extraction logic, only removes an unused wrapper function. If `npm run eval` reports any score change, stop and investigate before considering `UPDATE_BASELINE=1`; a pure deletion should never change eval output. |

---

## Acceptance Criteria

- [ ] `analyzeUrlStructure` function and its doc comment are removed from `lib/analyze.ts`
- [ ] `grep -rn "analyzeUrlStructure" lib app eval` returns zero matches
- [ ] No orphaned imports remain in `lib/analyze.ts` (lint-clean)
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run eval` passes with `eval/baseline.json` unchanged
- [ ] CLAUDE.md and PRD.md require no edits (confirmed, not just assumed)
- [ ] Only `lib/analyze.ts` is modified
