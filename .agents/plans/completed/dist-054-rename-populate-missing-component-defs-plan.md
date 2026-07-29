# Plan: Remove the misleading `populateMissingComponentDefs` alias

## Summary

`lib/extract/structure/structureAI.ts:331-333` defines `populateMissingComponentDefs`, a function whose name implies it only fills in *missing* component-map entries. Reading its body shows it is a pure one-line pass-through to `walkComponentMap` (`function populateMissingComponentDefs(node, map) { walkComponentMap(node, map); }`) — and `walkComponentMap` (lines 293-323) unconditionally mutates **existing** entries' `composition` (unions in new child names) and `instances` (sums occurrence counts), not just missing ones. The name actively misleads a reader into assuming existing entries are left untouched. It has exactly one call site (line 227) and is not exported, so the fix is a pure subtraction: delete the wrapper function and call `walkComponentMap` directly at the call site, per the issue's own preferred resolution ("removed in favor of the existing equivalent, with the single call site updated") since the "pure alias" claim is confirmed true — no divergence to preserve via a rename instead.

## User Story

As a maintainer reading the structure pipeline
I want function names that match their behavior
So that a reader doesn't assume existing component definitions are left untouched when they are in fact mutated

## Metadata

| Field | Value |
|-------|-------|
| Type | REFACTOR (naming / dead-wrapper removal) |
| Complexity | LOW |
| Systems Affected | `lib/extract/structure/structureAI.ts` only |
| GitHub Issue | #102 (DIST-054) |

---

## Patterns to Follow

### The function being removed (confirmed pure alias)

```ts
// SOURCE: lib/extract/structure/structureAI.ts:331-333
function populateMissingComponentDefs(node: PrunedNode, map: Record<string, ComponentDef>) {
  walkComponentMap(node, map);
}
```

### Its only call site

```ts
// SOURCE: lib/extract/structure/structureAI.ts:226-227
// Ensure all components used in the updated root have definitions
populateMissingComponentDefs(updatedRoot, finalComponents);
```

### The real (mutating) implementation it wraps — doc comment already accurately describes the mutate-existing behavior

```ts
// SOURCE: lib/extract/structure/structureAI.ts:286-323
/**
 * Walks the tree aggregating every occurrence of each component name into one
 * definition: instance counts sum, and composition is the *union* of child
 * names seen across all occurrences (not just the first) so the map never
 * contradicts the machine-block tree when two instances of the same
 * component have different children.
 */
function walkComponentMap(n: PrunedNode, map: Record<string, ComponentDef>) {
  const occurrences = n.instanceCount || 1;
  const childNames = n.children
    .map((c) => c.componentName)
    .filter((name) => name !== n.componentName);

  const existing = map[n.componentName];
  if (!existing) {
    map[n.componentName] = {
      type: n.provisionalType,
      composition: Array.from(new Set(childNames)),
      instances: occurrences,
    };
  } else {
    const composition = new Set(existing.composition);
    childNames.forEach((name) => composition.add(name));
    existing.composition = Array.from(composition);
    existing.instances = (existing.instances || 0) + occurrences;
  }

  n.children.forEach((c) => walkComponentMap(c, map));
}
```

### Other existing callers of `walkComponentMap` (unaffected by this change, confirms it's already the "existing equivalent" the issue points to)

```ts
// SOURCE: lib/extract/structure/structureAI.ts:325-329
export function buildFallbackComponentMap(node: PrunedNode): Record<string, ComponentDef> {
  const map: Record<string, ComponentDef> = {};
  walkComponentMap(node, map);
  return map;
}
```

### Dead-wrapper removal precedent in this repo (same shape: delete a function, update its one call site, nothing else)

```ts
// SOURCE: git show — DIST-052 (issue #100), lib/analyze.ts
// Deleted a thin wrapper function (analyzeUrlStructure) that had zero/one call
// sites, verified via repo-wide grep before and after, changed nothing else.
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/extract/structure/structureAI.ts` | UPDATE | Delete `populateMissingComponentDefs` (lines 331-333) and call `walkComponentMap` directly at its former call site (line 227) |

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Confirm the "pure alias" claim and zero other call sites before touching anything

- **File**: N/A (verification only)
- **Action**: N/A
- **Implement**: Run `grep -rn "populateMissingComponentDefs" lib app eval` and confirm exactly two matches: the definition (line 331) and the single call site (line 227). Re-read `populateMissingComponentDefs`'s body (lines 331-333) to reconfirm it does nothing beyond calling `walkComponentMap(node, map)` with the same two arguments in the same order — no filtering, no early return, no side effect of its own. This re-verifies the issue's premise and the technical note's instruction to confirm before deleting (as opposed to renaming, which would be the fallback if any divergence were found).
- **Mirror**: N/A
- **Validate**: `grep -rn "populateMissingComponentDefs" lib app eval` — expect exactly 2 matches, both in `lib/extract/structure/structureAI.ts`

### Task 2: Update the call site to call `walkComponentMap` directly

- **File**: `lib/extract/structure/structureAI.ts`
- **Action**: UPDATE
- **Implement**: At line 227, replace `populateMissingComponentDefs(updatedRoot, finalComponents);` with `walkComponentMap(updatedRoot, finalComponents);`. Leave the preceding comment (`// Ensure all components used in the updated root have definitions`, line 226) as-is — it still accurately describes the intent of the call regardless of which name invokes it.
- **Mirror**: N/A (single-line call-site swap)
- **Validate**: `npm run typecheck`

