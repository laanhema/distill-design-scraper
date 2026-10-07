# Integrating the Distill theme into distill-design-scraper

This zip contains:

| Path | What it is |
|---|---|
| `integration/distill-theme.css` | Drop-in Tailwind v4 theme: semantic colour tokens (`bg`, `ink`, `action`, …) with light and dark values |
| `integration/distill-theme.patch` | A git patch that adds the theme and moves `app/page.tsx` and `app/layout.tsx` onto it |
| `design-system/` | The full design system: `README.md` (guidelines), `tokens.json`, component guidelines and previews, `components/bundle.css` and `bundle.js` |

The theme does **not** change how the app looks. The patch swaps hard-coded Tailwind palette classes (`bg-neutral-900 … dark:bg-white`) for role-named ones (`bg-action`) that resolve to the same colours. I checked this by comparing computed colours in both colour schemes. There is one exception: in dark mode the setup-hint box is now solid `neutral-900`, the same as the code blocks, where it used to be `neutral-900` at 50% opacity.

---

## Option A: apply the patch (about 1 minute)

From the root of your `distill-design-scraper` checkout, on a new branch:

```bash
git checkout -b feat/distill-theme
git apply --check /path/to/integration/distill-theme.patch   # dry run
git apply /path/to/integration/distill-theme.patch
npm run lint && npm run typecheck
npm run dev                                                   # check it in light and dark
git add -A && git commit -m "Adopt Distill semantic colour tokens"
```

The patch was made against `main@3216249`. If `app/page.tsx` has changed since then and the patch doesn't apply, use Option B.

## Option B: integrate by hand

### 1. Add the theme file

Copy `integration/distill-theme.css` to `app/distill-theme.css`.

### 2. Import it after Tailwind

`app/globals.css`:

```css
@import "tailwindcss";
@import "./distill-theme.css";
```

That's the whole setup. Tailwind v4 reads the `@theme inline { --color-ink: var(--ink); … }` block and generates `bg-ink`, `text-ink`, `border-ink`, `ring-ink`, and so on for every token. The `--ink`-style variables switch between light and dark values on `prefers-color-scheme`, so you no longer need `dark:` variants for colour.

### 3. Replace palette classes with tokens

Use this table. Each row replaces the whole light-plus-dark pair with one class.

| Before | After |
|---|---|
| `bg-neutral-50 dark:bg-neutral-950` (body) | `bg-bg` |
| `text-neutral-900 dark:text-neutral-100` | `text-ink` |
| `text-neutral-600 dark:text-neutral-400` | `text-ink-muted` |
| `text-neutral-700 dark:text-neutral-300` | `text-ink-soft` |
| `text-neutral-500` | `text-ink-subtle` |
| `text-neutral-400` | `text-ink-faint` |
| `text-neutral-800 dark:text-neutral-200` (inline code) | `text-ink-code` |
| `bg-white dark:bg-neutral-900` (input, cards) | `bg-surface` |
| `bg-neutral-50 dark:bg-neutral-900` (code blocks, hint) | `bg-surface-sunken` |
| `bg-neutral-100 dark:bg-neutral-800` / `hover:` same | `bg-fill` / `hover:bg-fill` |
| `bg-neutral-200 dark:bg-neutral-800` (badges) | `bg-fill-strong` |
| `border-neutral-200 dark:border-neutral-800` | `border-line` |
| `border-neutral-300 dark:border-neutral-700` | `border-line-strong` |
| `hover:border-neutral-400 dark:hover:border-neutral-600` | `hover:border-line-hover` |
| `focus:border-neutral-500` | `focus:border-line-focus` |
| `focus:ring-neutral-300 dark:focus:ring-neutral-700` | `focus:ring-ring` |
| `bg-neutral-900 text-white dark:bg-white dark:text-neutral-900` | `bg-action text-on-action` |
| `hover:bg-neutral-700 dark:hover:bg-neutral-200` | `hover:bg-action-hover` |
| `bg-neutral-800 dark:bg-neutral-200` / `border-…` same (scale samples) | `bg-mark` / `border-mark` |
| `border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300` | `border-danger-line bg-danger-bg text-danger-ink` |
| `border-amber-300 bg-amber-50 text-amber-800 dark:…amber…` | `border-warning-line bg-warning-bg text-warning-ink` |
| `text-green-700 dark:text-green-400` (WCAG pass) | `text-pass-ink` |
| `text-red-600 dark:text-red-400` (WCAG fail) | `text-fail-ink` |
| `bg-black/60` (thumbnail remove button) | `bg-scrim` |

Spacing, radius, type sizes and `shadow-sm` stay as they are: the design system's spacing, radius and type tokens are Tailwind's own defaults, so `px-5`, `rounded-lg`, `text-sm` and the rest already match it.

### 4. Check for leftovers

```bash
grep -nE "neutral-|dark:" app/page.tsx app/layout.tsx   # should print nothing
```

`text-white` on the thumbnail remove button stays, because it sits on `bg-scrim` over a photo in both themes.

---

## Working with the theme from now on

- **Changing a colour:** edit its value in the `:root` block (light) or one of the two dark blocks of `app/distill-theme.css`. Every component using that role updates. Keep `design-system/tokens.json` (or the design system page) in step so the guidelines stay accurate.
- **Adding a role:** add `--name` to all three blocks, then `--color-name: var(--name);` to `@theme inline`.
- **A manual light/dark toggle (optional):** the theme already responds to `<html data-theme="dark">` and `<html data-theme="light">`, which override the OS setting. If you add a toggle and still use `dark:` variants anywhere, also add `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));` to `globals.css` so those variants follow the attribute.
- **Picking classes:** `design-system/README.md` explains which role to use where. For example, `ink-faint` is only for annotations nobody has to read, because it fails AA contrast in light mode.

## Known contrast gaps

These are carried over unchanged from the current UI:

- `ink-faint` is about 2.6:1 on `surface` in light mode.
- `ink-subtle` is 4.2:1 on `bg` and 3.8:1 on `surface` in dark mode.
- `line-strong` and `ring` are under 3:1 in both themes.

Fixing any of them is now a one-line change in `distill-theme.css`.
