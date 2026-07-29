# Plan: Extract the duplicated download plumbing in the workbench

## Summary

`app/page.tsx`'s two download handlers (`downloadActiveMarkdown`, `downloadTailwindTheme`, lines 161-199) each inline the same two blocks: a hostname-derivation block (URL hostname → falls back to the first uploaded image's basename → falls back to a per-caller default) and a Blob → `createObjectURL` → anchor → `click()` → `revokeObjectURL` sequence. This is a pure behavior-preserving refactor: extract `deriveHost(defaultHost)` as a closure inside `Home()` (it needs `meta`, `url`, `inputMode`, `images` from component state, matching the existing closure style of the other handlers in this file) and `downloadBlob(content, mimeType, filename)` as a module-level helper (it takes everything as parameters, matching the existing `readFileAsDataURL` top-level helper). Both existing handlers are rewritten to call the two new helpers, producing byte-identical filenames and download behavior. No other file changes.

## User Story

As a maintainer
I want the two download handlers to share their filename-derivation and blob/anchor/revoke logic
So that a fix to one (e.g. hostname sanitizing) can't silently miss the other

## Metadata

| Field | Value |
|-------|-------|
| Type | REFACTOR |
| Complexity | LOW |
| Systems Affected | `app/page.tsx` (frontend workbench only) |
| GitHub Issue | #101 |

---

## Patterns to Follow

### Existing duplicated block (the thing being extracted)
```ts
// SOURCE: app/page.tsx:161-179 (downloadActiveMarkdown)
function downloadActiveMarkdown() {
  const textToDownload = tab === "structure" ? (structureReport?.markdown ?? "") : markdown;
  const isStruct = tab === "structure";
  const blob = new Blob([textToDownload], { type: "text/markdown" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  let host = "report";
  try {
    host = new URL(meta?.finalUrl ?? url).hostname.replace(/^www\./, "");
  } catch {
    if (inputMode === "image" && images[0]) {
      host = images[0].file.name.replace(/\.[^/.]+$/, "");
    }
  }
  a.href = href;
  a.download = `distill-${isStruct ? "structure-" : ""}${host}.md`;
  a.click();
  URL.revokeObjectURL(href);
}
```
```ts
// SOURCE: app/page.tsx:181-199 (downloadTailwindTheme) — verbatim same derivation block,
// only the default host ("theme" vs "report"), MIME type, content, and filename differ.
function downloadTailwindTheme() {
  if (!report) return;
  const themeCss = emitTailwindTheme(report);
  const blob = new Blob([themeCss], { type: "text/css" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  let host = "theme";
  try {
    host = new URL(meta?.finalUrl ?? url).hostname.replace(/^www\./, "");
  } catch {
    if (inputMode === "image" && images[0]) {
      host = images[0].file.name.replace(/\.[^/.]+$/, "");
    }
  }
  a.href = href;
  a.download = `distill-theme-${host}.css`;
  a.click();
  URL.revokeObjectURL(href);
}
```

### Naming / style — module-level pure helper (mirror for `downloadBlob`)
```ts
// SOURCE: app/page.tsx:51-58
function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}
```
`downloadBlob` follows this same shape: a plain top-level `function`, declared just below `readFileAsDataURL`, taking every input as a parameter (no closure over component state) — matches this file's existing convention of pure I/O helpers living outside the component.

### Naming / style — component-closure handler (mirror for `deriveHost`)
```ts
// SOURCE: app/page.tsx:154-158
async function copyActiveMarkdown() {
  const textToCopy = tab === "structure" ? (structureReport?.markdown ?? "") : markdown;
  await navigator.clipboard.writeText(textToCopy);
  setCopied(true);
  setTimeout(() => setCopied(false), 1500);
}
```
All handlers in `Home()` (`copyActiveMarkdown`, `downloadActiveMarkdown`, `downloadTailwindTheme`, `analyze`, `handleFilesSelect`, `removeImage`) are plain `function` declarations closing directly over component state — no `useCallback`. `deriveHost` should follow the same convention since it needs `meta`, `url`, `inputMode`, and `images`.

