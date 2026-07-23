# Plan: DIST-022 — Clean up small drifts and dead code

## Summary

One sweep over six reviewed minor drifts (review ref C7 in `.agents/temp/codebase-review-fable-2026-07-23.md`): make `isNearMatch` in the repetition stage do what its comment promises, unify the AI role-refinement enum between `OUTPUT_SCHEMA` and the Zod mirror behind one source of truth, fix the `stripDataUrlPrefix` regex to accept `svg+xml`, make `aiLane.ts`'s shared-retry claim true by routing `structureAI.ts` through `retryOnce`, resolve the harvester's svg contradiction and give it a node cap mirroring `styleDump`'s `NODE_CAP`, and replace `structureFromImage.ts`'s module-level mutable `idCounter` with per-invocation state. All changes are behavior-preserving or strictly tightening; the one eval-sensitive change (`isNearMatch`) is expected to be neutral because `eval/scoreStructure.ts` never scores `varianceNote`/`instanceCount`, and the harvester runs only live (eval replays committed captures).

## User Story

As a maintainer
I want the reviewed minor drifts fixed in one sweep
So that comments match behavior and known footguns are removed before they mislead the next change.

## Metadata

| Field | Value |
|-------|-------|
| Type | REFACTOR / BUG_FIX (cleanup sweep) |
| Complexity | LOW |
| Systems Affected | structure lane (repetition, harvester, structureAI, structureFromImage), AI lane schema (interpret/schema), API route |
| GitHub Issue | #28 |

---

## Patterns to Follow

### Node cap (mirror styleDump)
```ts
// SOURCE: lib/extract/styleDump.ts:75-76, 396-397
/** Hard cap on collected nodes, to bound the payload handed back to Node. */
const NODE_CAP = 5000;
...
return page.evaluate((cap) => { ... }, NODE_CAP) as Promise<StyleDump>;
```

### Shared retry policy
```ts
// SOURCE: lib/interpret.ts:228 and lib/extract/structureFromImage.ts:191-194
const ai = await retryOnce(() => requestOnce(client, screenshots, summary));
// structureFromImage additionally passes an onError logger:
const aiRoot = await retryOnce(
  () => requestOnce(client, imageBlocks),
  (err, attempt) => console.warn(`Vision structure inference failed (attempt ${attempt}):`, err),
);
```

### Single-source enums
```ts
// SOURCE: lib/schema.ts:17-37
export const COLOR_ROLES = [ "background", "surface", "text", "primary", "accent", "muted", "border", "on-primary", "success", "warning", "danger" ] as const;
export const colorRoleSchema = z.enum(COLOR_ROLES);
```

### Graceful heuristic fallback (structure Stage 7)
```ts
// SOURCE: lib/extract/structure/structureAI.ts:41-47, 125-128
if (!apiKey) return { root, components: fallback, naming: "heuristic" };
...
console.warn("AI Structure Labeller failed, using heuristic fallback:", err);
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/schema.ts` | UPDATE | Introduce `REFINABLE_COLOR_ROLES` (the 7 refinable roles) as the single source of truth; build `COLOR_ROLES` on top of it; narrow `aiResponseSchema.roleRefinements[].role` to it |
| `lib/interpret.ts` | UPDATE | Derive `OUTPUT_SCHEMA`'s role enum and `applyRoleRefinements`' sort order from `REFINABLE_COLOR_ROLES` |
| `app/api/analyze/route.ts` | UPDATE | Fix `stripDataUrlPrefix` regex to accept `svg+xml` (and other multi-token MIME subtypes) |
| `lib/extract/structure/structureAI.ts` | UPDATE | Use `aiLaneAvailable()` + `retryOnce` so `aiLane.ts`'s shared-retry claim is true |
| `lib/extract/structure/repetition.ts` | UPDATE | Make `isNearMatch` compare child tags (80%) as its comment promises; tighten the variance-tagging comment |
| `lib/extract/structure/harvester.ts` | UPDATE | Remove the `svg` contradiction; add `NODE_CAP = 5000` mirroring `styleDump` |
| `lib/extract/structureFromImage.ts` | UPDATE | Replace module-level mutable `idCounter` with per-invocation counter state |

No files created. Dependency order: `lib/schema.ts` before `lib/interpret.ts`; the rest are independent.

---

## Tasks

### Task 1: Single source of truth for refinable color roles

