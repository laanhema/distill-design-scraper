# Plan: DIST-045 — Dynamic contextual action labels & meta panel key hint in app/page.tsx

## Summary

Update workbench Copy and Download button labels in `app/page.tsx` to dynamically adapt based on whichever report tab is active ("design" vs "structure"). Resolve legacy helper logic around line 162, and add a non-intrusive setup hint in the meta panel for configuring `GEMINI_API_KEY`.

## Metadata

| Field | Value |
|-------|-------|
| Type | FEATURE |
| Priority | MEDIUM |
| Complexity | SMALL |
| Systems Affected | `app/page.tsx` |
| GitHub Issue | #89 |

---

## Tasks

### Task 1: Dynamic button labels and meta setup hint
- **File**: `app/page.tsx`
- **Action**: UPDATE
- **Implement**:
  - Format Copy button label: `tab === "structure"` ? `"Copy Structure .md"` : `"Copy Design System .md"`.
  - Format Download button label: `tab === "structure"` ? `"Download Structure .md"` : `"Download Design System .md"`.
  - Cleanly resolve legacy line 162 download helper logic.
  - Render an optional setup hint in the `Preview` meta panel when `meta.aiApplied` is false, linking to `https://aistudio.google.com/apikey`.
- **Validate**: `npm run lint && npm run typecheck && npm run dev` manual test.

---

## Validation

- Type check: `npm run typecheck`
- Lint: `npm run lint`
- Workbench UI: Test tab switching in dev server.
