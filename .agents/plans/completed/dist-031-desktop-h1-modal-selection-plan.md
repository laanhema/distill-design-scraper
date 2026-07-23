# Plan: Desktop h1 Modal Selection Fix (DIST-031)

## Summary

On pages with one large hero h1 and many smaller h1-styled elements, the desktop type scale reports the wrong `h1` size (e.g. Stripe: 26px desktop vs 34px mobile — inverted). Root cause: `extractTypography` (`lib/extract/typography.ts`) clusters **all** text nodes by rounded font size, tag-agnostic, and `pickSpread` favours the most *frequent* sizes above body — so a one-off hero h1 loses its cluster slot to a frequently-used smaller size, and the bottom-up token assignment lands `h1` on the smaller cluster. The mobile pass, by contrast, measures `document.querySelector("h1")` directly (`lib/ingest.ts:117-128`), so it sees the real hero. Fix: anchor the desktop `h1` token to the measured size of actual `<h1>`-tagged dump nodes (`NodeStyle.tag` already exists), force-including that size cluster in the heading picks; everything else stays frequency-based.

## User Story

As a builder trusting the typography scale
I want the desktop h1 size to reflect the page's actual primary heading
So that the report doesn't invert desktop/mobile sizes

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | MEDIUM |
| Systems Affected | Design-tokens lane (typography extraction), eval gate |
| GitHub Issue | #37 |

---

## Patterns to Follow

### Existing heading-token assignment (the code being fixed)

```
// SOURCE: lib/extract/typography.ts:140-152
// Headings: up to four distinct larger clusters. Tokens are assigned from the
// bottom up — the largest heading is `h1`, stepping down to h2/h3 — and the
// extra `display` slot is only used when there is a *fourth*, even larger
// cluster above h1. So a page with three heading sizes reads as h1/h2/h3, not
// display/h1/h2.
const headingTokens: TypeToken[] = ["display", "h1", "h2", "h3"];
const chosenAbove = pickSpread(above, bySize, 4).sort((a, b) => b - a);
const usedTokens = headingTokens.slice(headingTokens.length - chosenAbove.length);
```

### Tag field already on every dump node

```
// SOURCE: lib/extract/styleDump.ts:24-25,236
export interface NodeStyle {
  tag: string;   // el.tagName.toLowerCase()
```

### Existing mode() helper for representative values

```
// SOURCE: lib/extract/typography.ts:66-80
/** Most frequent value in a list, with a fallback for the empty case. */
function mode<T>(values: T[], fallback: T): T { ... }
```

### Mobile heading measurement (the "correct" counterpart)

```
// SOURCE: lib/ingest.ts:116-128
async function measureHeadingSizesPx(page: Page): Promise<Record<string, number>> {
  // document.querySelector("h1") → computed fontSize — first real h1 element
```

### Measured-never-faked invariant (CLAUDE.md)

