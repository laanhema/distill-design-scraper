# Plan: TODO-2: Set cursor pointer on interactive UI buttons

## Summary

Buttons in the web workbench currently retain the default arrow cursor on hover because Tailwind CSS v4 preflight no longer enforces `cursor: pointer` on `<button>` elements by default. Per GitHub issue #157 (story TODO-2 in `.agents/stories/todo-stories.md`), this plan adds global CSS rules in `app/globals.css` targeting `button:not(:disabled)` and `[role="button"]:not([aria-disabled="true"])` to apply `cursor: pointer`, while setting `button:disabled` and `[role="button"][aria-disabled="true"]` to `cursor: not-allowed`. This ensures all interactive buttons (mode toggles, submit buttons, remove image buttons, tabs, download buttons) display a pointer cursor on hover, while disabled buttons display a non-interactive `not-allowed` cursor. This approach handles cursor styling centrally in global CSS without touching `app/page.tsx`, preserving pre-existing uncommitted changes in `app/page.tsx`, `.gitignore`, `README.md`, and `.agents/stories/todo-stories.md`.

## User Story

As a Distill workbench user
I want all interactive UI buttons to display a pointer cursor on hover and disabled buttons to display a non-interactive cursor
So that clickable components provide clear visual feedback and interactive affordance.

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT (UI styling / affordance) |
| Complexity | LOW |
| Systems Affected | `app/globals.css` (global stylesheet) |
| GitHub Issue | #157 (story TODO-2 in `.agents/stories/todo-stories.md`) |

---

## Environment Findings

Baseline was taken on `main` at `f0922ff` before planning:

| Probe | Result |
|-------|--------|
| `npm run typecheck` | clean (no output from `tsc --noEmit`) |
| `npm run lint` | clean (no output from `eslint .`) |
| `npm run eval` | `aggregate combined: 100%`, `✓ all gates passed` (clean-light, dark-mode, adversarial-shell; stripe/linear/vercel skipped as optional) |
| Test framework | None (per `CLAUDE.md` "Commands"). `npm run eval` is the only automated gate |
| Working tree state | Uncommitted changes present in `.gitignore`, `README.md`, `app/page.tsx`, and untracked `.agents/stories/todo-stories.md`. Target file `app/globals.css` is clean |

Start green, stay green: all verification commands must pass unchanged after the edit.

---

## Patterns to Follow

### Existing `app/globals.css`

```css
// SOURCE: app/globals.css:1-11
@import "tailwindcss";

:root {
  color-scheme: light dark;
}

html,
body {
  height: 100%;
}
```

### Global Button Cursor Rules to Append

```css
/* SOURCE: Technical notes on issue #157 */
button:not(:disabled),
[role="button"]:not([aria-disabled="true"]) {
  cursor: pointer;
}

button:disabled,
[role="button"][aria-disabled="true"] {
  cursor: not-allowed;
}
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `app/globals.css` | UPDATE | Append global rules for `button` and `[role="button"]` cursor states (`pointer` for enabled, `not-allowed` for disabled) |

Do **not** touch `app/page.tsx`, `README.md`, `.gitignore`, or `.agents/stories/todo-stories.md`: all carry pre-existing uncommitted changes belonging to the user context.

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Append button cursor rules to `app/globals.css`

- **File**: `app/globals.css`
- **Action**: UPDATE
- **Implement**: Append the CSS rules for interactive (`button:not(:disabled)`, `[role="button"]:not([aria-disabled="true"]) { cursor: pointer; }`) and non-interactive (`button:disabled`, `[role="button"][aria-disabled="true"] { cursor: not-allowed; }`) elements.
- **Mirror**: `app/globals.css` existing structure under `@import "tailwindcss";`.
- **Validate**: `npm run typecheck && npm run lint && npm run eval`

### Task 2: Verify full test gate & working tree isolation

- **Validate**:
  - `npm run typecheck && npm run lint && npm run eval` must pass cleanly.
  - `git status` shows modification only in `app/globals.css` (plus existing uncommitted files untouched).

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Eval gate
npm run eval
```

## End-to-End Verification

1. Start dev server: `npm run dev` and open `http://localhost:3000`.
2. Hover over mode toggles ("URL Input", "Image Input"). Verify cursor is `pointer`.
3. Hover over the "Analyze" button with a valid URL entered. Verify cursor is `pointer`.
4. Switch to Image mode with no images selected or clear URL input. Hover over the disabled "Analyze" button. Verify cursor is `not-allowed`.
5. Upload an image, hover over the remove `×` button on image thumbnail. Verify cursor is `pointer`.
6. Perform an analysis, then hover over results tabs ("Design System Preview", "Design System Markdown", "Layout Structure Markdown") and download buttons ("Download Design System .md", "Download Tailwind @theme"). Verify cursor is `pointer`.

---

## Risks

| Risk | Mitigation | Scope |
|------|------------|-------|
| Modifying `app/page.tsx` collides with pre-existing uncommitted changes | Place all rules in `app/globals.css`, avoiding edits to `app/page.tsx` | In scope (mitigated by design) |
| Class specificity conflict with Tailwind utilities | Element and attribute selectors (`button`, `[role="button"]`) have low CSS specificity ((0,0,1) / (0,1,0)), allowing utility classes (e.g. `cursor-default` or `disabled:cursor-not-allowed`) to override when explicitly specified | In scope |
| `[role="button"]` elements without `aria-disabled` handling | Explicitly selector-gate using `:not([aria-disabled="true"])` and `[aria-disabled="true"]` | In scope |

---

## Open Questions

- **Update local gitignored `TODO.md:2`?** `TODO.md` is gitignored (`.gitignore:39`), so it is a local scratch file. **Proposed default:** Do not edit `TODO.md` during implementation; the user will update tracking when the issue closes.
- **Modify `app/page.tsx` button components directly with `cursor-pointer`?** **Proposed default:** No, use global CSS in `app/globals.css` to keep `app/page.tsx` clean and avoid touching uncommitted changes in `app/page.tsx`.

---

## Acceptance Criteria

- [ ] Global CSS rules added to `app/globals.css` for enabled (`cursor: pointer`) and disabled (`cursor: not-allowed`) buttons and `[role="button"]` elements.
- [ ] All interactive buttons across UI show a pointer cursor on hover.
- [ ] Disabled buttons show a `not-allowed` cursor on hover.
- [ ] Pre-existing uncommitted changes in `app/page.tsx`, `README.md`, `.gitignore`, and `.agents/stories/todo-stories.md` are preserved.
- [ ] `npm run typecheck`, `npm run lint`, and `npm run eval` pass cleanly.
