# Plan: TODO-5: Remove the "Copy .md" button from the workbench header

## Summary

The workbench action bar in `app/page.tsx` currently renders three buttons: a tab-aware **Copy … .md** (clipboard write + a 1.5 s "Copied ✓" toggle), **Download … .md**, and **Download Tailwind @theme**. Per #160, users download the Markdown far more often than they paste it into a hand-made file, so the copy action is removed outright. This is a pure frontend deletion: drop the `copied` state, the `copyActiveMarkdown` handler, and the copy `<button>`, leaving the two download buttons untouched in the same `ml-auto flex gap-2` container. The two docs that describe the copy action (`README.md:57`, `CLAUDE.md:128`) are updated in the same change so they don't describe a button that no longer exists. No `lib/`, schema, API, or extraction code is touched, so the eval gate is unaffected (run anyway as part of the standard gate).

## User Story

As a Distill user
I want the results header to offer only the download actions
So that the bar is simpler and I go straight to the `.md` file I actually want, instead of copying text and making the file myself

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT (UI cleanup) |
| Complexity | LOW |
| Systems Affected | `app/page.tsx` (frontend workbench), `README.md`, `CLAUDE.md` (docs) |
| GitHub Issue | #160 (story TODO-5 in `.agents/stories/todo-stories.md`) |
| Related | #159 / TODO-4 (button width shift). This change removes one of the width-shift triggers that #159 lists (the copy label's three-way text swap). It does **not** close #159 |

---

## Environment Findings

Baseline was taken at `3327045` on `main` before planning:

| Probe | Result |
|-------|--------|
| `npm run typecheck` | clean (no output from `tsc --noEmit`) |
| `npm run lint` | clean (no output from `eslint .`) |
| `npm run eval` | `aggregate combined: 100%`, `✓ all gates passed` (clean-light, dark-mode, adversarial-shell; stripe/linear/vercel skipped as optional) |
| Test framework | None (per `CLAUDE.md` "Commands"). `npm run eval` is the only automated gate, and it doesn't cover `app/page.tsx` |
| `TODO.md` | Gitignored (`.gitignore:39`), so it's a local-only tracking file. See Open Questions |

Start green, stay green: all three commands must still pass unchanged after the edit.

---

## Patterns to Follow

### The code being removed (verbatim, current line numbers)

```tsx
// SOURCE: app/page.tsx:86
const [copied, setCopied] = useState(false);
```

```tsx
// SOURCE: app/page.tsx:167-172 (followed by a blank line at :173)
async function copyActiveMarkdown() {
  const textToCopy = tab === "structure" ? (structureReport?.markdown ?? "") : markdown;
  await navigator.clipboard.writeText(textToCopy);
  setCopied(true);
  setTimeout(() => setCopied(false), 1500);
}
```

```tsx
// SOURCE: app/page.tsx:371-382 (action bar container + the copy button to delete)
<div className="ml-auto flex gap-2">
  <button
    onClick={copyActiveMarkdown}
    className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
  >
    {copied
      ? "Copied ✓"
      : tab === "structure"
        ? "Copy Structure .md"
        : "Copy Design System .md"}
  </button>
  <button
    onClick={downloadActiveMarkdown}
    ...
```

### What stays (do not touch)

```tsx
// SOURCE: app/page.tsx:189-202. Download handlers stay as-is. Their doc comments
// ("both download handlers", "the two workbench download actions" at :60-62)
// stay accurate after the copy handler is gone.
function downloadActiveMarkdown() { ... }
function downloadTailwindTheme() { ... }
```

- `useState` (`app/page.tsx:3`) is still used by a dozen other state hooks, so the import stays.
- `tab`, `markdown`, `structureReport` are still read by `downloadActiveMarkdown` and the tab panes, so no further dead state follows from removing the copy handler.
- Handler style: plain `function` closures inside `Home()`, no `useCallback` (`.agents/plans/completed/dist-053-download-plumbing-plan.md:97`). Nothing new is added, so there's nothing to mirror beyond deleting cleanly.