- **File**: `lib/schema.ts`
- **Action**: UPDATE
- **Implement**: Split the current `COLOR_ROLES` literal: `export const REFINABLE_COLOR_ROLES = ["background", "surface", "text", "primary", "accent", "muted", "border"] as const;` (keeping the existing per-role comments where they are), then `export const COLOR_ROLES = [...REFINABLE_COLOR_ROLES, "on-primary", "success", "warning", "danger"] as const;` with the existing comments for the non-refinable tail preserved. Add `export const refinableColorRoleSchema = z.enum(REFINABLE_COLOR_ROLES);` and change `aiResponseSchema.roleRefinements[].role` from `colorRoleSchema` to `refinableColorRoleSchema`. Rationale comment: the AI lane may only permute the 7 core roles — `on-primary`/`success`/`warning`/`danger` are evidence-gated (never AI-assigned), which is why `OUTPUT_SCHEMA` in `lib/interpret.ts` mirrors this subset. Do NOT touch `swatchSchema.role` or `statesSchema`-adjacent uses (`lib/schema.ts:187`, `:268` stay `colorRoleSchema` unless they are the roleRefinements one — line 268 IS the roleRefinements role; 187 is a different field and stays).
- **Mirror**: `lib/schema.ts:17-37` (existing enum style)
- **Validate**: `npm run typecheck`

### Task 2: Derive interpret.ts enums from the shared const

- **File**: `lib/interpret.ts`
- **Action**: UPDATE
- **Implement**: Import `REFINABLE_COLOR_ROLES` from `@/lib/schema`. In `OUTPUT_SCHEMA` (lines 69-91), replace the hand-written 7-string enum array with `enum: [...REFINABLE_COLOR_ROLES]`. In `applyRoleRefinements` (lines 282-287), replace the hand-written `["background", ..., "border"] as ColorRole[]` order array with `REFINABLE_COLOR_ROLES` (same 7 values, same order — no behavior change). Keep the `as const` on `OUTPUT_SCHEMA` working (spreading a readonly tuple into an array literal is fine; drop `as const` on just that array if tsc complains, or use `[...REFINABLE_COLOR_ROLES]`).
- **Mirror**: `lib/schema.ts` usage of the const
- **Validate**: `npm run typecheck`

### Task 3: Fix stripDataUrlPrefix for svg+xml

- **File**: `app/api/analyze/route.ts` (line 48-50)
- **Action**: UPDATE
- **Implement**: Change the regex to `/^data:image\/[a-zA-Z0-9.+-]+;base64,/` so MIME subtypes containing `+`, digits, dots or dashes (`svg+xml`, `vnd.microsoft.icon`) are stripped. One-line comment noting the `+` in `svg+xml` was the original gap.
- **Validate**: `node -e 'const s=x=>x.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/,""); console.log(s("data:image/svg+xml;base64,AAAA")==="AAAA", s("data:image/png;base64,BBBB")==="BBBB", s("CCCC")==="CCCC")'` → `true true true`

### Task 4: Route structureAI through the shared retry policy

- **File**: `lib/extract/structure/structureAI.ts`
- **Action**: UPDATE
- **Implement**: Import `aiLaneAvailable, retryOnce` from `@/lib/aiLane` (alongside the existing `AI_MODEL`). Replace the inline `process.env.ANTHROPIC_API_KEY` check with `aiLaneAvailable()` (CLAUDE.md: never inline an availability check) and construct the client as `new Anthropic()` like the other two lanes. Extract the model call + JSON extraction + Zod parse (current lines ~92-116 inside the `try`) into a private `async function requestOnce(client, compactTree): Promise<AiStructureResponse | null>` that returns `null` on no-JSON-match or failed `safeParse` (same null-gate shape as `lib/interpret.ts:147-211`). In `runStructureAILabeller`, call `const parsed = await retryOnce(() => requestOnce(client, compactTree), (err, attempt) => console.warn(\`AI Structure Labeller failed (attempt ${attempt}):\`, err));` and fall back to `{ root, components: fallback, naming: "heuristic" }` when `parsed` is null. This intentionally upgrades parse-failures from "no retry" to "one repair retry" — that IS the shared policy the doc claims.
- **Mirror**: `lib/extract/structureFromImage.ts:91-129, 190-195` (requestOnce + retryOnce with onError)
- **Validate**: `npm run typecheck`

### Task 5: isNearMatch does what its comment promises

- **File**: `lib/extract/structure/repetition.ts` (lines 75-78, and the call site comment at 48-54)
- **Action**: UPDATE
- **Implement**: Implement the promised comparison: parse both signatures (`tag[a,b,c]` format from `getBaseSignature`), require equal base tags, then require ≥80% of child tags to match — compare the two child-tag lists positionally, `matches / max(lenA, lenB) >= 0.8` (two empty lists count as a match: identical bases with no children are trivially near). Update the function comment to state the actual rule. Note per the review: the near-match child is still pushed into `newChildren` (tagging, not dedup) — that is the intent; make the call-site comment at line 48 say so explicitly ("tag, don't collapse: the variant stays in the tree, labelled as a variance of the repeated group").
- **Mirror**: `getBaseSignature` at `lib/extract/structure/repetition.ts:65-73` for the signature format
- **Validate**: `npm run eval` — `eval/scoreStructure.ts` does not score `varianceNote`, so scores must be unchanged; investigate any shift, do NOT reflexively `UPDATE_BASELINE=1` (issue comment: only accept intended changes)