### Comment convention for cross-referencing rationale
```ts
// SOURCE: app/page.tsx:41-43
/** A selected file and its data-URL preview, kept in one entry so the pairing
 *  can never drift — previews used to live in a separate array appended in
 *  `FileReader.onload` completion order, which mismatched indexes (#23). */
```
The file uses JSDoc-style block comments above declarations to record *why*, referencing issue numbers in parens. Use the same style (referencing #101) above the two new helpers to explain why they were extracted, so a future duplicate re-introduction is less likely.

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `app/page.tsx` | UPDATE | Extract `deriveHost` and `downloadBlob` helpers; rewrite `downloadActiveMarkdown` and `downloadTailwindTheme` to call them |

---

## Tasks

### Task 1: Add the `downloadBlob` module-level helper

- **File**: `app/page.tsx`
- **Action**: UPDATE
- **Implement**: Directly below `readFileAsDataURL` (after line 58, before `const MAX_IMAGES = 6;` stays where it is — actually place it after `readFileAsDataURL`'s closing brace, before the blank line leading into `export default function Home()`), add:
  ```ts
  /** Shared Blob → object URL → anchor → click → revoke sequence for the two
   *  workbench download actions, so a future fix to this plumbing can't land
   *  in one handler and silently miss the other (#101). */
  function downloadBlob(content: string, mimeType: string, filename: string): void {
    const blob = new Blob([content], { type: mimeType });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(href);
  }
  ```
- **Mirror**: `app/page.tsx:51-58` (`readFileAsDataURL`) — top-level pure function, no component state.
- **Validate**: `npm run typecheck`

### Task 2: Add the `deriveHost` closure inside `Home()`

- **File**: `app/page.tsx`
- **Action**: UPDATE
- **Implement**: Immediately above the (soon to be rewritten) `downloadActiveMarkdown`, add:
  ```ts
  /** Hostname derivation shared by both download handlers: prefer the
   *  analyzed URL's hostname, then the first uploaded image's basename,
   *  then the caller-supplied default — kept identical across both
   *  handlers so a hostname-sanitizing fix can't miss one of them (#101). */
  function deriveHost(defaultHost: string): string {
    let host = defaultHost;
    try {
      host = new URL(meta?.finalUrl ?? url).hostname.replace(/^www\./, "");
    } catch {
      if (inputMode === "image" && images[0]) {
        host = images[0].file.name.replace(/\.[^/.]+$/, "");
      }
    }
    return host;
  }
  ```
  This must stay inside `Home()` (it closes over `meta`, `url`, `inputMode`, `images` — all component state), placed right before `downloadActiveMarkdown` for locality with its two call sites.
- **Mirror**: `app/page.tsx:154-158` (`copyActiveMarkdown`) — plain closure over component state, no `useCallback`.
- **Validate**: `npm run typecheck`

### Task 3: Rewrite `downloadActiveMarkdown` to use both helpers

- **File**: `app/page.tsx`
- **Action**: UPDATE
- **Implement**: Replace the body (lines 161-179) with:
  ```ts
  function downloadActiveMarkdown() {
    const textToDownload = tab === "structure" ? (structureReport?.markdown ?? "") : markdown;
    const isStruct = tab === "structure";
    const host = deriveHost("report");
    downloadBlob(textToDownload, "text/markdown", `distill-${isStruct ? "structure-" : ""}${host}.md`);
  }
  ```
  Filename output is unchanged: `distill-<host>.md` on the tokens tab, `distill-structure-<host>.md` on the structure tab, default host `"report"`.
- **Validate**: `npm run typecheck`

### Task 4: Rewrite `downloadTailwindTheme` to use both helpers

- **File**: `app/page.tsx`
- **Action**: UPDATE
- **Implement**: Replace the body (lines 181-199) with:
  ```ts
  function downloadTailwindTheme() {
    if (!report) return;
    const themeCss = emitTailwindTheme(report);
    const host = deriveHost("theme");
    downloadBlob(themeCss, "text/css", `distill-theme-${host}.css`);
  }
  ```
  Filename output is unchanged: `distill-theme-<host>.css`, default host `"theme"`, still guarded by the existing `if (!report) return;` early exit.
- **Validate**: `npm run typecheck`

### Task 5: Full validation pass

- **File**: n/a
- **Action**: n/a
- **Implement**: Run the full gate (`typecheck`, `lint`); confirm no other file references the removed inline blocks (there shouldn't be — the duplication was confined to these two handlers per the issue).
- **Validate**: `npm run typecheck && npm run lint`

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# No unit/integration test framework in this repo (no jest/vitest); `npm run eval`
# only covers lib/extract/** and is unrelated to app/page.tsx — not applicable here.
```

## End-to-End Verification

Since this only touches a client component with no extraction-lane surface, verify manually via the dev server rather than the eval harness:

1. `npm run dev`, open `http://localhost:3000`.
2. Run a URL analysis (any reachable site). On the tokens tab, click "Download" — confirm the downloaded file is named `distill-<hostname>.md` (no `www.` prefix) and its content matches the markdown shown/copied via "Copy".
3. Switch to the structure tab (if present for that input) and click "Download" — confirm the filename is `distill-structure-<hostname>.md`.
4. Click "Download Tailwind theme" — confirm the filename is `distill-theme-<hostname>.css` and the content is a valid `@theme { … }` stylesheet (matches `emitTailwindTheme(report)` output).
5. Switch to image mode, upload an image, run an analysis (no URL set) — confirm all three downloads fall back to the uploaded image's basename (extension stripped) as the host segment.
6. With image mode and no uploaded-image fallback available (e.g. inspect via temporarily clearing `images` in devtools, or simply trust the code path since `deriveHost`'s catch branch is unchanged) — confirm the `"report"` / `"theme"` defaults are reachable in principle; this is the same fallback path as before the refactor, just centralized.
7. Confirm no console errors and that `URL.revokeObjectURL` doesn't throw (no visible symptom, but check devtools console is clean).

---

## Risks

| Risk | Mitigation |
|------|------------|
| Accidentally collapsing the two different default hosts (`"report"` vs `"theme"`) into one shared constant, silently changing fallback filenames | `deriveHost(defaultHost)` takes the default as a required parameter, per the issue's technical note; each call site passes its own literal (`"report"` / `"theme"`) — never hardcoded inside the helper. Verified by re-reading acceptance criteria before implementation. In scope, must be fixed if drifted. |
| Placing `deriveHost` at module level (outside `Home()`) would require threading 4 extra parameters (`meta`, `url`, `inputMode`, `images[0]`) at both call sites, increasing diff size and diverging from this file's closure-handler convention | Keep `deriveHost` as a component-inner closure (Task 2), matching `copyActiveMarkdown`/`analyze`/etc. Out of scope to "fix" — this is a deliberate style choice, not a defect. |
| `downloadBlob`'s generic anchor/click/revoke logic silently breaks a browser edge case (e.g. Safari's `revokeObjectURL` timing) that happened to work slightly differently between the two original inline copies | The two original blocks were already byte-identical in this section (confirmed by direct read of `app/page.tsx:161-199`), so extracting into one function changes nothing at runtime. Low risk; no mitigation needed beyond the manual E2E check (step 2-4 above) in at least one real browser. |
| ESLint ordering/unused-var rules flag the new top-level `downloadBlob` if placed in an unexpected spot relative to other top-level declarations | Place it directly below `readFileAsDataURL` (Task 1), keeping all non-component helpers grouped together as the file already does; run `npm run lint` (Task 5) to confirm. |

---

## Acceptance Criteria

- [ ] `app/page.tsx` has exactly one helper owning hostname derivation (`deriveHost`) and one helper owning blob-download (`downloadBlob`), each called by both `downloadActiveMarkdown` and `downloadTailwindTheme`.
- [ ] URL analysis, tokens tab, "Download" → file named `distill-<host>.md` (unchanged).
- [ ] URL analysis, structure tab, "Download" → file named `distill-structure-<host>.md` (unchanged).
- [ ] "Download Tailwind theme" → file named `distill-theme-<host>.css` (unchanged).
- [ ] Image input with no resolvable URL → filename falls back to the first image's basename; with no image either, falls back to `"report"` / `"theme"` per caller.
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] Only `app/page.tsx` is touched — no schema, API, or report surface changed.
