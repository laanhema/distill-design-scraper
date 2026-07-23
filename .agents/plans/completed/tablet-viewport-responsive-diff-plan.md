# Plan: Tablet viewport (768px) in the responsive diff

## Summary

Add a 768×1024 tablet pass alongside the existing 390×844 mobile pass in the responsive-diff capture (`RESPONSIVE_VIEWPORTS` in `lib/ingest.ts`). The downstream pipeline (`diffResponsive`, `emitStructureReport`, the `structureSchema.ts` shapes) already models `responsiveHarvests` as an array and `responsive`/`viewports` as width-keyed/width-tupled collections — so most of the plumbing is already generic to N secondary viewports and needs no change. The one real latent bug this surfaces is `lib/analyze.ts:71`, which reads `capture.responsiveHarvests?.[0]` to get mobile type sizes — an index-based assumption that happens to still work once tablet is appended second, but is fragile and should be made explicit. This is the one PRD-sanctioned capture-shape change, so the eval corpus (`capture.json` for both committed fixtures) and `eval/baseline.json` must be refreshed in the same PR, per the repo's fixture policy.

## User Story

As an agency builder
I want the structure report's responsive deltas to include a tablet breakpoint (768px) alongside mobile (390×844)
So that I can plan a rebuild across all three canonical widths from one artifact

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT |
| Complexity | MEDIUM (small diff, but capture-shape change touches the eval gate) |
| Systems Affected | `lib/ingest.ts`, `lib/analyze.ts`, eval corpus (`eval/corpus/*/capture.json`, `eval/baseline.json`), `.agents/PRDs/PRD.md` |
| GitHub Issue | #5 ([DIST-004] Tablet viewport (768px) in the responsive diff) |

---

## Patterns to Follow

### Adding a secondary viewport (already-generic loop)

```ts
// SOURCE: lib/ingest.ts:109-114
/** Secondary viewports for the responsive diff (§P5-2) — mobile only for now;
 *  the plan allows an optional tablet pass, added here if a second real delta
 *  case turns up. */
const RESPONSIVE_VIEWPORTS: Array<{ width: number; height: number }> = [
  { width: 390, height: 844 },
];
```

`captureResponsiveHarvests` (lib/ingest.ts:138-157) already does `for (const viewport of RESPONSIVE_VIEWPORTS)` and pushes a best-effort entry per viewport — no change needed there, only the const array.

### Width-keyed deltas (already unambiguous for N viewports)

```ts
// SOURCE: lib/extract/structure/responsive.ts:106-124
export function diffResponsive(input: DiffResponsiveInput): ResponsiveDeltas {
  const labelById = new Map<string, string>();
  buildLabelIndex(input.primaryLabeled, labelById);

  const out: ResponsiveDeltas = {};
  for (const harvest of input.secondary) {
    const secTyped = typeSecondary(harvest.rawHarvestNode);
    if (!secTyped) continue;
    walk(input.primaryTyped, secTyped, input.primaryViewport.width, harvest.viewport.width, labelById, out);
  }
  return out;
}
```

`ResponsiveDeltas` is `Record<componentName, Record<viewportWidthString, annotation>>` — adding a second harvest just adds a second key to the inner record per component. No ambiguity: every value is already prefixed by its width when rendered (see below).

### Width-labeled rendering (already ordered narrowest-first)

```ts
// SOURCE: lib/extract/structure/structureEmit.ts:151-162
/** Bulleted `## Responsive` body list — one line per component with a real
 *  layout delta. Viewport order follows plain-object key iteration (numeric
 *  string keys sort ascending in JS regardless of insertion order), so this
 *  reads narrowest-first rather than capture order (§P5-2). */
function buildResponsiveSectionText(responsive: ResponsiveDeltas): string {
  const lines: string[] = [];
  for (const [name, byWidth] of Object.entries(responsive)) {
    const parts = Object.entries(byWidth).map(([w, ann]) => `${w}px \`${ann}\``);
    lines.push(`- **${name}** — ${parts.join(" → ")}`);
  }
  return lines.join("\n");
}
```

With a 768px entry added, a component with deltas at all three widths renders as e.g. `- **GridSection** — 390px \`grid · 1col\` → 768px \`grid · 2col\` → 1440px \`grid · 3col\`` — already unambiguous, no code change needed here. Note this ordering is **independent** of the `viewports:` header line (see next), which stays primary-first-then-capture-order — a pre-existing asymmetry, not something to "fix" as part of this change.