### Task 6: Harvester svg contradiction + node cap

- **File**: `lib/extract/structure/harvester.ts`
- **Action**: UPDATE
- **Implement**: (a) Line 90: remove `"svg"` from the skip array and drop the `&& tag !== "svg"` clause — svg is already harvested today (the clause exempted it), so this is behavior-neutral dead-code removal; keep a short comment that svg is deliberately harvested (it feeds `isImageOrSvg`). (b) Add a module-level `const NODE_CAP = 5000;` with the same "bound the payload" comment as `lib/extract/styleDump.ts:75-76`, pass it into `page.evaluate((cap) => {...}, NODE_CAP)`, and at the top of `harvestNode` return `null` once the harvested-node count has reached the cap (`if (idCounter >= cap) return null;` — `idCounter` increments only for returned nodes, so this bounds total nodes at 5000 and prunes remaining subtrees). Keep the evaluate callback self-contained (no imports — plain DOM APIs only).
- **Mirror**: `lib/extract/styleDump.ts:75-76, 396-397`
- **Validate**: `npm run typecheck`; live behavior via the E2E scratch script below

### Task 7: Per-invocation id counter in structureFromImage

- **File**: `lib/extract/structureFromImage.ts` (lines 131-151)
- **Action**: UPDATE
- **Implement**: Delete the module-level `let idCounter = 0;`. Change `toPrunedNode(node: AiVisionNode)` to `toPrunedNode(node: AiVisionNode, counter: { next: number })`, using `const id = \`img-node-${counter.next++}\`;` and passing `counter` through the `children` map. Call it from `structureFromImages` as `toPrunedNode(aiRoot, { next: 0 })`. (Fixes cross-request state: concurrent invocations shared one counter, and ids grew unboundedly across requests.)
- **Validate**: `npm run typecheck`

---

## Validation

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run eval        # regression gate — must pass with unchanged scores (no UPDATE_BASELINE)
```

## End-to-End Verification

The harvester node cap and svg handling only run against a live page, which frozen eval captures can't exercise. Verify with a scratch script (delete afterwards), run from the project root:

1. Write `/tmp/claude-…/scratchpad/harvest-cap-check.ts` (or project-root scratch file, deleted after) that:
   - starts a local `http.createServer` serving a synthetic page containing (a) an inline `<svg>` inside a card, and (b) a container with ~6000 tiny `<div>` nodes;
   - drives Playwright directly (`chromium.launch` + `page.goto`, like `eval/capture.ts` — bypassing the SSRF guard) and calls `harvestDomTree(page)`;
   - counts nodes in the returned tree and checks an `svg`-tagged node exists.
2. Expected: total harvested nodes ≤ 5000; at least one node with `tagName === "svg"`; script exits cleanly.
3. Run with `npx tsx <script>` from `/home/lauri/github/distill-design-scraper`.
4. Delete the scratch script.

The other five fixes are exercised by typecheck (enum unification, counter refactor), the Task 3 one-liner regex check, and `npm run eval` (repetition stage runs in the replayed structure pipeline).

---

## Risks

| Risk | Mitigation |
|------|------------|
| Tightening `isNearMatch` changes `varianceNote` tags on eval corpus → structure score shift | `eval/scoreStructure.ts` never reads variance; run `npm run eval` and require unchanged scores — no baseline refresh |
| Narrowing `aiResponseSchema` role enum rejects an AI response that names a semantic role | Structured outputs already constrained the model to the 7 roles (`OUTPUT_SCHEMA`), so nothing valid is lost; failure mode is the existing graceful-null fallback |
| Node cap truncates giant legitimate pages' structure tree | Mirrors the accepted `styleDump` trade-off (`NODE_CAP = 5000`); pruning is bottom-of-tree and bounded payload is the security goal (issue comment: this is the one item with security weight) |
| `retryOnce` in structureAI doubles API cost on persistent parse failure | Bounded at exactly one retry — the same accepted policy as the other two lanes |

---

## Acceptance Criteria

- [ ] All 7 tasks completed (covers the issue's 6 ACs)
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run eval` passes with no baseline refresh
- [ ] Harvester E2E scratch check passes (cap honored, svg harvested) and scratch script deleted
- [ ] Follows existing patterns (shared aiLane primitives, styleDump cap mirror, single-source enums)
