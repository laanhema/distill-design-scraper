# Code Review: feature/dist-029-page-sections-body (issue #35)

**Scope**: Branch `feature/dist-029-page-sections-body` — diff vs `main`, including uncommitted changes (`lib/extract/structure/structureEmit.ts`, +56/-17)
**Recommendation**: APPROVE

## Summary

The change reshapes the structure report's markdown body: a conditional `## Page
sections` digest block now leads, the ASCII tree is demoted to a depth-capped
`## Skeleton (detail)` with a visible `…` truncation marker, and the `## Components`
body list is filtered to `region`/`content-block`/`composite` while the machine block
keeps the full component set. The implementation is small, confined to one file,
follows the repo's conditional-omit convention, and preserves the machine contract
(`skeletonAscii` field and machine block are untouched).

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions

- **Low** — `lib/extract/structure/structureEmit.ts:47`: `BODY_COMPONENT_TYPES` is a
  `Set<string>`; typing it as `Set<OntologyType>` (imported from `../structureSchema`)
  would let `tsc` catch a misspelled ontology type at compile time. Pure hardening;
  current code is correct.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | PASS |
| Tests (`npm run eval`) | PASS (100% both fixtures, no baseline refresh — run post-change) |

## What's Good

- Single-artifact discipline: `sectionsText` is formatted once and shared between the
  body and the report field, preserving the no-drift invariant.
- The depth cap only touches the body rendering; the full-tree `skeletonAscii` field
  used by `scoreStructure` is built from a separate, uncapped call — the eval
  constraint is explicitly honored and commented.
- Truncation is visible (`└─ …`), never silent — a reader can tell the tree continues.
- Empty-output handling follows the project's omit-don't-render-empty convention for
  both `## Page sections` and (newly) `## Components`.
- Comments cite the issue/DIST id, matching house style.

## Recommendation

Approve as-is. The single suggestion is optional hardening and can be addressed or
deferred at the commit/PR step.