```ts
// SOURCE: lib/extract/structure/structureEmit.ts:47-49
const viewportStr = `${viewport.width}×${viewport.height}`;
const allViewports = [viewport, ...(secondaryViewports ?? [])];
const viewportsStrs = allViewports.map((v) => `${v.width}×${v.height}`);
```

`secondaryViewports` comes from `responsiveHarvests?.map((h) => h.viewport)` (`lib/extract/structure/index.ts:112`), so its order mirrors `RESPONSIVE_VIEWPORTS` capture order (mobile, then tablet) — i.e. `viewports: [1440×900, 390×844, 768×1024]`. This is correct and requires no change; just don't be surprised it isn't sorted ascending like the responsive-delta body text is.

### The one real fragility to fix

```ts
// SOURCE: lib/analyze.ts:71-74 (current)
const mobileTypeSizes = capture.responsiveHarvests?.[0]?.typeSizesPx;
if (typography && mobileTypeSizes) {
  typography = applyMobileTypeSizes(typography, mobileTypeSizes);
}
```

This reads index `[0]` under the implicit assumption that the mobile (390px) harvest is always first in the array. It happens to keep working once tablet is *appended* after mobile in `RESPONSIVE_VIEWPORTS`, but it's an accident of ordering, not a stated invariant — the next person to reorder or add a third viewport could silently break `sizePxMobile`. Fix by matching on `viewport.width` explicitly instead of position. `sizePxMobile` / `applyMobileTypeSizes` (`lib/extract/typography.ts:262-277`, `lib/schema.ts:94-97`) stay 390px-only by design — see "Design decisions" below.

### Eval fixture-policy precedent (only sanctioned capture-shape change path)

```ts
// SOURCE: eval/capture.ts:83-99 (main loop — no changes needed to this file)
for (const entry of entries) {
  process.stdout.write(`Capturing ${entry.slug}… `);
  const capture = await captureEntry(entry); // calls capturePage() from lib/ingest.ts
  // ... writes eval/corpus/<slug>/capture.json
}
```

`eval/capture.ts` calls `capturePage` from `lib/ingest.ts` directly, so once `RESPONSIVE_VIEWPORTS` includes 768px, re-running `npm run eval:capture` (no args → offline fixtures only, per `selectEntries`) picks it up automatically. No code change needed in `eval/capture.ts` itself.

---

## Design decisions (already made — do not re-litigate)

