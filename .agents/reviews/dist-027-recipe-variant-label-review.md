# Code Review: feature/dist-027-recipe-variant-label

**Scope**: branch `feature/dist-027-recipe-variant-label` diff vs `main` (3 files, +24/-7; uncommitted working-tree changes) — issue #33 (DIST-027)
**Recommendation**: APPROVE (with nits)

## Summary

The diff adds an optional `variant` label to recipe entries: `recipeEntrySchema` gains `variant: z.string().optional()`, `buildRecipes` stamps it from the existing DIST-026 cluster key (palette role, normalized hex, or `transparent` for the no-background sentinel) only when an element class kept more than one cluster, and `renderRecipes` renders `**Button (primary)** — …`. The change follows the repo's mandatory optional-field + conditional-render contract exactly, fabricates nothing (the label is precisely the measured cluster key), and is additive — old captures and single-variant classes produce byte-identical output. All consumers of `RecipeEntry` were checked (`lib/analyze.ts` pass-through, `lib/emit.ts` frontmatter + body); none needs further handling.

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions (Low)

1. `lib/extract/recipes.ts:229` — The `kept.length > 1` gate is an interpretation choice: a strict reading of acceptance criterion 1 ("when a variant cluster produced the entry") could label *every* entry, since post-DIST-026 every entry comes from a cluster. The chosen gate is the better product behavior (a lone variant has nothing to distinguish, and criterion 2 explicitly contemplates entries without `variant`), but it deserves the comment it has — no change requested, just noting the deliberate divergence from the most literal reading.
2. `lib/extract/recipes.ts:230` — When no palette role is within ΔE, the variant label is a raw hex (e.g. `Button (#ff6600)`); the issue's examples list only `primary`/`surface`/`transparent`. This is consistent with the codebase's "raw hex rather than fabricated role" convention for `bg`/`text`/`border`, so it is arguably the *correct* honest behavior, but worth a maintainer's eyes on whether a hex-labeled variant reads acceptably in the report body.
3. `lib/extract/recipes.ts:151-155` (pre-existing, unmodified) — a theoretically unparseable bg value that stringifies to `"none"` would merge into the no-background cluster and be labeled `transparent`; computed styles make this practically unreachable (backgrounds arrive as `rgb()`/`rgba()`), so no action needed.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | PASS |
| Eval (`npm run eval`, no baseline refresh) | PASS (clean-light 100%, dark-mode 100%, all gates) |

## What's Good

- The label is derived from the same key that formed the cluster — it can never disagree with the clustering, and `transparent` is surfaced honestly instead of leaking the `"none"` map sentinel.
- The stale `NO_BACKGROUND_KEY` doc comment ("never emitted") was updated in the same diff — a easy-to-miss consistency detail.
- `clusters.entries()` refactor preserves the survivor thresholds, stable sort, and `MAX_VARIANTS_PER_ELEMENT` cap exactly; destructured tuple params keep it readable.
- Rendering uses the same conditional-suffix idiom already present on the same line span (`typeWeight`), and unlabeled entries render byte-identical to before.
- No collision risk: `COLOR_ROLES` contains no `"none"`, and unmatched-hex keys are `#`-prefixed.

## Recommendation

Approve. Nothing blocks: the suggestions are observations, not required changes. Next step is commit + PR when the user asks for it.
