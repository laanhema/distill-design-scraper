# Plan: Handle Zero-Cluster (Degenerate) Image Input Without Crashing

## Summary

`extractImagePalette` (`lib/extract/imagePalette.ts`) crashes with an unhandled `TypeError` when pixel quantization yields zero clusters — e.g. a fully transparent PNG (every pixel skipped by the alpha gate) — because `clusters[0]` is read unguarded when picking the background swatch. Separately, an unparseable image makes `sharp` throw inside `Promise.all`, failing the *entire* mixed upload even when other images are valid. Both surface as a 502 from `POST /api/analyze`. Fix: (1) tolerate per-image quantization failure (skip the bad image with a warning, keep the rest), (2) throw a typed `DegenerateImageError` when *no* image yields any cluster, and (3) map that error to a clean, actionable 422 in the API route — mirroring the existing `UnsafeUrlError` → 400 pattern. No palette fields are ever invented; the empty case is an honest error, preserving the provenance contract.

## User Story

As an image-upload user
I want a fully transparent or unparseable image to produce an honest error or empty palette
So that a single bad upload doesn't 502 the whole request with an unhandled TypeError

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | LOW |
| Systems Affected | image palette extraction (`lib/extract/imagePalette.ts`), API route (`app/api/analyze/route.ts`) |
| GitHub Issue | #22 (DIST-016) |

---

## Patterns to Follow

### Typed error class + route mapping
```ts
// SOURCE: lib/security/ssrfGuard.ts:13
export class UnsafeUrlError extends Error {}

// SOURCE: app/api/analyze/route.ts:220-227
} catch (err) {
  if (err instanceof UnsafeUrlError) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
  // §9: surface a clear error, never fabricate results.
  const message = err instanceof Error ? err.message : "Unknown rendering error.";
  return NextResponse.json({ ok: false, error: message }, { status: 502 });
}
```

### Best-effort per-pass failure with warn (skip, don't fail the whole request)
```ts
// SOURCE: lib/analyze.ts:251-257 (structure lane failure tolerance)
.catch((err) => {
  console.warn("Image structure extraction error:", err);
  return { structureReport: undefined, structureUnavailableReason: "..." };
})
```

### Provenance contract
CLAUDE.md: "a missing signal should produce an omitted field, not a guessed one." Zero clusters must never be papered over with fabricated swatches; `reportSchema.palette` is *required* (`lib/schema.ts:227`), so the all-degenerate case must be a clean typed error, not an empty report.

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/extract/imagePalette.ts` | UPDATE | Per-image failure tolerance; exported `DegenerateImageError` thrown when zero clusters survive across all images |
| `app/api/analyze/route.ts` | UPDATE | Map `DegenerateImageError` → 422 with actionable message |

---

## Tasks

### Task 1: Add `DegenerateImageError` and the zero-cluster guard

- **File**: `lib/extract/imagePalette.ts`
- **Action**: UPDATE
- **Implement**:
  - Export `class DegenerateImageError extends Error {}` (module-level, JSDoc explaining when it fires — mirrors `UnsafeUrlError`).
  - In `extractImagePalette`, replace the bare `Promise.all(buffers.map(quantizeImage))` with a per-image wrapper that catches a `quantizeImage` failure (unparseable/corrupt buffer → `sharp` throws), logs `console.warn("Image palette: skipping unreadable image:", err)`, and yields `{ clusters: [], pixelCount: 0 }` for that image so the remaining images still contribute (acceptance criterion 2).
  - After the cross-image merge (current line ~131), guard: if `clusters.length === 0`, throw `new DegenerateImageError("No colors could be extracted from the supplied image(s) — they may be fully transparent or not valid images.")`. This runs *before* any `clusters[0]` access (`bgCluster` at line 151, `bestTextCluster` at line 181), closing the crash for both.
  - Do **not** fabricate any swatch for the empty case (provenance contract, acceptance criterion 3).
- **Mirror**: `lib/security/ssrfGuard.ts:13` (error class), `lib/analyze.ts:251-257` (warn-and-continue)
- **Validate**: `npm run typecheck`

### Task 2: Map `DegenerateImageError` to a 422 in the API route

- **File**: `app/api/analyze/route.ts`
- **Action**: UPDATE
- **Implement**: Import `DegenerateImageError` from `@/lib/extract/imagePalette`; in the existing `catch`, before the 502 fallback, add `if (err instanceof DegenerateImageError) return NextResponse.json({ ok: false, error: err.message }, { status: 422 });`. (Error paths are already never cached — `setCache` only runs on success — so no cache change needed.)
- **Mirror**: `app/api/analyze/route.ts:221-223` (`UnsafeUrlError` branch)
- **Validate**: `npm run typecheck && npm run lint`

### Task 3: End-to-end scratch verification (then delete the script)

- **File**: scratchpad script (outside repo), e.g. `<scratchpad>/degenerate-image-check.ts`
- **Action**: CREATE (temporary; do not leave in repo)
- **Implement**: Script that uses `sharp` to build (a) a fully transparent PNG buffer, (b) a garbage non-image buffer, (c) a small valid opaque PNG (e.g. solid red on white), then:
  1. `extractImagePalette([transparent])` → expect `DegenerateImageError` (not TypeError).
  2. `extractImagePalette([garbage])` → expect `DegenerateImageError`.
  3. `extractImagePalette([transparent, valid])` and `[garbage, valid]` → expect a palette derived from the valid image only (background/text roles present, no throw).
  4. `analyzeImages([{ data: transparentBase64 }])` with no `ANTHROPIC_API_KEY` → expect the `DegenerateImageError` to propagate (route would map it to 422).
  Run with `npx tsx` **from the project root** (CLAUDE.md: tsx resolves node_modules relative to script location — pass the absolute scratchpad path but run from repo root; if resolution fails, place the script temporarily at repo root and delete after).
- **Validate**: script output shows expected outcomes; then `npm run eval` (image lane isn't in the eval corpus, so scores must be unchanged — do **not** touch `eval/baseline.json`).

---

## Validation

```bash
npm run typecheck
npm run lint
npm run eval
```

## End-to-End Verification

Run the Task 3 scratch script via `npx tsx` from the project root:

- Fully transparent PNG alone → `DegenerateImageError` with the actionable message (no `TypeError: Cannot read properties of undefined`).
- Garbage buffer alone → `DegenerateImageError` (sharp failure tolerated per-image, then zero-cluster guard fires).
- Mixed degenerate + valid upload → valid report with a palette measured from the valid image only; a `console.warn` notes the skipped image.
- Simulated route behavior: `DegenerateImageError` instance check → 422 branch (inspect route code path; full HTTP round-trip optional via `npm run dev` + `curl -X POST /api/analyze` with a transparent-PNG base64 payload expecting `{"ok":false,...}` and status 422).

Delete the scratch script afterwards.

---

## Acceptance Criteria

- [ ] Fully transparent PNG → clean 422 with actionable message, no unhandled TypeError, no 502 (issue AC 1)
- [ ] Mixed upload (degenerate + valid) → palette still produced from valid images, degenerate skipped with a warning (issue AC 2)
- [ ] Empty-cluster guard omits/errors rather than inventing palette fields (issue AC 3)
- [ ] `npm run typecheck`, `npm run lint`, `npm run eval` all pass with unchanged eval scores
- [ ] Follows existing typed-error and warn-and-continue patterns