### Doc wording to update

```md
<!-- SOURCE: README.md:57 -->
- **Tabbed Markdown Output**: Quick tabs for Preview, Design System Tokens, and Structural Architecture. Copy and download act on the *active* tab and are labelled accordingly (*Copy Design System .md* vs. *Copy Structure .md*), so it's never ambiguous which report you're taking. A separate **Download Tailwind @theme** action emits the derived Tailwind v4 stylesheet.
```

```md
<!-- SOURCE: CLAUDE.md:128 -->
... Copy and download act on the *active* tab's markdown, and the Tailwind download calls `emitTailwindTheme(report)` client-side. ...
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `app/page.tsx` | UPDATE | Delete `copied` state, `copyActiveMarkdown`, and the copy `<button>` |
| `README.md` | UPDATE | Line 57: describe only the tab-aware **Download** action (*Download Design System .md* vs. *Download Structure .md*) plus the Tailwind download |
| `CLAUDE.md` | UPDATE | Line 128 ("Frontend"): change "Copy and download act on…" to "The markdown download acts on…" |

No files are created. Do **not** touch `.gitignore` or `.agents/stories/todo-stories.md`: both have pre-existing uncommitted changes that belong to the user.

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Remove the copy state, handler, and button

- **File**: `app/page.tsx`
- **Action**: UPDATE
- **Implement**:
  1. Delete line 86: `const [copied, setCopied] = useState(false);`
  2. Delete the whole `copyActiveMarkdown` function (lines 167-172) **and** the blank line after it, so `deriveHost`'s doc comment sits one blank line below the closing `}` of `analyze` (no double blank line left behind).
  3. In the action bar (`<div className="ml-auto flex gap-2">`, ~line 371), delete the first `<button onClick={copyActiveMarkdown} …>…</button>` element (lines 372-381). Leave the `Download … .md` and `Download Tailwind @theme` buttons, their classes, and their order exactly as they are.
- **Mirror**: N/A (pure deletion). Keep the surrounding JSX indentation intact.
- **Validate**:
  - `grep -nE "copied|setCopied|copyActiveMarkdown|clipboard|Copy (Structure|Design System)" app/page.tsx` returns **no matches**.
  - `npm run typecheck && npm run lint` are both clean (no unused-variable warnings).

### Task 2: Update README feature bullet

- **File**: `README.md`
- **Action**: UPDATE
- **Implement**: Rewrite line 57 so it no longer mentions copying. Suggested text:
  > - **Tabbed Markdown Output**: Quick tabs for Preview, Design System Tokens, and Structural Architecture. The Markdown download acts on the *active* tab and is labelled accordingly (*Download Design System .md* vs. *Download Structure .md*), so it's never ambiguous which report you're taking. A separate **Download Tailwind @theme** action emits the derived Tailwind v4 stylesheet.
- **Validate**: `grep -n -i "copy .*\.md\|Copy and download" README.md` returns no matches.

### Task 3: Update CLAUDE.md frontend section

- **File**: `CLAUDE.md`
- **Action**: UPDATE
- **Implement**: In the "Frontend (`app/page.tsx`)" paragraph (line 128), replace `Copy and download act on the *active* tab's markdown` with `The markdown download acts on the *active* tab`. Leave the rest of the sentence (Tailwind download / tab fallback) unchanged. Don't touch the unrelated "inline copy" phrasing at lines 77 and 90; those refer to duplicated code, not the button.
- **Validate**: `grep -n "Copy and download" CLAUDE.md` returns no matches.

### Task 4: Full gate

- **Validate**: `npm run typecheck && npm run lint && npm run eval` must all pass, with eval still at `aggregate combined: 100%` / `✓ all gates passed`. Eval can't move here because no `lib/` code changed. It's run because it's the CI gate.

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Regression gate (CI parity; expected unchanged at 100%)
npm run eval

