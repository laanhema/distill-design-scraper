# Plan: Bucket-quantize images before ΔE cluster merging (DIST-015)

## Summary

`quantizeImage` in `lib/extract/imagePalette.ts` currently runs per-pixel CIEDE2000 (`deltaE`) against a growing, unbounded cluster list. A noise/gradient image where nothing merges at ΔE ≤ 2.5 produces thousands of clusters, so cost becomes ~102k pixels × thousands of clusters × Lab conversion, per image, up to 6 images per request — enough to pin a core for the whole route budget. Fix: replace the per-pixel ΔE pass with a two-stage quantization — (1) a bounded 4-bit-per-channel RGB histogram (max 4096 buckets, O(pixels) integer work, no color math), then (2) ΔE-merge the bucket *centroids* (≤ 4096 × ≤ 4096 worst-case, constant-bounded and cheap in practice). This mirrors the `farBuckets` pattern already used in `lib/extract/palette.ts:139-179`. The function's output contract (`{ clusters: ImageColorCluster[]; pixelCount }`, counts summing to opaque-pixel count) is unchanged, so `extractImagePalette`'s cross-image merge, area-weighting, and role assignment stay as-is.

## User Story

As an operator
I want image quantization to run in bounded time regardless of image content
So that a photographic or gradient-noise upload cannot pin a CPU core for the whole 60s route budget.

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT (performance hardening) |
| Complexity | MEDIUM |
| Systems Affected | image-input measured palette lane (`lib/extract/imagePalette.ts` only; sole consumer `lib/analyze.ts:208`) |
| GitHub Issue | #21 |

## Context and constraints

- Issue #21 technical notes: "coarse-bucket first (e.g. 4-bit/channel histogram, as `palette.ts`'s `farBuckets` already does), then ΔE-merge the bucket centroids."
- Soft-dependency note: land after #15 (DIST-009, **closed/landed** — semantic fill loop already removed) and #22 (DIST-016, **still open** — its empty-cluster guard does *not* exist in the file yet, so there is nothing to preserve; this rewrite is confined to `quantizeImage`/`mergeInto` and must not itself introduce `clusters[0]` dereferences beyond what already exists in `extractImagePalette`). Do not "fix" #22 here — keep the diff scoped to quantization.
- Project invariant "measured, never faked" is unaffected: bucket centroids are still measured pixel aggregates, not inventions.
- The measured lane must stay offline/deterministic. No new deps; reuse `sharp` + `lib/color.ts` helpers.
- Eval corpus does not exercise `imagePalette.ts` (no references under `eval/`), so `npm run eval` should pass byte-identical — still run it as the project gate.

## Patterns to Follow

### 4-bit/channel bucket key + bounded histogram
```ts
// SOURCE: lib/extract/palette.ts:171-178
const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
const bucket = farBuckets.get(key);
if (bucket) {
  bucket.count++;
} else {
  farBuckets.set(key, { count: 1, r, g, b });
}
```
(For this task, additionally accumulate `rSum/gSum/bSum` so the merge stage uses the bucket **centroid** — the issue comment asks for centroids, not first-seen representatives.)

### Count-descending processing before merge
```ts
// SOURCE: lib/extract/palette.ts:190
const sorted = [...farBuckets.values()].sort((a, b) => b.count - a.count);
```
Sort buckets by count descending before ΔE-merging, so dominant colors seed clusters and a cluster's representative `hex` comes from its highest-count bucket (mirrors current behavior where big areas dominate merge order after sort in `extractImagePalette`).

