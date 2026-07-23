# Plan: Route nav `<button>`s to NavItem instead of the Button recipe (DIST-025)

## Summary

Nav dropdown-trigger `<button>`s (unstyled, `padding: 0`) currently land in the sitewide Button recipe because `classify()` in `lib/extract/recipes.ts` routes every `tag === "button"` to `Button` before any nav check runs. This pollutes the Button recipe's modal padding/background (the observed `Button: padding 0px` bug). The fix: check `inNav` for `<button>`s (and button-like `<input>`s) *before* the generic Button routing, mirroring the existing `<a inNav>` → NavItem rule. No `styleDump.ts` change is needed — the dump walk already stamps `inNav: true` on **every** node with a `nav`/`[role="navigation"]` ancestor (`lib/extract/styleDump.ts:269`), not just links; verified that button nodes in a nav do carry the flag.

## User Story

As a builder using the Button recipe
I want nav dropdown-trigger `<button>`s classified as NavItem
So that unstyled nav triggers stop polluting the sitewide Button recipe

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | LOW |
| Systems Affected | Design-tokens lane — recipes stage only (`lib/extract/recipes.ts`) |
| GitHub Issue | #31 (DIST-025) |

---

## Patterns to Follow

### Existing nav-routing precedent (the rule to mirror)

```ts
// SOURCE: lib/extract/recipes.ts:19-27
function classify(node: NodeStyle): RecipeElement | null {
  if (node.tag === "button") return "Button";
  // <input type="submit"|"button"> renders and behaves like a Button (styleDump.ts
  // only marks `interactive` true for those two input types, never plain text fields).
  if (node.tag === "input" && node.interactive) return "Button";
  // A link inside primary nav gets its own recipe — check before the generic
  // <a> fallthrough below, or every nav link would be swallowed as a TextLink.
  if (node.tag === "a" && node.inNav === true) return "NavItem";
  if (node.tag === "a") return "TextLink";
```

### `inNav` source of truth (already covers buttons — no change needed)

```ts
// SOURCE: lib/extract/styleDump.ts:55-58 (type) and :269 (walk)
/** True when the node has an ancestor matching `nav` or `[role="navigation"]` … */
inNav?: boolean;
…
if (el.closest('nav, [role="navigation"]')) record.inNav = true;
```

### Ordering-comment convention

Order-sensitive branches in this file carry an explanatory comment (see `classify()`'s `<a inNav>` comment and the `pick()`-order note in `palette.ts`). The new nav check must sit **before** the two Button branches and say why.

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/extract/recipes.ts` | UPDATE | Route `inNav` buttons (and button-like inputs) to NavItem before the generic Button branches |

No schema change (NavItem already exists in `RECIPE_ELEMENTS`, `lib/schema.ts:158`). No emit change (NavItem already renders). No styleDump change (see Summary). No eval fixture change — verified neither committed capture (`eval/corpus/*/capture.json`) contains a `<button>` with `inNav`, so eval scores must be byte-identical; per CLAUDE.md, do **not** refresh fixtures or baseline.

---

## Tasks

### Task 1: Reorder `classify()` to route nav buttons to NavItem

- **File**: `lib/extract/recipes.ts`
- **Action**: UPDATE
- **Implement**: In `classify()` (lines 19-36), before the `if (node.tag === "button")` branch, add a nav check that routes both `<button inNav>` and `<input interactive inNav>` to `"NavItem"`. Simplest faithful shape:

  ```ts
  const isButtonLike = node.tag === "button" || (node.tag === "input" && node.interactive);
  // A dropdown-trigger <button> inside primary nav is a NavItem, not a Button —
  // check before the generic Button branches below, or unstyled nav triggers
  // (padding 0, transparent bg) would skew the sitewide Button recipe's modes.
  if (isButtonLike && node.inNav === true) return "NavItem";
  if (isButtonLike) return "Button";
  ```

  Keep the existing `<a>` branches untouched. Preserve the existing comment about `<input type="submit"|"button">` (attach it to the `isButtonLike` definition).
- **Mirror**: `lib/extract/recipes.ts:24-27` — the `<a inNav>` precedent and its ordering comment.
- **Validate**: `npm run typecheck && npm run lint`

### Task 2: End-to-end verification against a synthetic fixture

- **File**: scratch script in the session scratchpad directory (NOT in the repo; delete after use)
- **Action**: CREATE (temporary)
- **Implement**: Per CLAUDE.md "Manually verifying extraction changes": start a local `http.createServer` serving a synthetic page whose `<nav>` contains 3 unstyled dropdown-trigger `<button>`s (`padding: 0`, transparent background) plus 2 real styled page buttons (e.g. `padding: 12px 24px`, solid brand background). Drive Playwright directly (like `eval/capture.ts` does) or run with `SSRF_ALLOWLIST_HOSTS=localhost`, then run `captureFromRender` + `extractFromCapture` from `lib/analyze.ts` and inspect `report.recipes`:
  - Button recipe padding must be `12px 24px` (the real buttons' value), not `0px`.
  - Button recipe `bg` must resolve to the brand color role, not transparent.
  - NavItem recipe must exist and absorb the nav triggers (alongside any nav links).
  Run with `npx tsx` **from the project root**.
- **Validate**: script output shows the above; then delete the script.

---

## Validation

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run eval        # must pass with NO baseline refresh (fixtures contain no nav buttons)
```

## End-to-End Verification

Covered by Task 2: synthetic local-server fixture with nav dropdown `<button>`s + real page buttons → `extractFromCapture` → assert Button recipe reflects only the real buttons and NavItem absorbs the nav triggers. Expected outcome: `Button` entry `padding: "12px 24px"`, `bg` = brand role; `NavItem` entry present.

---

## Risks

| Risk | Mitigation |
|------|------------|
| A styled nav CTA button (e.g. "Sign up" in the header nav) also moves to NavItem, changing some sites' Button recipe | Accepted by design — the issue explicitly wants parity with the `<a inNav>` behavior; the NavItem class is the correct home for anything in primary nav |
| Eval score drift | Verified: neither committed capture has an `inNav` button, so classification output is unchanged for the corpus; `npm run eval` must pass with no baseline update |

## Acceptance Criteria

- [ ] `<button>` inside a nav is routed to NavItem by `classify()`, matching `<a inNav>` behavior
- [ ] `styleDump.ts` confirmed to stamp `inNav` on nav buttons (already true — no code change)
- [ ] Synthetic-fixture verification: Button recipe padding/background reflect only real buttons
- [ ] `npm run typecheck`, `npm run lint`, `npm run eval` pass with no baseline refresh