# Dead-reference sweep
grep -nE "copied|setCopied|copyActiveMarkdown|clipboard|Copy (Structure|Design System)" app/page.tsx   # expect: no output
grep -n "Copy and download" README.md CLAUDE.md                                                       # expect: no output
```

## End-to-End Verification

There's no unit test for `app/page.tsx`, so verify in the real app:

1. `npm run dev` and open `http://localhost:3000`.
2. Run one analysis. The cheapest path is **Image Input**: upload any small PNG/JPG. The tokens lane needs no API key, and the structure tab shows only when a key is set. A URL run (e.g. `https://example.com`) exercises all three tabs if Chromium can reach the network.
3. **Expected** in the results header (right of the tabs): exactly two buttons, **Download Design System .md** (filled) and **Download Tailwind @theme** (outline). No "Copy" button in any tab.
4. Click through **Design System Preview → Design System Markdown → Layout Structure Markdown** (if present). The download label switches to **Download Structure .md** on the structure tab, and nothing in the bar errors or disappears.
5. Click **Download … .md** on the tokens tab and on the structure tab, then **Download Tailwind @theme**. Three files download with the existing names `distill-<host>.md`, `distill-structure-<host>.md`, `distill-theme-<host>.css`. This shows the download plumbing is untouched.
6. The browser console shows no errors (e.g. via `chrome-devtools-axi open http://localhost:3000` and its console view, or the devtools console).
7. Stop the dev server. Leave no scratch files behind.

---

## Risks

| Risk | Mitigation | Scope |
|------|------------|-------|
| Users who relied on one-click copy lose it | Accepted product decision in #160. The raw Markdown is still selectable in the `<pre>` panes of the Markdown tabs | Out of scope (intended behavior change) |
| The **Download … .md** label still swaps text per tab, so the bar can still shift width | That's #159 / TODO-4. Don't add `min-w-*` or static labels here, or the two issues' diffs collide | Out of scope, flag only |
| Leftover blank line or broken JSX indentation after deleting the handler/button | Task 1 step 2 explicitly removes the trailing blank line. Lint and typecheck catch syntax problems, and a visual diff review catches whitespace | In scope |
| Docs left describing a removed button | Tasks 2–3 plus the grep sweep in Validation | In scope |
| Accidentally staging the user's pre-existing `.gitignore` / `.agents/stories/todo-stories.md` changes | Stage only `app/page.tsx`, `README.md`, `CLAUDE.md` (and this plan, if the workflow commits plans) by explicit path, never `git add -A` | In scope |
| Merge conflict with a concurrent #159 branch, which edits the same action-bar JSX | Land #160 first (smaller). #159 then rebases onto a two-button bar | Out of scope, flag only |

---

## Open Questions

- **Tick `TODO.md:5`?** `TODO.md` is gitignored (`.gitignore:39`), so it's the user's local scratch list and not part of the commit. **Proposed default:** don't edit it during implementation. The user ticks it when the issue closes, which matches how the other items carry `(#NNN)` references managed outside the repo flow.
- **Restyle the remaining buttons now that Download is first?** Download is already the filled primary button and Tailwind the outline secondary, so the visual hierarchy reads correctly with two buttons. **Proposed default:** no styling changes. Any width/label normalization belongs to #159.

---

## Acceptance Criteria

- [ ] The "Copy … .md" button is removed from `app/page.tsx`
- [ ] `copyActiveMarkdown` and the `copied` state are deleted (no other references existed)
- [ ] The action bar shows only **Download … .md** and **Download Tailwind @theme**
- [ ] `README.md:57` and `CLAUDE.md:128` no longer describe a copy action
- [ ] `npm run typecheck`, `npm run lint`, and `npm run eval` pass with no unused variables or broken references
- [ ] End-to-End Verification steps 3–6 observed in the running app