### Task 3: Remove the now-unused wrapper function

- **File**: `lib/extract/structure/structureAI.ts`
- **Action**: UPDATE
- **Implement**: Delete lines 331-333 in their entirety (`function populateMissingComponentDefs(node: PrunedNode, map: Record<string, ComponentDef>) { walkComponentMap(node, map); }`). Leave `walkComponentMap` (lines 293-323) and `buildFallbackComponentMap` (lines 325-329) untouched — both remain used exactly as before (`walkComponentMap` now has three call sites instead of two: line 227 directly, line 322 recursively, and line 327 via `buildFallbackComponentMap`).
- **Mirror**: DIST-052 (`lib/analyze.ts`) — delete a dead wrapper function in its entirety, touch nothing else in the file.
- **Validate**: `npm run typecheck`

### Task 4: Confirm zero remaining occurrences of the old name

- **File**: N/A (verification only)
- **Action**: N/A
- **Implement**: Re-run the repo-wide search from Task 1 to satisfy the issue's acceptance criterion that the function is renamed/removed.
- **Mirror**: N/A
- **Validate**: `grep -rn "populateMissingComponentDefs" lib app eval` — expect zero matches

### Task 5: Lint check

- **File**: `lib/extract/structure/structureAI.ts`
- **Action**: none expected (verification only)
- **Implement**: Run `npm run lint`. No imports change as part of this edit (both functions involved, `walkComponentMap` and the deleted wrapper, are locally defined in the same file with no import-level dependency change), so no lint findings are expected — but treat lint's output as authoritative over this prediction.
- **Mirror**: N/A
- **Validate**: `npm run lint`

### Task 6: Run the eval regression gate

- **File**: N/A (verification only)
- **Action**: N/A
- **Implement**: Run `npm run eval`. Per the issue's acceptance criteria, this must pass with `eval/baseline.json` completely untouched (`git diff --stat eval/baseline.json` shows no diff) — since `walkComponentMap`'s logic and argument order are byte-for-byte unchanged (only the name of the function invoking it changed), the emitted component map for every corpus fixture must be identical to before. Any score movement at all means real behavior changed and must be investigated before proceeding — do not run `UPDATE_BASELINE=1` to paper over a difference.
- **Mirror**: N/A
- **Validate**: `npm run eval` — expect pass, `git diff --stat eval/baseline.json` empty

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

This is a pure rename/dead-wrapper removal with no behavioral surface — the underlying logic (`walkComponentMap`) is untouched, only which name invokes it. Verification is:

1. `grep -rn "populateMissingComponentDefs" lib app eval` returns zero matches (satisfies the acceptance criterion that the misleading name no longer exists).
2. `npm run typecheck` passes — confirms the call-site swap type-checks and no other file imported the removed (never-exported) function name.
3. `npm run lint` passes — confirms no import was left unused.
4. `npm run eval` passes with `eval/baseline.json` byte-identical to `git show HEAD:eval/baseline.json` (`git diff --stat eval/baseline.json` empty) — confirms the emitted component map for every corpus fixture is unchanged, since `eval/scoreStructure.ts` scores component-map counts and this change touches zero logic inside `walkComponentMap` itself.
5. `git diff lib/extract/structure/structureAI.ts` shows exactly: one call-site line changed (line 227) and one function definition removed (former lines 331-333) — nothing else in the file touched.
6. `git status` shows no files modified other than `lib/extract/structure/structureAI.ts`.

---

## Risks

| Risk | Mitigation |
|------|------------|
| The "pure alias" claim turns out to be wrong on closer inspection (some subtle divergence between `populateMissingComponentDefs` and `walkComponentMap`) | Task 1 re-reads the wrapper body before any edit. Based on the codebase read during planning, the body is exactly `walkComponentMap(node, map);` with no other statement — if Task 1 finds otherwise, stop and switch to a rename-not-merge approach per the issue's technical note, documenting the found difference. |
| `eval/baseline.json` drifts as a side effect | Not expected — `walkComponentMap`'s logic, argument order, and mutation semantics are completely unchanged; only the name of the function that calls it changes. If `npm run eval` reports any score change, stop and investigate the cause before considering `UPDATE_BASELINE=1` (the issue explicitly calls out that any movement here must be investigated, not baselined). |
| A caller outside `lib/`, `app/`, `eval/` (docs, stale plans, PRD checklist entries) still references the old name | Out of scope per the issue's file list (`lib/extract/structure/structureAI.ts` only). Historical planning/audit docs (e.g. `.agents/stories/prd-phase-7-audit-remediation-stories.md`) are allowed to keep referencing the old name as a historical record of the defect being fixed — do not edit them. |

---

## Acceptance Criteria

- [ ] `populateMissingComponentDefs` is removed from `lib/extract/structure/structureAI.ts`; its single call site (line 227) now calls `walkComponentMap` directly
- [ ] `grep -rn "populateMissingComponentDefs" lib app eval` returns zero matches
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run eval` passes with `eval/baseline.json` byte-identical to before (no diff)
- [ ] The emitted component map for every eval corpus fixture is unchanged (verified indirectly via the eval score being unchanged)
- [ ] Only `lib/extract/structure/structureAI.ts` is modified