### Existing ΔE merge helper (keep)
```ts
// SOURCE: lib/extract/imagePalette.ts:32-40
function mergeInto(clusters, color, hexStr, count) {
  for (const cluster of clusters) {
    if (deltaE(cluster.color, color) <= MERGE_DELTA_E) { cluster.count += count; return; }
  }
  clusters.push({ color, hex: hexStr, count, areaWeight: 0 });
}
```
Reuse unchanged — it is also used for the cross-image merge at `imagePalette.ts:83-89`.

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/extract/imagePalette.ts` | UPDATE | Rewrite `quantizeImage` to histogram-then-centroid-merge; no other function changes |

## Tasks

### Task 1: Rewrite `quantizeImage` with a bounded bucket histogram

- **File**: `lib/extract/imagePalette.ts`
- **Action**: UPDATE (only `quantizeImage`, lines ~42-71; leave `mergeInto`, constants, and `extractImagePalette` untouched)
- **Implement**:
  1. Keep the existing `sharp(...).resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: "inside" }).ensureAlpha().raw()` decode and the `a < 180` transparent-pixel skip.
  2. Pass 1 (per pixel, integer-only): `const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);` accumulate into a `Map<number, { count: number; rSum: number; gSum: number; bSum: number }>` (≤ 4096 entries by construction). No `parseColor`/`deltaE` inside this loop.
  3. Pass 2: convert buckets to centroids — `r = Math.round(rSum / count)` etc.; build the centroid color via `parseColor(`rgb(${r}, ${g}, ${b})`)` (skip on `undefined`, matching existing defensive style) or an inline culori rgb object + `hex()`; sort centroid entries by `count` descending; feed each through the existing `mergeInto(clusters, color, hexStr, count)`.
  4. Return `{ clusters, pixelCount }` with `pixelCount = info.width * info.height` exactly as before. Bucket counts must sum to the number of *opaque* pixels (they do, since each opaque pixel increments exactly one bucket) — `extractImagePalette:93` (`validPixels`) depends on this.
  5. Update the function's doc comment to state the bounded two-stage approach and why (issue #21).
- **Mirror**: `lib/extract/palette.ts:139-179` (bucket key + map shape), `lib/extract/palette.ts:190` (count-desc sort)
- **Validate**: `npm run typecheck && npm run lint`

### Task 2: Behavior + performance spot-check (scratch script, then delete)

- **File**: scratchpad only (e.g. `/tmp/claude-.../scratchpad/quantize-check.ts`) — per CLAUDE.md, run with `npx tsx` **from the project root**, and delete/keep out of the repo afterwards
- **Action**: VERIFY
- **Implement**:
  1. Generate with `sharp`: (a) a worst-case 320×320 random-noise PNG, (b) a 320×320 smooth gradient PNG, (c) a synthetic flat-color "screenshot-like" composite (background + panel + text-ish + accent blocks).
  2. Time `extractImagePalette` on each, and on 6 copies of the noise image in one call (multi-image path). Acceptance: noise/gradient completes in a small fraction of the 60s route budget (target: well under a second each for quantization; before the fix, noise takes orders of magnitude longer — capture a before number on `main` first if cheap, otherwise reason from bucket bound).
  3. On the flat-color composite, print the resulting palette roles/hexes and confirm role assignment is materially unchanged vs. `main` (run the same script on `main` via `git stash` or on the branch before editing to capture the baseline).
- **Validate**: script output shows bounded runtime + materially unchanged roles on the screenshot-like input; script deleted afterwards

## Validation

```bash
npm run typecheck
npm run lint
npm run eval    # correctness gate; imagePalette not in corpus, must pass unchanged — do NOT update baseline
```

## Risks

| Risk | Mitigation |
|------|------------|
| Centroid hexes differ slightly from first-seen pixel hexes (e.g. `#fefefe` vs `#ffffff`) | Acceptable per issue ("materially unchanged"); spot-check in Task 2; ΔE merge threshold 2.5 absorbs sub-bucket variation |
| 4-bit buckets could merge two perceptually distinct near colors into one centroid | Bucket width (16 RGB steps) is below the ΔE 2.5 merge threshold's typical reach for mid-lightness colors; the same coarseness is already accepted in `palette.ts` `farBuckets` |
| Touching `extractImagePalette` creates conflicts with open #22 | Keep the diff strictly inside `quantizeImage` + its doc comment |
| Eval baseline drift | imagePalette is not exercised by the eval corpus; if eval changes at all, stop and investigate — do not refresh baseline |

## Acceptance Criteria

- [ ] Worst-case noise/gradient image: quantization work bounded by fixed bucket count (≤ 4096), not cluster-list growth
- [ ] Normal screenshot-like input: role assignment materially unchanged (spot-checked)
- [ ] 6 max-size images: quantization completes in a small fraction of the route timeout (timed)
- [ ] `npm run typecheck`, `npm run lint`, `npm run eval` all pass, eval baseline untouched
- [ ] Diff confined to `quantizeImage` (+ doc comment) in `lib/extract/imagePalette.ts`
