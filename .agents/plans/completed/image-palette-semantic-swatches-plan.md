# Plan: Stop Fabricating Semantic Swatches in the Image Palette

## Summary

The image-input palette extractor (`lib/extract/imagePalette.ts`) ends with a "fill remaining required roles" loop that iterates **all** of `COLOR_ROLES` and stamps any role not yet assigned (`muted`, `border`, `on-primary`, `success`, `warning`, `danger`) with an arbitrary leftover pixel cluster — falling back to `clusters[0]`, which even duplicates already-assigned hexes. This violates the project's core "measured, never faked" invariant and the schema's own comment that semantic roles are "assigned only on strong evidence … never synthesized". The fix, per the review recommendation quoted in issue #15, is to **omit unfilled roles outright**: delete the fill loop so the image palette only ever contains the evidence-based roles it actually derived (`background`, `surface`, `text`, `primary`, `accent`). Pixel clusters carry no usage context (no DOM, no ARIA), so even `muted`/`border` cannot be honestly claimed from leftovers — omission is the correct behavior for every role the heuristics didn't assign. Downstream rendering (`renderPalette` in `lib/emit.ts`) and the frontend already iterate only the swatches present, so omitted roles disappear from the Markdown body and UI automatically.

## User Story

As a report consumer
I want image-input palettes to only claim roles with real evidence
So that `success`/`warning`/`danger`/`on-primary` swatches stamped `provenance: "measured"` are never invented from arbitrary leftover clusters.

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | LOW |
| Systems Affected | Design-tokens lane, image input only (`lib/extract/imagePalette.ts`) |
| GitHub Issue | #15 (DIST-009) |

---

## Patterns to Follow

### Omission of unassigned roles (the URL-palette counterpart)

```ts
// SOURCE: lib/extract/palette.ts:505-509 — extractPalette simply skips roles
// that assignRoles didn't claim; nothing is filled from leftovers.
const colors: Swatch[] = [];
for (const role of COLOR_ROLES) {
  const c = assigned.get(role);
  if (!c) continue;
  ...
}
```

### Schema contract being enforced

```ts
// SOURCE: lib/schema.ts:29-34 — COLOR_ROLES comment
// Semantic states (§P5-1): assigned only on strong evidence (hue band +
// usage context — an alert/status role or an aria-invalid element), never
// synthesized from `primary`. Absent when no such evidence exists.
```

### Rendering already handles omission

```ts
// SOURCE: lib/emit.ts:103-115 — renderPalette iterates palette.colors;
// absent roles produce absent lines, no empty placeholders.
for (const c of palette.colors) { ... }
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/extract/imagePalette.ts` | UPDATE | Delete the lines 196-209 "fill remaining required roles" loop; drop the then-unused `COLOR_ROLES` import (keep `ColorRole` type import only if still referenced — check after edit; currently `ColorRole` is imported from `@/lib/schema` in the type-only import on line 12 and stays only if used). |

No schema, emit, API, or frontend changes required — omission is already the supported contract everywhere downstream.

---

## Tasks

### Task 1: Remove the fabricating fill loop

- **File**: `lib/extract/imagePalette.ts`
- **Action**: UPDATE
- **Implement**: Delete lines 196-209 (the `// Fill remaining required roles (muted, border) if needed` comment plus the `for (const role of COLOR_ROLES) { ... }` loop). Do not replace it with a restricted `muted`/`border` fill — pixel clusters carry no usage evidence for those roles either; omit them (issue AC allows either, review recommends omission). Leave the evidence-based assignments (`background`, `surface`, `text`, `primary`, `accent`) and the contrast-pair block untouched.
- **Mirror**: `lib/extract/palette.ts:505-509` — unassigned role ⇒ omitted swatch.
- **Validate**: `npm run typecheck`

### Task 2: Clean up now-dead imports

- **File**: `lib/extract/imagePalette.ts`
- **Action**: UPDATE
- **Implement**: Remove `import { COLOR_ROLES } from "@/lib/schema";` (line 13) — it becomes unused. Keep the `ColorRole` type import on line 12 only if it is still referenced (it is currently only used implicitly via `ROLE_USAGE` typing; if unreferenced after the edit, remove it from the type import list too so lint stays clean).
- **Validate**: `npm run lint`

### Task 3: Verify against a synthetic image (manual, scratch script — do not commit)

- **File**: scratch script in the session scratchpad directory (run with `npx tsx` **from the project root** per CLAUDE.md)
- **Action**: CREATE (temporary), delete after use
- **Implement**: Generate a small synthetic PNG via `sharp` (e.g. a white background with a navy block and a red block), call `extractImagePalette` on the buffer, and assert: (a) no swatch has role `success`/`warning`/`danger`/`on-primary`; (b) no two swatches share a hex; (c) `background`/`text`/`primary` are present. Optionally run the buffer through `analyzeImages`-adjacent emit (`buildReport`/`emitMarkdown` from `lib/emit.ts` if trivially callable) to confirm the Markdown body has no lines for the omitted roles — otherwise inspecting the returned `Palette` object is sufficient since `renderPalette` provably iterates only present swatches.
- **Validate**: script output shows only evidence-based roles.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Some downstream consumer assumes `muted`/`border`/semantic roles always exist in image palettes | Checked: `lib/emit.ts` (renderPalette, CSS-variables block), `app/page.tsx` swatch grid, and `lib/interpret.ts` `applyRoleRefinements` all iterate/lookup only swatches present; Stage-E refinements target existing hexes only. No consumer requires the roles. |
| Eval regression | `npm run eval` replays URL captures via `extractFromCapture`, which never touches `imagePalette.ts` — scores must (and should) pass unchanged. Do **not** update the baseline. |
| Conflicts with DIST-015 (#21) / DIST-016 (#22) in the same file | This issue is sequenced first per the issue comment; keep the diff minimal (delete-only) so later work rebases trivially. |

---

## Validation

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run eval        # must pass unchanged — no baseline refresh
```

---

## Acceptance Criteria

- [ ] Image with no plausible semantic-state colors ⇒ `success`/`warning`/`danger`/`on-primary` absent from the palette (no leftover-cluster fill, no `clusters[0]` duplication).
- [ ] The fill loop is gone (omission chosen over a restricted `muted`/`border` fill).
- [ ] Markdown body renders no lines for omitted roles (existing optional-field contract — verified via renderPalette's iterate-what-exists shape).
- [ ] `npm run eval` passes unchanged.
- [ ] `npm run typecheck` and `npm run lint` pass.