1. **`RESPONSIVE_VIEWPORTS` gets `{ width: 768, height: 1024 }` appended after the existing 390×844 entry** — narrowest-first capture order, matching the existing convention and keeping `lib/analyze.ts`'s mobile-type-size lookup's *documentation* (390px) accurate even though the lookup itself will be made width-explicit rather than position-based (see Task 2).
2. **`sizePxMobile` / `applyMobileTypeSizes` stay 390px-only.** The issue's acceptance criteria only ask for tablet coverage in the structure lane's `responsive` deltas and `responsiveHarvests`/`viewports` capture shape — they say nothing about a tablet type-scale field. Adding a `sizePxTablet` schema field would be scope creep beyond what's asked; the existing GitHub issue comment raises this as a question to resolve, and the resolution here is: don't add it. If a future need for tablet type-scale sizes surfaces, that's a separate schema addition (new optional field + its own conditional `render*` in `lib/emit.ts`, per `CLAUDE.md`'s schema contract).
3. **No `structureSchema.ts` / `structureEmit.ts` changes.** Both already model `responsive`/`viewports` generically over N secondary viewports (confirmed above) — this is a "just add data" change, not a shape change to those two files.
4. **This is the one sanctioned capture-shape change** (per `CLAUDE.md` and the issue's technical notes) — `eval/corpus/{clean-light,dark-mode}/capture.json` must be refreshed via `npm run eval:capture` and `eval/baseline.json` via `UPDATE_BASELINE=1 npm run eval`, **in the same PR** as the code change, mirroring precedent from the PR that added `responsiveHarvests`/`darkCapture`.
5. **Manual verification needs a synthetic fixture with a real 768px-specific breakpoint** — the two committed corpus fixtures (`eval/fixtures/clean-light.html`, `dark-mode.html`) have no `@media` queries at all (confirmed: `grep -n "@media"` on both returns nothing), so refreshing their captures will add empty/no-delta tablet harvests but won't exercise the "unambiguous 3-viewport delta" acceptance criterion. That has to be checked with a throwaway local-server fixture per `CLAUDE.md`'s "Manually verifying extraction changes" section, not the committed corpus.

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/ingest.ts` | UPDATE | Add 768×1024 to `RESPONSIVE_VIEWPORTS` |
| `lib/analyze.ts` | UPDATE | Replace fragile `responsiveHarvests?.[0]` index lookup with an explicit width-390 match |
| `eval/corpus/clean-light/capture.json` | UPDATE (regenerated) | Refresh via `npm run eval:capture` — new tablet harvest entry |
| `eval/corpus/dark-mode/capture.json` | UPDATE (regenerated) | Same |
| `eval/baseline.json` | UPDATE (regenerated) | Refresh via `UPDATE_BASELINE=1 npm run eval` |
| `.agents/PRDs/PRD.md` | UPDATE | Check off the Phase 4 tablet-viewport item (§12); remove the now-stale "Additional responsive viewports" deferred bullet (§4) |

No changes needed: `lib/extract/structure/responsive.ts`, `lib/extract/structure/index.ts`, `lib/extract/structure/structureEmit.ts`, `lib/extract/structureSchema.ts`, `lib/schema.ts`, `eval/capture.ts`, `eval/corpus.ts`, `eval/scoreStructure.ts`, `app/api/analyze/route.ts`, `app/page.tsx` — all confirmed generic to N secondary viewports already (see Patterns above / exploration).

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Add the tablet viewport to the capture pass

- **File**: `lib/ingest.ts`
- **Action**: UPDATE
- **Implement**: Change

  ```ts
  const RESPONSIVE_VIEWPORTS: Array<{ width: number; height: number }> = [
    { width: 390, height: 844 },
  ];
  ```

  to

  ```ts
  const RESPONSIVE_VIEWPORTS: Array<{ width: number; height: number }> = [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
  ];
  ```

  Update the preceding doc comment (currently "mobile only for now; the plan allows an optional tablet pass, added here if a second real delta case turns up") to reflect that mobile + tablet are both captured now.
- **Mirror**: The array is already iterated generically by `captureResponsiveHarvests` (`lib/ingest.ts:138-157`) — no loop changes needed.
- **Validate**: `npm run typecheck`

### Task 2: Make the mobile-type-size lookup explicit instead of index-based

- **File**: `lib/analyze.ts`
- **Action**: UPDATE
- **Implement**: Change

  ```ts
  const mobileTypeSizes = capture.responsiveHarvests?.[0]?.typeSizesPx;
  ```

  to

  ```ts
  const mobileTypeSizes = capture.responsiveHarvests?.find(
    (h) => h.viewport.width === 390,
  )?.typeSizesPx;
  ```

  This keeps behavior identical today (390 is still index 0) but removes the positional assumption now that a second (768px) harvest exists in the same array — `sizePxMobile` stays exactly what its name and schema doc comment (`lib/schema.ts:94-97`) say it is, regardless of capture order.
- **Mirror**: `lib/schema.ts:94-97` (`sizePxMobile` doc comment, unchanged, still accurate: "Computed size at the 390px responsive harvest").
- **Validate**: `npm run typecheck`

### Task 3: Manually verify the 3-viewport responsive diff against a synthetic fixture

- **File**: none committed — throwaway script under the scratchpad, per `CLAUDE.md`'s "Manually verifying extraction changes"
- **Action**: N/A (verification only)
- **Implement**: Spin up a local `http.createServer` serving a small synthetic HTML page with a real CSS-only breakpoint structure that changes column count at both 768px and 390px (e.g. a grid section using `@media (max-width: 900px)` → 2 columns and `@media (max-width: 480px)` → 1 column, so 1440/768/390 each land in a different bucket). Call `renderUrl` (or `capturePage` directly against a Playwright page pointed at the local server) + `extractStructureFromCapture` from `lib/analyze.ts`, and inspect the resulting `StructureReport.markdown`. Confirm:
  - `responsiveHarvests` has 2 entries (390 and 768).
  - The `## Responsive` section shows a line like `- **GridSection** — 390px \`grid · 1col\` → 768px \`grid · 2col\` → 1440px \`grid · 3col\`` for the component that actually changes shape at all three widths — width-labeled and unambiguous.
  - A component that doesn't change at 768px (only at 390px, or not at all) does **not** get a fabricated `"768"` key — spot check the raw `machineBlock.responsive` object.
  - `machineBlock.viewports` is `[[1440,900],[390,844],[768,1024]]` (primary-first, then capture order — not sorted).
  - Run `npx tsx` **from the project root** (required for `node_modules` resolution).
- **Mirror**: `CLAUDE.md` → "Manually verifying extraction changes" section; the pattern used historically for CSSOM-`:hover`/ARIA verification.
- **Validate**: Manual inspection of printed markdown/JSON; delete the scratch script when done — do not leave it in the repo.

### Task 4: Refresh the eval corpus captures (sanctioned capture-shape change)

- **File**: `eval/corpus/clean-light/capture.json`, `eval/corpus/dark-mode/capture.json`
- **Action**: UPDATE (regenerated, not hand-edited)
- **Implement**: Run `npm run eval:capture` (no args → offline fixtures only, per `eval/capture.ts`'s `selectEntries`, so this stays network-free). This re-renders both committed fixtures and overwrites their `capture.json` with the new `responsiveHarvests` shape (now 2 entries instead of 1). Since neither fixture has `@media` queries, expect the new tablet harvest to be present but produce no additional responsive deltas — this is correct behavior ("nothing observed" for tablet on these two fixtures), not a bug.
- **Mirror**: `CLAUDE.md` → "The eval harness" workflow; precedent from the `responsiveHarvests`/`darkCapture` capture-shape PR.
- **Validate**: `git diff eval/corpus/*/capture.json` — confirm the diff is exactly the addition of a 768px `responsiveHarvests` entry per file, nothing else changed (styleDump, palette-relevant fields untouched).

### Task 5: Run eval, then refresh the baseline deliberately

- **File**: `eval/baseline.json`
- **Action**: UPDATE (regenerated)
- **Implement**: First run `npm run eval` with the refreshed captures from Task 4 — it may fail the "no regression vs. baseline" gate simply because the baseline predates the new capture shape (unlikely to change *scores* since only the tablet harvest was added, but confirm). Then run `UPDATE_BASELINE=1 npm run eval` to intentionally accept the new baseline.
- **Mirror**: `CLAUDE.md` → "Workflow when changing any extractor" steps 2-3.
- **Validate**: `npm run eval` (plain, no env var) passes cleanly after the baseline refresh.

### Task 6: Sync PRD.md

- **File**: `.agents/PRDs/PRD.md`
- **Action**: UPDATE
- **Implement**:
  - Line 254, §12 Phase 4: change `- [ ] Tablet viewport (768px) in \`RESPONSIVE_VIEWPORTS\` (capture-shape change → corpus refresh in same PR)` to `- [x] ...` (checked).
  - Line 73, §4 "Out of Scope (deferred)": remove `- [ ] Additional responsive viewports beyond 390×844 (e.g. 768px tablet)` — it's no longer deferred/out-of-scope once this ships.
- **Mirror**: `d37c19d docs: add public-deployment hardening guide and update PRD` (prior commit that paired a shipped Phase-4 item with a PRD update).
- **Validate**: `git diff .agents/PRDs/PRD.md` — two small, targeted line changes.

### Task 7: Final validation pass

- **File**: n/a
- **Action**: N/A
- **Implement**: Run the full validation suite.
- **Validate**: `npm run typecheck && npm run lint && npm run eval`

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Eval regression gate (offline, after corpus + baseline refresh)
npm run eval
```

No unit test framework exists in this repo (`CLAUDE.md`); `npm run eval` is the correctness gate for extraction logic.

---

## Acceptance Criteria

(mirrors GitHub issue #5)

- [ ] A URL analysis captures a 768px harvest as an additional `responsiveHarvests` entry (best-effort: a failure logs a warning and the entry is simply absent, matching the existing 390px pass's failure mode).
- [ ] Per-component responsive deltas in the emitted structure report name the viewport they belong to (e.g. `768px: 3col → 2col`, `390px: → 1col`) without ambiguity — verified via Task 3's synthetic fixture, since neither committed corpus fixture exercises a real breakpoint.
- [ ] A site with no layout change at 768px produces no fabricated tablet delta.
- [ ] Old committed captures without a tablet harvest replay through `npm run eval` as "nothing observed," not an error (true by construction — every consumer already loops over `responsiveHarvests` generically; no special-casing was ever added for a fixed array length).
- [ ] `eval/corpus/*/capture.json` refreshed via `npm run eval:capture` and `eval/baseline.json` via `UPDATE_BASELINE=1 npm run eval`, in the same PR.
- [ ] `npm run typecheck`, `npm run lint`, and `npm run eval` all pass.
