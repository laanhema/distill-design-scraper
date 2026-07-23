# Plan: Stop zero-width default borders from claiming the border palette role

## Summary

`lib/extract/styleDump.ts` already gates the `border` color channel on `hasVisibleBorder(cs)` (width > 0, style ≠ none), but then captures the color unconditionally from `cs.borderTopColor`. On real sites most visible borders are single-sided (e.g. `border-bottom: 1px solid #ccc`): the top side is zero-width with the *default* border color (`currentColor` → `#000000` on dark text), so the border channel records black instead of the visible side's color. That spurious `#000000` accumulates `channels.border` counts and wins `borderScore` — and because black is usually also the text color, it has a large pixel `areaWeight`, so the `AREA_DROP_THRESHOLD` guard for the `border` role (`palette.ts:509`) doesn't save it. The fix is at the dump level (as the issue's technical note prefers, so all consumers benefit): capture the color of a side that is *actually visible* — the widest side with width > 0 and a rendered style.

## User Story

As a builder using the palette
I want the `border` role to come from borders that are actually visible
So that `#000000` from zero-width default borders doesn't get reported as the sitewide border color

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | LOW |
| Systems Affected | Design-tokens lane (style dump → palette/recipes/states) |
| GitHub Issue | #38 |

---

## Patterns to Follow

### Naming / in-page helper style

```
// SOURCE: lib/extract/styleDump.ts:110-121
function hasVisibleBorder(cs: CSSStyleDeclaration): boolean {
  const sides = [
    ["border-top-width", "border-top-style"],
    ...
  ] as const;
  return sides.some(([w, s]) => {
    return parseFloat(cs.getPropertyValue(w)) > 0 &&
      cs.getPropertyValue(s) !== "none";
  });
}
```

### Channel capture at the observation site

```
// SOURCE: lib/extract/styleDump.ts:194-197
if (hasVisibleBorder(cs)) {
  const bc = opaqueColor(cs.borderTopColor);
  if (bc) colors.push({ channel: "border", value: bc });
}
```

### Tests

No unit test framework exists (CLAUDE.md: "There is no unit test framework — `npm run eval` is the correctness gate"). Verification = `npm run eval` + a synthetic-fixture scratch script run with `npx tsx` from the project root, deleted after use (CLAUDE.md "Manually verifying extraction changes").

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/extract/styleDump.ts` | UPDATE | Capture the border color from the widest *visible* side instead of always `borderTopColor` |

No other files change: the dump **shape** is unchanged (same `NodeStyle`/channel fields), so `palette.ts`, `recipes.ts`, `states.ts` and the eval harness consume it untouched, and committed `eval/corpus/*/capture.json` fixtures stay as-is (per CLAUDE.md, captures are only re-touched when the capture *shape* changes).

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Capture border color from a visible side in `styleDump.ts`

- **File**: `lib/extract/styleDump.ts`
- **Action**: UPDATE
- **Implement**:
  - Replace `hasVisibleBorder(cs): boolean` with `visibleBorderColor(cs): string | null` (inside the same `page.evaluate` callback — remember: no imports, plain DOM APIs only). It iterates the four sides with their width/style/color property triples (`border-<side>-width`, `border-<side>-style`, `border-<side>-color`), and returns the `opaqueColor(...)` of the side with the **largest** width among sides where `width > 0` and style is neither `none` nor `hidden` (`hidden` paints nothing, like `none`). Returns `null` when no side is visible or the visible side's color is fully transparent.
  - Replace the capture site (lines 194–197) with:
    ```
    const bc = visibleBorderColor(cs);
    if (bc) colors.push({ channel: "border", value: bc });
    ```
  - Keep the existing comment style; add a one-line comment noting the color comes from the widest *visible* side so a zero-width side's default `currentColor` can't claim the channel.
- **Mirror**: `lib/extract/styleDump.ts:110-121` (side iteration) and `:186-197` (opaqueColor + channel push)
- **Validate**: `npm run typecheck && npm run lint`

### Task 2: Eval gate + synthetic-fixture verification

- **File**: n/a (verification only; scratch script created under project root and deleted after use)
- **Action**: VERIFY
- **Implement**:
  1. Run `npm run eval` — must pass **unchanged**. The fix runs at capture time, not extract time, so replaying frozen committed captures produces identical scores; **no baseline refresh** is expected or wanted (`UPDATE_BASELINE=1` must NOT be run unless eval shows an unexpected diff, which would itself be a red flag to investigate, not to bless).
  2. Synthetic fixture per the CLAUDE.md pattern: a scratch `npx tsx` script (run from project root, driving Playwright directly like `eval/capture.ts` does, since `renderUrl`'s SSRF guard blocks loopback — or use `SSRF_ALLOWLIST_HOSTS=localhost`) serving a page with:
     - an element with `border-bottom: 2px solid rgb(29, 78, 216)` only (zero-width top side, default `border-top-color` = `currentColor` → black text), and
     - an element with `border-width: 0` and an explicit `border-color: rgb(255, 0, 0)`.
     Run `collectStyleDump` (or `captureFromRender` + `extractFromCapture`) and assert: no node's `border` channel value parses to black (`#000000`) or red — the only border observation is `rgb(29, 78, 216)`, i.e. the visible side's color. Delete the script afterwards.
- **Validate**: `npm run eval`

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Regression gate
npm run eval
```

## End-to-End Verification

1. `npm run typecheck` + `npm run lint` pass.
2. `npm run eval` passes with **no baseline refresh** (score diff would mean something unintended changed — investigate, don't bless).
3. Synthetic-fixture scratch script (Task 2) shows the border channel carries the visible side's color and zero-width sides contribute nothing; script deleted after the run.

---

## Risks

| Risk | Mitigation |
|------|------------|
| `page.evaluate` callback must stay self-contained (no imports) | Reuse only `opaqueColor` and plain DOM APIs already in scope |
| Bundler `__name` rewriting of the new named function | Precedent: existing named helpers inside the same callback (`hasVisibleBorder`, `hasDirectText`, …) already rely on the `__name` passthrough shim at `styleDump.ts:90-93` — no new hazard |
| Committed eval captures still hold old bogus border values | Expected and accepted: fixtures are frozen; the fix improves *live* captures. Eval must pass unchanged — no baseline refresh |
| Multi-sided borders with different colors per side | Widest-side rule picks the most visually dominant border; strictly better than always-top |

---

## Acceptance Criteria

- [ ] Node with `border-width: 0` (all sides) + default border color contributes nothing to the border channel / `borderScore`
- [ ] Node with a single-sided visible border reports that side's measured color, not the zero-width side's default
- [ ] `npm run typecheck`, `npm run lint` pass
- [ ] `npm run eval` passes with no baseline refresh
- [ ] Synthetic-fixture verification run and scratch script deleted