An absent signal → omitted field, never a guessed one. If no `h1`-tagged
samples exist (e.g. h1 text nested in child spans), keep today's behaviour —
no fabrication.

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/extract/typography.ts` | UPDATE | Anchor the `h1` token to measured `<h1>`-tag node sizes |

No schema change, no emit change, no eval fixture change (capture shape unchanged — `tag` is already in committed captures).

---

## Tasks

### Task 1: Collect h1-tagged size samples in `extractTypography`

- **File**: `lib/extract/typography.ts`
- **Action**: UPDATE
- **Implement**: In the existing `for (const node of dump.nodes)` loop (line 102), additionally collect `h1Sizes: number[]` — the rounded size of every node with `node.tag === "h1"` that passes the same `node.type` / 6–200px guards (so the sample always has a `bySize` bucket).
- **Mirror**: `lib/extract/recipes.ts:37-47` — tag-based classification off the same dump.
- **Validate**: `npm run typecheck`

### Task 2: Force-include the h1-tag size in the heading picks

- **File**: `lib/extract/typography.ts`
- **Action**: UPDATE
- **Implement**: After `pickSpread(above, bySize, 4)` (line 146), compute the representative h1-tag size: `mode(h1Sizes)` with ties broken toward the **larger** size (hero over small outlier). If it is defined, `> bodySize`, and not already in `chosenAbove`: append it, re-rank by bucket frequency **keeping the h1-tag size pinned**, and truncate back to 4. The existing bottom-up token assignment then lands `h1` on the real hero cluster. Update the comment block at lines 140-144 to document the anchoring rule. When `h1Sizes` is empty, behaviour is byte-identical to today.
- **Mirror**: `lib/extract/typography.ts:66-80` (`mode`), `174-182` (`pickSpread` frequency ranking).
- **Validate**: `npm run typecheck && npm run lint`

### Task 3: Eval gate

- **File**: `eval/baseline.json` (only if a score change occurs)
- **Action**: UPDATE (conditional)
- **Implement**: Run `npm run eval`. Both fixtures (clean-light, dark-mode) have a single hero h1 that is already the largest cluster, so scores should be unchanged. If a score *does* change, verify the change is the intended result, then refresh deliberately: `UPDATE_BASELINE=1 npm run eval`.
- **Validate**: `npm run eval` passes.

### Task 4: Synthetic-fixture verification (then delete the scratch script)

- **File**: scratch script at project root (deleted after use)
- **Action**: CREATE + DELETE
- **Implement**: Per CLAUDE.md "Manually verifying extraction changes": local `http.createServer` serving HTML with (a) one hero `<h1>` at 60px, (b) ~6 elements styled at 26px (frequent, above body 16px), (c) body paragraphs at 16px, (d) `@media (max-width: 480px) { h1 { font-size: 34px } }`. Drive `renderUrl` + `captureFromRender` + `extractFromCapture` (`lib/analyze.ts`) with `SSRF_ALLOWLIST_HOSTS=localhost`, run via `npx tsx` **from the project root**. Assert: `typography.scale` has `h1.sizePx === 60` (not 26) and `h1.sizePxMobile === 34` → desktop ≥ mobile. Also run a no-h1-tag variant (h1 text wrapped so no direct-text h1 node exists) and assert the old frequency behaviour is retained (no crash, no fabricated size). Delete the script afterwards.
- **Validate**: assertions pass; `git status` shows no scratch file left behind.

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Tests (the correctness gate — no unit test framework)
npm run eval
```

## End-to-End Verification

1. `npm run eval` passes unchanged (or baseline deliberately refreshed per Task 3).
2. Synthetic fixture (Task 4): report's h1 = hero size (60px), `sizePxMobile` = 34px → no inversion; acceptance criteria 1 & 2 of issue #37 demonstrated on an equivalent fixture.
3. `git status` clean of scratch scripts.

---

## Acceptance Criteria

- [ ] All tasks completed
- [ ] Type check passes
- [ ] Lint passes
- [ ] `npm run eval` passes (baseline refreshed only if the change is intended)
- [ ] Desktop h1 reflects the dominant/hero heading on the synthetic fixture (issue AC 1)
- [ ] Desktop ≥ mobile for h1 on the fixture (issue AC 2)
- [ ] No-h1-tag pages keep today's frequency-based behaviour (measured-never-faked)

## Risks

| Risk | Mitigation |
|------|------------|
| h1 text nested in child elements → no h1-tagged samples | Fall back to current behaviour; no fabricated size |
| Multiple h1s of different sizes | Representative = mode, ties → larger (hero, not outlier) |
| Forced cluster displaces a legitimate frequent heading size | Pin only the h1 size; remaining 3 slots stay frequency-ranked |
| Eval fixture scores shift | Fixtures have single hero h1s (expected no-op); if a shift occurs, refresh baseline deliberately per CLAUDE.md workflow |
