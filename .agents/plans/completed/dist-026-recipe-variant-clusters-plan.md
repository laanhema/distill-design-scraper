# Plan: Cluster recipe instances by background role before taking modals (DIST-026)

## Summary

`buildRecipes` in `lib/extract/recipes.ts` currently pools every instance of an element class (e.g. all `<button>`s sitewide) and takes one modal value per property across the whole pool. When a class has visually distinct variants (primary filled button vs. ghost button), the modals mix across variants and can produce a chimera entry that describes no real element (`Button: padding 0px, bg #e8e9ff`). The fix: before computing modals, partition each class's instances into variant clusters keyed by the instance's resolved background palette role (via the existing shared `nearestPaletteRole` from `lib/extract/roleMatch.ts`), with transparent/no-background as its own cluster; run the unchanged modal helpers per cluster; keep only significant clusters (≥3 instances or ≥15% share of the class), capped at 3 entries per class, ordered by instance count descending. No schema change — `recipesSchema.entries` is already an array with no per-element uniqueness constraint, so multiple `Button` entries are valid as-is, and `renderRecipes` in `lib/emit.ts` renders each entry independently.

## User Story

As a builder using component recipes
I want per-property modals computed within visually coherent variant clusters
So that each recipe entry describes a real set of elements instead of a chimera averaged across heterogeneous instances

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT |
| Complexity | MEDIUM |
| Systems Affected | Design-tokens lane (recipes only) |
| GitHub Issue | #32 (DIST-026) |

---

## Patterns to Follow

### The one shared role matcher (do NOT add a new inline matcher — project rule)

```ts
// SOURCE: lib/extract/roleMatch.ts:14-30
export function nearestPaletteRole(colorValue: string, palette: Palette): ColorRole | null {
  const parsed = parseColor(colorValue);
  if (!parsed) return null;
  // ... ΔE nearest swatch, null when nothing within ROLE_MATCH_DELTA_E
}
```

### Existing per-class aggregation loop to restructure

```ts
// SOURCE: lib/extract/recipes.ts:175-197
const entries: RecipeEntry[] = [];
for (const element of RECIPE_ELEMENTS) {
  const nodes = byElement.get(element);
  if (!nodes || nodes.length === 0) continue;
  const entry: RecipeEntry = { element, padding: modalPadding(nodes) };
  // radius / bg / text / border / type via modal* helpers, then entries.push(entry)
}
```

### Modal helpers — reuse unchanged (the fix is *where* they run, not *how*)

```ts
// SOURCE: lib/extract/recipes.ts:98-158
modalPadding(nodes) / modalRadius(nodes) / modalColorValue(nodes, channel) / modalType(nodes, typography)
```

### Background color semantics in the dump

```ts
// SOURCE: lib/extract/styleDump.ts:186-187
const bg = opaqueColor(cs.backgroundColor);
if (bg) colors.push({ channel: "background", value: bg });
// → a fully transparent background yields NO "background" channel entry on the node
```

### Comment style: constants documented with a doc comment stating intent

```ts
// SOURCE: lib/extract/recipes.ts:16-17
/** Max px gap between a class's modal font size and a type-scale step to call it "that token". */
const TYPE_TOKEN_MATCH_TOLERANCE_PX = 2;
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/extract/recipes.ts` | UPDATE | Cluster instances by resolved bg role before running the modal helpers; significance filter + cap + count ordering |

No schema (`lib/schema.ts`) or emit (`lib/emit.ts`) changes: multiple entries per element are already representable and rendered.

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Add the variant-clustering step to `buildRecipes`

