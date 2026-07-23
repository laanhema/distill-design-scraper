# Plan: Omit spacing/radius scales when nothing was observed (DIST-010)

## Summary

`extractSpacing` and `extractRadius` in `lib/extract/tokens.ts` currently fall back to hardcoded default scales (`[4, 8, 16, 24, 32, 48, 64]` at line 96, `["4px","8px","16px","9999px"]` at line 143) stamped `provenance: "measured"` when the style dump contained no observable values. This violates the project's "measured, never faked" contract: an unmeasured lane must be omitted, not defaulted. Fix: make both extractors return `undefined` when their observed scale is empty, make `ExtractedTokens.spacing`/`.radius` optional, and let the already-optional plumbing (`buildReport` input fields are `spacing?`/`radius?`, `renderSpacing`/`renderRadius`/CSS-variables blocks are all gated on `if (report.spacing)`/`if (report.radius)`) do the rest. No schema, emit, or downstream changes needed — all consumers already optional-chain.

## User Story

As a report consumer
I want spacing and radius sections to appear only when actually measured
So that hardcoded default scales are never emitted with `provenance: "measured"` when nothing was observed.

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | LOW |
| Systems Affected | design-tokens lane (`lib/extract/tokens.ts`), orchestration (`lib/analyze.ts`) |
| GitHub Issue | #16 |

---

## Patterns to Follow

### Optional-lane omission (the contract this fix restores)

```ts
// SOURCE: lib/emit.ts:47-48 — buildReport already spreads conditionally
...(input.spacing ? { spacing: input.spacing } : {}),
...(input.radius ? { radius: input.radius } : {}),
```

```ts
// SOURCE: lib/emit.ts:80-81 — body renderers already gated
if (report.spacing) parts.push(renderSpacing(report.spacing));
if (report.radius) parts.push(renderRadius(report.radius));
```

```ts
// SOURCE: lib/schema.ts:234-235 — schema fields already optional
spacing: spacingSchema.optional(),
radius: radiusSchema.optional(),
```

### Precedent for "no observation → undefined" in an extractor

`extractDarkPalette` (per CLAUDE.md / `lib/extract/palette.ts`) returns nothing when backgrounds didn't shift — same shape of honesty. Downstream structure-lane consumers already guard: `lib/extract/structure/tokenLink.ts:53` (`report.radius?.scale`), `:59` (`if (gap && report.spacing)`), `lib/extract/structure/regionMetrics.ts:108` (`report?.spacing?.scale.length`).

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/extract/tokens.ts` | UPDATE | Return `undefined` instead of default scales; make `ExtractedTokens.spacing`/`.radius` optional |
| `lib/analyze.ts` | UPDATE | Verify plumbing at lines 91-92 (`spacing: tokens.spacing, radius: tokens.radius`) — types now flow as `Spacing | undefined`, which `BuildReportInput.spacing?`/`.radius?` already accepts; expected to need **no code change**, only typecheck confirmation |

---

## Tasks

### Task 1: Make `extractSpacing` return `undefined` on empty scale

- **File**: `lib/extract/tokens.ts`
- **Action**: UPDATE
- **Implement**: Change return type to `Spacing | undefined`. After computing `scale` (line 86-91), if `scale.length === 0`, return `undefined`. Otherwise return `{ provenance: "measured", baseUnitPx, scale, unit: "px" }` — remove the `: [4, 8, 16, 24, 32, 48, 64]` fallback on line 96. Note: `baseUnitPx` also defaults to a guessed 4/8 when counts are empty; with the empty-scale early return, that guess can no longer leak into output.
- **Mirror**: `lib/emit.ts:47` conditional-spread pattern
- **Validate**: `npm run typecheck`

### Task 2: Make `extractRadius` return `undefined` on empty scale

- **File**: `lib/extract/tokens.ts`
- **Action**: UPDATE
- **Implement**: Change return type to `Radius | undefined`. If `sortedScale.length === 0`, return `undefined`; else return `{ provenance: "measured", scale: sortedScale.slice(0, 6) }` — remove the `["4px","8px","16px","9999px"]` fallback on line 143.
- **Mirror**: Task 1
- **Validate**: `npm run typecheck`

### Task 3: Make `ExtractedTokens` fields optional

- **File**: `lib/extract/tokens.ts`
- **Action**: UPDATE
- **Implement**: `interface ExtractedTokens { spacing?: Spacing; radius?: Radius; elevation: Elevation; }` (elevation stays required — an empty `shadows: []` array is out of scope for #16; do not change it).
- **Validate**: `npm run typecheck`

### Task 4: Confirm plumbing through `analyze.ts`

- **File**: `lib/analyze.ts`
- **Action**: VERIFY (no expected edit)
- **Implement**: Lines 91-92 pass `tokens.spacing`/`tokens.radius` into `buildReport`; `BuildReportInput` declares `spacing?: Spacing; radius?: Radius` (`lib/emit.ts:30-31`), so `undefined` is assignable. Line 155-156 (`enrichWithAI`) reads `measured.report.spacing` which is already optional on the schema. If typecheck flags anything, fix at the call site only — never re-add a default.
- **Validate**: `npm run typecheck`

### Task 5: Run the eval gate

- **Action**: RUN `npm run eval`
- **Implement**: All corpus captures have real spacing/radius observations, and `eval/score.ts` does not score spacing/radius, so scores must be byte-identical to `eval/baseline.json`. Do NOT run `UPDATE_BASELINE=1` — any score change means a regression in this fix.

---

## Validation

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # next lint (known to fail non-interactively: repo has no ESLint config — pre-existing condition)
npm run eval        # regression gate; must pass with unchanged scores
```

---

## Risks

| Risk | Mitigation |
|------|------------|
| A hidden consumer assumes `report.spacing` is always present | Grep showed all consumers (`emit.ts`, `tokenLink.ts`, `regionMetrics.ts`, `analyze.ts`) already guard; typecheck will catch any non-optional access |
| Eval scores shift | `eval/score.ts` has zero spacing/radius references; real captures still populate scales, so behavior on the corpus is unchanged |
| Someone later re-adds a default "for nicer reports" | The removed lines are exactly the M2 review finding; the omission is the contract |

---

## Acceptance Criteria

- [ ] Capture with no observable spacing → `spacing` absent from frontmatter, no body section, no `--space-*` CSS variables
- [ ] Capture with no observable radius → `radius` likewise absent
- [ ] `npm run eval` passes with unchanged scores
- [ ] `npm run typecheck` passes with optional values plumbed `extractSpacing`/`extractRadius` → `extractTokens` → `buildReport`
