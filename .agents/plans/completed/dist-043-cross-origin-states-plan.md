# Plan: DIST-043 — Cross-origin hover/focus state capture (Strategy A)

## Summary

Recover hover and focus states from cross-origin `<link>`ed stylesheets that throw `SecurityError` on `.cssRules`. Re-fetch cross-origin sheets via `page.context().request.get(href)` and re-parse them in a detached HTML document, preserving declared-delta semantics with zero schema or downstream changes.

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT |
| Complexity | LARGE |
| Systems Affected | `lib/extract/styleDump.ts` |
| GitHub Issue | #77 |

---

## Tasks

### Task 1: Re-fetch and re-parse cross-origin stylesheets
- **File**: `lib/extract/styleDump.ts`
- **Action**: UPDATE
- **Implement**: Collect hrefs of stylesheets throwing `SecurityError` during DOM walk, re-fetch Node-side via `page.context().request.get(href)` with try/catch best-effort degradation, re-parse in detached document, and merge hover/focus states and `@keyframes`.
- **Validate**: `npm run lint && npm run typecheck && npm run eval`

---

## Validation

- Type check: `npm run typecheck`
- Lint: `npm run lint`
- Eval harness: `npm run eval`