- **File**: `lib/extract/recipes.ts`
- **Action**: UPDATE
- **Implement**:
  1. Add named constants with doc comments (mirror `TYPE_TOKEN_MATCH_TOLERANCE_PX` style):
     - `MIN_CLUSTER_INSTANCES = 3` — a cluster with at least this many instances always survives.
     - `MIN_CLUSTER_SHARE = 0.15` — smaller clusters survive only with at least this share of the class.
     - `MAX_VARIANTS_PER_ELEMENT = 3` — cap on recipe entries per element class.
  2. Add a small helper `variantKey(node: NodeStyle, palette: Palette): string`:
     - Read the node's own `background` channel value (`node.colors.find(c => c.channel === "background")`).
     - No background entry → return a sentinel key for the transparent/no-background cluster (e.g. `"none"` — it's only a Map key, never emitted).
     - Otherwise resolve via `nearestPaletteRole(value, palette)`; when a role matches, the role name is the key.
     - When no role is within ΔE, fall back to the normalized hex (`parseColor` + `hex`, falling back to the raw string if unparseable) as the key — mirrors `resolveColorLabel`'s "raw hex rather than fabricating a role" stance and keeps two distinct unmatched bg colors in separate clusters.
  3. In the `for (const element of RECIPE_ELEMENTS)` loop, replace the single-pool entry build with:
     - Group `nodes` into `Map<string, NodeStyle[]>` by `variantKey`.
     - Drop clusters with `count < MIN_CLUSTER_INSTANCES && count / nodes.length < MIN_CLUSTER_SHARE`.
     - Sort surviving clusters by count descending (ties: keep first-seen order for determinism — sort is stable in JS), take the first `MAX_VARIANTS_PER_ELEMENT`.
     - For each kept cluster, build the `RecipeEntry` exactly as today but passing the cluster's nodes to `modalPadding` / `modalRadius` / `modalColorValue` / `modalType` (helpers unchanged), and push in that order — so per-element entries are ordered by count.
  4. Update the file-top doc comment (lines 7–14) to mention the variant-clustering step.
- **Mirror**: `lib/extract/recipes.ts:175-197` (loop shape), `lib/extract/recipes.ts:126-133` (role-vs-hex fallback stance)
- **Validate**: `npm run typecheck && npm run lint`

### Task 2: End-to-end verification with a synthetic two-variant fixture (scratch script, then delete)

- **File**: scratch script under the session scratchpad (NOT committed; per CLAUDE.md, run with `npx tsx` from the project root)
- **Action**: CREATE then DELETE
- **Implement**: Follow CLAUDE.md "Manually verifying extraction changes": spin up a local `http.createServer` serving a synthetic HTML page containing two visually distinct button variants (e.g. ≥3 filled primary buttons `background:#3b5bfd; color:#fff; padding:12px 24px; border-radius:8px` and ≥3 ghost buttons `background:transparent; border:1px solid #3b5bfd; padding:8px 16px`), plus enough body text/surfaces for a sane palette. Call `renderUrl` + `captureFromRender` + `extractFromCapture` (from `lib/analyze.ts`) with `SSRF_ALLOWLIST_HOSTS=localhost`, and assert on `report.recipes`:
  - ≥2 `Button` entries;
  - each Button entry's padding is non-zero (matches its variant's real padding);
  - the filled variant's `bg` resolves to a palette role or its hex — never a value bled in from the other variant.
  Print the emitted markdown recipes section for eyeballing. Delete the script afterwards.
- **Validate**: script output shows ≥2 sane Button entries

### Task 3: Regression gate

- **File**: none
- **Action**: RUN
- **Implement**: `npm run eval` must pass with NO baseline refresh (`UPDATE_BASELINE` must not be used — the eval corpus does not score recipes, so scores should be byte-identical; any drop means an unintended side effect).
- **Validate**: `npm run eval`

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Regression gate (no baseline refresh allowed for this change)
npm run eval
```

## End-to-End Verification

1. Write the Task-2 scratch script in the session scratchpad directory; run from the project root: `SSRF_ALLOWLIST_HOSTS=localhost npx tsx <scratchpad>/verify-recipe-variants.ts`.
2. Expected: `report.recipes.entries` contains ≥2 `Button` entries, ordered by instance count, each with non-zero padding matching its own variant (e.g. `12px 24px` and `8px 16px`), the filled variant carrying a `bg` and the ghost variant carrying a `border` but no `bg`; the transparent-background ghost cluster proves the "no-background is its own cluster" path.
3. Confirm single-variant classes (e.g. TextLink) still emit exactly one entry — the clustering must be a no-op when all instances share one bg role.
4. Delete the scratch script.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Small classes vanish when every cluster is <3 instances and <15% share (only possible with >6 distinct bg keys in one class) | Accepted per spec — thresholds are explicit acceptance criteria; eval doesn't score recipes so no gate impact |
| Two near-identical bgs that both miss every palette role by ΔE split one real variant into two hex-keyed clusters | Fallback hex keying mirrors existing `resolveColorLabel` stance; count ordering + cap keeps output sane |
| Emit renders duplicate `**Button**` labels | Already valid markdown; issue explicitly expects ≥2 Button entries, no emit change requested |

## Acceptance Criteria

- [ ] Instances clustered by resolved bg palette role via existing `nearestPaletteRole`; transparent/no-bg its own cluster
- [ ] `modalPadding`/`modalRadius`/`modalColorValue`/`modalType` run per cluster, themselves unchanged
- [ ] Clusters kept only with ≥3 instances or ≥15% share; ≤3 entries per element class; ordered by count
- [ ] Synthetic two-variant fixture yields ≥2 Button entries with sane non-zero padding
- [ ] `npm run typecheck`, `npm run lint`, `npm run eval` pass with no baseline refresh
