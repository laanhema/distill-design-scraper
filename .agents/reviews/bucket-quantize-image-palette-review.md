# Code Review: feature/bucket-quantize-image-palette (issue #21)

**Scope**: branch `feature/bucket-quantize-image-palette` vs `main`, including uncommitted changes — 1 file, `lib/extract/imagePalette.ts` (+45/−3)
**Recommendation**: APPROVE (with nits)

## Summary

The diff rewrites `quantizeImage` from an unbounded per-pixel CIEDE2000 merge into a bounded two-stage quantization: a 4-bit-per-channel RGB histogram (≤ 4096 buckets, integer-only pixel loop) followed by ΔE-merging of count-weighted bucket centroids, largest bucket first. It directly implements issue #21's technical notes, mirrors the established `farBuckets` pattern (`lib/extract/palette.ts:139-179`), and keeps the function's output contract intact so no downstream code needed changes. The change is tight, well-commented, and scoped exactly as the soft-dependency note on #21 required (no incursion into `extractImagePalette`, which #22 will touch).

## Issues Found

### Critical
None.

### High Priority
None.

### Medium Priority
None.

### Suggestions (Low)

1. `lib/extract/imagePalette.ts:106-116` — Colors that are perceptually distinct (ΔE > 2.5) but fall in the same 16-step RGB bucket are now averaged into one centroid before the ΔE merge can see them (e.g. `#000000` vs `#0f0f0f` share bucket 0, though their ΔE is ~4). This is inherent to the bucketing approach the issue asked for, is the same coarseness already accepted in `palette.ts`'s `farBuckets`, and the count-weighted mean keeps the centroid near the dominant color — but it is a real (accepted) precision trade-off worth knowing when comparing palettes; on one verified capture it flipped the near-equal-chroma `primary`/`accent` ordering. No action required.
2. `lib/extract/imagePalette.ts:120` — `if (!parsed) continue;` silently drops the bucket's pixel count from the cluster total if `parseColor` ever failed; with rounded 0-255 integers the template string is always parseable, so this is purely defensive dead code carried over from the old loop. Fine to keep for consistency with the file's defensive style.

### Out of scope (pre-existing, tracked elsewhere)
- `lib/extract/imagePalette.ts:131` (`bgCluster.hex` via `clusters[0]`) still throws on a zero-cluster (fully transparent/unparseable) input — that is open issue #22 (DIST-016), deliberately not addressed here; this diff neither worsens nor masks it (a degenerate image yields zero buckets → zero clusters, exactly as before).

## Verification performed

- Bucket key `((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)` is byte-identical to the `palette.ts:172` scheme; ≤ 4096 keys by construction, so Stage 2 is bounded regardless of image content.
- Sum overflow impossible: max channel sum ≈ 255 × 102,400 ≈ 2.6×10⁷ ≪ `Number.MAX_SAFE_INTEGER`.
- Count conservation holds: every opaque pixel increments exactly one bucket and `mergeInto` carries `bucket.count`, so cluster counts still sum to the opaque-pixel count that `extractImagePalette`'s `validPixels` (line 115) divides by.
- Largest-first sort before merging preserves the old "dominant color seeds the cluster and names its hex" semantics; downstream re-sorts by `areaWeight` anyway.
- `mergeInto` and the cross-image merge are untouched, keeping the diff conflict-free with open #22.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | PASS |
| Tests (`npm run eval`) | PASS (clean-light 100%, dark-mode 100%, aggregate 100%, baseline untouched) |

## What's Good

- Exactly follows the repo's own reference pattern instead of inventing a new quantizer.
- The doc comment explains *why* (unbounded O(pixels × clusters) failure mode) with the issue reference — future readers won't "simplify" it back.
- Zero API/contract surface change; the measured lane stays offline and deterministic.
- Honest handling of the provenance invariant: degenerate inputs produce fewer clusters/omitted roles, never fabricated ones.

## Recommendation

Approve with nits (both suggestions are informational; no code changes requested). Ready to commit and open a PR via the follow-up command.
