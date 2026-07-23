# Plan: Fix multi-file selection race and stale structure tab in the UI

## Summary

`app/page.tsx` keeps uploaded files and their data-URL previews in two parallel arrays (`selectedFiles`, `imagePreviews`). Files append synchronously in selection order but previews append in `FileReader.onload` *completion* order, so with mixed file sizes the index pairing breaks: the wrong name is sent to the API, the wrong alt text renders, and `removeImage(i)` can delete a different image than the one clicked. Separately, when a new analysis returns no `structureReport`, the `tab` state can remain `"structure"`, rendering an empty pane and making "Copy .md" copy `""`. Fix: collapse the two arrays into one `SelectedImage[]` state (`{ file, preview }`), populate it via `Promise.all` over per-file data-URL reads so entries land paired and in selection order, and reset the tab away from `"structure"` when a result without a structure report arrives.

## User Story

As a multi-image user
I want previews, filenames, and remove buttons to always refer to the same file
So that out-of-order `FileReader` completions can't send wrong names to the API or delete the wrong image

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | LOW |
| Systems Affected | Frontend only (`app/page.tsx`) — no API, schema, or extractor changes |
| GitHub Issue | #23 |

---

## Patterns to Follow

### State + functional updates (existing style in the same file)

```tsx
// SOURCE: app/page.tsx:45-46 (current parallel arrays — to be merged)
const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
const [imagePreviews, setImagePreviews] = useState<string[]>([]);

// SOURCE: app/page.tsx:72-75 (functional setState style already used)
function removeImage(index: number) {
  setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  setImagePreviews((prev) => prev.filter((_, i) => i !== index));
}
```

### Local types via `interface` at top of file

```tsx
// SOURCE: app/page.tsx:6-16
interface Meta {
  finalUrl: string;
  ...
}
```

### Error handling: UI errors funnel into `setError` / status `"error"` (app/page.tsx:120-123). File-read failures should not crash the page — a file whose read fails is simply skipped (consistent with the project's "missing signal → omitted, not guessed" principle).

### Tests: no unit test framework exists; `npm run eval` is the extraction gate (untouched by this UI change but run as a regression check). Verification of UI behavior is by build + manual/dev-server reasoning (see End-to-End Verification).

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `app/page.tsx` | UPDATE | Merge parallel arrays into one `{file, preview}[]` state; fix preview-ordering race; reset stale `"structure"` tab |

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Introduce single `SelectedImage[]` state and race-free file reading

- **File**: `app/page.tsx`
- **Action**: UPDATE
- **Implement**:
  - Add `interface SelectedImage { file: File; preview: string }` near the other local interfaces.
  - Replace the two states (lines 45-46) with `const [images, setImages] = useState<SelectedImage[]>([]);`.
  - Rewrite `handleFilesSelect` (lines 58-70):
    - Keep the `MAX_IMAGES` room check against `images.length`.
    - Add a small `readFileAsDataURL(file: File): Promise<string>` helper (module scope, above the component) wrapping `FileReader` in a Promise (`onload` → resolve `reader.result as string`, `onerror` → reject).
    - Make `handleFilesSelect` async: `Promise.all` (or `Promise.allSettled` to skip individual failures) over the accepted files, build `{ file, preview }` pairs **in selection order**, then a single functional `setImages((prev) => [...prev, ...pairs].slice(0, MAX_IMAGES))` append. Pairing is now structural — no cross-array index math anywhere.
  - Rewrite `removeImage` as one filter on `images`.
- **Mirror**: `app/page.tsx:72-75` functional-update style
- **Validate**: `npm run typecheck`

### Task 2: Update all consumers of the old parallel arrays

- **File**: `app/page.tsx`
- **Action**: UPDATE
- **Implement**:
  - Guard at line 80: `images.length === 0`.
  - Request body (lines 98-101): `images.map(({ file, preview }, i) => ({ data: preview, name: file.name || \`uploaded-image-${i + 1}\` }))`.
  - Download fallback (lines 143-145): `images[0]?.file.name`.
  - Drop-zone label (lines 240-247): `images.length`.
  - Preview grid (lines 250-266): map over `images`; `img src={img.preview}`, `alt={img.file.name}`; remove button unchanged apart from the single-array `removeImage`.
  - Submit button (lines 275, 278): `images.length`.
  - No other references to `selectedFiles` / `imagePreviews` may remain (grep to confirm).
- **Mirror**: existing JSX in the same blocks
- **Validate**: `npm run typecheck && npm run lint`

### Task 3: Reset stale `"structure"` tab on structure-less results

- **File**: `app/page.tsx`
- **Action**: UPDATE
- **Implement**: In `analyze()`'s success path (after `setStructureReport(...)`, around line 115), add:
  `if (!data.structureReport) setTab((t) => (t === "structure" ? "preview" : t));`
  This guarantees the active tab never points at a pane that no longer exists, so "Copy .md"/"Download .md" can never operate on an empty structure markdown.
- **Mirror**: existing state-reset block at `app/page.tsx:82-89`
- **Validate**: `npm run typecheck`

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Extraction regression gate (should be untouched by a UI-only change)
npm run eval
```

## End-to-End Verification

No unit test framework exists and the change is client-only, so verify by build + targeted reasoning:

1. `npm run build` must succeed (compiles `app/page.tsx` in production mode).
2. Code-level walkthrough against the acceptance criteria:
   - **AC1/AC2**: confirm `file` and `preview` now live in one state entry and that no consumer indexes across two arrays (grep for `selectedFiles` and `imagePreviews` returns nothing). `Promise.all` preserves input order, so previews render in selection order regardless of read-completion order.
   - **AC3**: simulate the flow: `tab === "structure"` from a previous run → new analysis resolves with `structureReport: undefined` → the added reset flips `tab` to `"preview"` before `status` becomes `"done"`, so the structure pane and empty copy can't occur.
3. Optional manual check: `npm run dev`, switch to Image Input, select several files of very different sizes at once — each thumbnail's hover-remove must delete the thumbnail it sits on, and the submitted `images[].name` (network tab) must match each preview.

---

## Acceptance Criteria

- [ ] Several files selected at once with differing sizes: each preview, its displayed name, and its `removeImage` target refer to the same underlying file.
- [ ] `page.tsx` keeps file and preview in one state entry (`{file, preview}[]`) — no parallel-index pairing across two arrays.
- [ ] A new analysis returning no structure report resets the active tab away from `"structure"`; "Copy .md" never copies an empty string.
- [ ] `npm run typecheck`, `npm run lint`, `npm run eval` all pass.
