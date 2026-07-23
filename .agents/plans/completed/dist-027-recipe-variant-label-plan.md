# Plan: Emit recipe variants with a measured `variant` label (DIST-027)

## Summary

DIST-026 (#32, merged) already partitions each recipe element class into variant clusters keyed by resolved background palette role, but the emitted entries are indistinguishable — two `Button` entries just repeat `**Button** — …`. This plan adds an optional `variant: z.string()` field to `recipeEntrySchema`, populated in `buildRecipes` from the same bg-role-derived cluster key that formed the cluster (`primary`, `surface`, `transparent`, or the raw hex when no role matched), and renders it in `renderRecipes` as `**Button (primary)** — …`. The label is only stamped when an element class actually kept more than one variant cluster — a single-cluster class has nothing to distinguish, so its entry (and rendered line) stays byte-identical to today. No value is ever fabricated: the label is exactly the measured cluster key, with the no-background sentinel surfaced honestly as `transparent`.

## User Story

As a consumer of the report frontmatter and body
I want each recipe variant labeled by its measured background role (e.g. `Button (primary)`)
So that variants are distinguishable without inventing semantics like "secondary"

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT |
| Complexity | LOW |
| Systems Affected | design-tokens lane (recipes), schema, emit |
| GitHub Issue | #33 |

---

## Patterns to Follow

### Optional schema field (additive, never required)

```ts
// SOURCE: lib/schema.ts:162-171
export const recipeEntrySchema = z.object({
  element: recipeElementSchema,
  padding: z.string(),
  radius: z.string().optional(),
  border: z.string().optional(),
  bg: z.string().optional(),
  text: z.string().optional(),
  typeToken: z.enum(TYPE_TOKENS).optional(),
  typeWeight: z.number().optional(),
});
```

### Conditional rendering — only emit what was measured

```ts
// SOURCE: lib/emit.ts:262-275 (renderRecipes)
for (const e of recipes.entries) {
  const parts: string[] = [];
  if (e.bg) parts.push(`bg \`${e.bg}\``);
  ...
  lines.push(`- **${e.element}** — ${parts.join(" · ")}`);
}
```

### Cluster key derivation (the measured source of the label)

```ts
// SOURCE: lib/extract/recipes.ts:151-155
function variantKey(node: NodeStyle, palette: Palette): string {
  const bg = node.colors.find((c) => c.channel === "background")?.value;
  if (!bg) return NO_BACKGROUND_KEY;
  return resolveColorLabel(bg, palette);
}
```

Note: `kept` at `lib/extract/recipes.ts:213-220` is currently built from `clusters.values()`, discarding the keys. The loop needs the key alongside each cluster to stamp `variant` — iterate `clusters.entries()` instead.

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/schema.ts` | UPDATE | Add optional `variant: z.string()` to `recipeEntrySchema` |
| `lib/extract/recipes.ts` | UPDATE | Carry cluster keys through `kept`; stamp `variant` when >1 cluster survives; map `NO_BACKGROUND_KEY` → `"transparent"` |
| `lib/emit.ts` | UPDATE | Render `**Element (variant)**` when `variant` is present |

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Add `variant` to `recipeEntrySchema`

- **File**: `lib/schema.ts`
- **Action**: UPDATE
- **Implement**: Add `variant: z.string().optional(),` to `recipeEntrySchema` (after `element`, before `padding`, reading order: what it is, then which variant, then its properties). Update the doc comment above `RECIPE_ELEMENTS` (lib/schema.ts:151-157) with one sentence noting `variant` is the bg-role-derived cluster label, present only when multiple variant clusters survived.
- **Mirror**: `lib/schema.ts:165` (`radius: z.string().optional()`)
- **Validate**: `npm run typecheck`

### Task 2: Stamp `variant` in `buildRecipes`

- **File**: `lib/extract/recipes.ts`
- **Action**: UPDATE
- **Implement**:
  - Change `kept` to preserve keys: build from `[...clusters.entries()]`, filter/sort/slice on the node-array part (`c[1]`), keeping the same survivor thresholds, stable sort, and `MAX_VARIANTS_PER_ELEMENT` cap.
  - In the per-cluster loop, when `kept.length > 1`, set `entry.variant` to the cluster key, substituting `"transparent"` when the key is `NO_BACKGROUND_KEY`. When only one cluster survived, do not set `variant` at all (entry stays byte-identical to today).
  - Update the `NO_BACKGROUND_KEY` comment at lib/extract/recipes.ts:28 — it currently says "only ever a Map key, never emitted", which stops being true (it's emitted as `transparent`).
- **Mirror**: `lib/extract/recipes.ts:225-235` — conditional `entry.<field> =` assignments
- **Validate**: `npm run typecheck`

### Task 3: Render the variant label in `renderRecipes`

- **File**: `lib/emit.ts`
- **Action**: UPDATE
- **Implement**: In `renderRecipes` (lib/emit.ts:262-275), change the entry line to `- **${e.element}${e.variant ? ` (${e.variant})` : ""}** — …` so entries without `variant` render byte-identical to today.
- **Mirror**: `lib/emit.ts:271` — inline conditional suffix pattern (`e.typeWeight ? \`/${e.typeWeight}\` : ""`)
- **Validate**: `npm run typecheck && npm run lint`

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Eval regression gate (must pass with NO baseline refresh — recipes are not
# scored by eval/score.ts, so no score may move; do NOT run UPDATE_BASELINE=1)
npm run eval
```

## End-to-End Verification

Recipes need a live style dump; eval fixtures replay fine but a synthetic page proves the new label end-to-end. Write a scratch script (delete afterwards, run from project root with `npx tsx`):

1. Start a local `http.createServer` serving a small HTML page with ≥3 filled buttons (solid primary-ish bg) and ≥3 ghost buttons (transparent bg, e.g. `background: transparent; border: 1px solid`), plus enough surrounding content for a palette.
2. Drive Playwright directly like `eval/capture.ts` (or run with `SSRF_ALLOWLIST_HOSTS=localhost`), then `captureFromRender` + `extractFromCapture` from `lib/analyze.ts`.
3. Expected: the report's `recipes.entries` contains two `Button` entries, one with `variant` matching its bg role (e.g. `primary`) and one with `variant: "transparent"`; the markdown body shows `**Button (primary)**` and `**Button (transparent)**`.
4. Also assert the single-variant case: an element class with one cluster (e.g. the page's links) has entries with no `variant` key, and their rendered lines carry no parenthesized suffix.

---

## Acceptance Criteria

- [ ] `recipeEntrySchema` carries optional `variant: z.string()` (lib/schema.ts)
- [ ] Entries with `variant` render as `**Button (primary)** — …`; entries without render byte-identical to today
- [ ] Old committed captures build without errors and without a fabricated `variant`
- [ ] `npm run typecheck`, `npm run lint`, `npm run eval` all pass with no baseline refresh
