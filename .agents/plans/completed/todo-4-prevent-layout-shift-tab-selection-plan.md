# Plan: TODO-4: Prevent layout shift and button width changes on tab selection

## Summary

In the workbench results header of `app/page.tsx`, switching between tabs ("Design System Preview", "Design System Markdown", and "Layout Structure Markdown") causes the primary Markdown download action button label to dynamically toggle between `"Download Design System .md"` (25 chars) and `"Download Layout Structure .md"` (29 chars). This character-length difference causes the button container width to jump dynamically, creating layout jitter across neighboring elements in the tab action bar (`ml-auto flex gap-2`). Per GitHub issue #159 (TODO-4), this plan standardizes the action button label to a static concise string (`"Download Markdown"`), completely eliminating text-length shifts on tab changes. In addition, explicit layout stability styling (`whitespace-nowrap`, `shrink-0`) is applied to the action button bar and tab container to ensure dimensional stability and responsive alignment on smaller viewports. `README.md` documentation is updated to match the standardized button label.

## User Story

As a Distill workbench user
I want the action buttons in the results header to maintain stable widths when switching between tabs
So that the results header layout remains visually stable without button resizing or element jitter.

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT (UI stability) |
| Complexity | LOW |
| Systems Affected | `app/page.tsx` (workbench results header), `README.md` (documentation) |
| GitHub Issue | #159 (story TODO-4 in `.agents/stories/todo-stories.md`) |
| Related | #160 / TODO-5 (removed "Copy .md" button, leaving "Download .md" and "Download Tailwind @theme") |

---

## Environment Findings

Baseline was taken on `main` at commit `fc944da` before planning:

| Probe | Result |
|-------|--------|
| `npm run typecheck` | clean (`tsc --noEmit` passed with code 0) |
| `npm run lint` | clean (`eslint .` passed with code 0) |
| `npm run eval` | `aggregate combined: 100%`, `✓ all gates passed` (clean-light, dark-mode, adversarial-shell; stripe/linear/vercel skipped as optional) |
| Test framework | None (`npm run eval` is the sole automated correctness gate per `CLAUDE.md`) |
| Git status | Clean working tree on `main` |

Start green, stay green: all verification commands must pass unchanged after the edit.

---

## Patterns to Follow

### Existing dynamic label in `app/page.tsx` causing width shift

```tsx
// SOURCE: app/page.tsx:363-376
<div className="ml-auto flex gap-2">
  <button
    onClick={downloadActiveMarkdown}
    className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
  >
    {tab === "structure" ? "Download Layout Structure .md" : "Download Design System .md"}
  </button>
  <button
    onClick={downloadTailwindTheme}
    className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
  >
    Download Tailwind @theme
  </button>
</div>
```

### Proposed layout-stable button structure in `app/page.tsx`

```tsx
<div className="ml-auto flex shrink-0 gap-2">
  <button
    onClick={downloadActiveMarkdown}
    className="whitespace-nowrap rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
  >
    Download Markdown
  </button>
  <button
    onClick={downloadTailwindTheme}
    className="whitespace-nowrap rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
  >
    Download Tailwind @theme
  </button>
</div>
```

### Documentation update in `README.md`

```md
<!-- SOURCE: README.md:57 -->
- **Tabbed Markdown Output**: Quick tabs for Preview, Design System Tokens, and Structural Architecture. The Markdown download acts on the *active* tab (*Download Markdown*), so it's never ambiguous which report you're taking. A separate **Download Tailwind @theme** action emits the derived Tailwind v4 stylesheet.
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `app/page.tsx` | UPDATE | Standardize download button text to static `"Download Markdown"` and add `whitespace-nowrap`/`shrink-0` to stabilize layout on tab selection |
| `README.md` | UPDATE | Update feature list description of tabbed Markdown download action label |

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Update action button labels and flex styling in `app/page.tsx`

- **File**: `app/page.tsx`
- **Action**: UPDATE
- **Implement**:
  1. Replace the ternary label `{tab === "structure" ? "Download Layout Structure .md" : "Download Design System .md"}` with static string `"Download Markdown"`.
  2. Add `shrink-0` to the `ml-auto flex gap-2` container div to prevent width squeezing.
  3. Add `whitespace-nowrap` to both action buttons in the header bar to prevent unintended text wrapping.
- **Mirror**: Existing workbench button structure at `app/page.tsx:363-376`.
- **Validate**: `npm run typecheck && npm run lint`

### Task 2: Update documentation reference in `README.md`

- **File**: `README.md`
- **Action**: UPDATE
- **Implement**: Update line 57 in `README.md` to reference the static button label `*Download Markdown*`.
- **Mirror**: `README.md:57`.
- **Validate**: `npm run lint`

### Task 3: Run full verification suite

- **Validate**: `npm run typecheck && npm run lint && npm run eval`

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Eval test gate
npm run eval
```

---

## End-to-End Verification

1. Start Next.js dev server: `npm run dev`
2. Open workbench UI in browser (`http://localhost:3000`).
3. Enter a sample URL or drop an image and click Analyze.
4. When results appear, switch back and forth between "Design System Preview", "Design System Markdown", and "Layout Structure Markdown" tabs.
5. Verify that:
   - The "Download Markdown" button width remains identical on every tab selection.
   - Neighboring elements (tab headers, "Download Tailwind @theme" button) do not shift or jitter horizontally during tab clicks.
   - Clicking "Download Markdown" while on "Design System Markdown" downloads `distill-<host>.md`.
   - Clicking "Download Markdown" while on "Layout Structure Markdown" downloads `distill-structure-<host>.md`.

---

## Risks

| Risk | Mitigation | Scope Call |
|------|------------|------------|
| User might be uncertain which Markdown file will download if the label is static `"Download Markdown"`. | The tab UI clearly highlights the active tab ("Design System Preview", "Design System Markdown", or "Layout Structure Markdown"), and `downloadActiveMarkdown()` downloads the active tab's report. | In-scope: Use concise static label `"Download Markdown"`. |
| Action buttons could overflow or wrap awkwardly on mobile viewports. | Add `whitespace-nowrap` and `shrink-0` layout controls so action buttons stay compact and aligned. | In-scope: Included in `app/page.tsx` CSS updates. |

---

## Open Questions

- **Label Wording Preference**: Should the static button label be `"Download Markdown"` or `"Download .md"`?
  - *Proposed Default*: `"Download Markdown"`. It is explicit, readable, concise, and maintains a stable width across tab selections without dynamic text swapping.
- **Alternative Approach (Dynamic Label with Fixed Width)**: Should dynamic text be retained (`"Download Design System .md"` vs `"Download Layout Structure .md"`) while wrapping the button in a fixed CSS width (e.g. `min-w-[215px]`)?
  - *Proposed Default*: No. Static label `"Download Markdown"` is cleaner, avoids wordiness, and directly follows the issue technical note to "simplify button labels to static concise text".

---

## Acceptance Criteria

- [ ] Action buttons in the results header maintain stable widths when switching between "Design System Preview", "Design System Markdown", and "Layout Structure Markdown" tabs.
- [ ] Buttons do not unexpectedly resize or cause neighboring elements to jitter during tab switching or state toggling.
- [ ] Layout remains visually aligned and responsive across desktop and smaller viewports.
- [ ] `npm run typecheck`, `npm run lint`, and `npm run eval` pass with 0 errors.
