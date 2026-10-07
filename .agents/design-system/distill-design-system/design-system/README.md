Distill is a workbench: point it at a URL or drop in an image, get a Markdown design system back. The interface is a quiet, monochrome instrument panel — one centred column, neutral greys, hairline borders, the system font — so the colours being *measured* are the only colours on screen. Every value here is Tailwind CSS v4.3.3's default theme, exactly as the app uses it; nothing is custom.

## Principles

- **Measured, never faked.** The product's core rule is that a lane with no signal is omitted, not synthesised. The UI follows it: show what exists, label where it came from (a provenance `Badge`: `measured`, `inferred`, `ai`), and leave the rest out.
- **Neutral chrome, coloured content.** Chrome is greys only. Hue appears for exactly two reasons: a state (error, warning, WCAG verdict) or the user's own data (palette swatches, screenshots).
- **Borders, not shadows.** Surfaces separate with `line` hairlines. `shadow-sm` is used once — on screenshots of the analysed page.
- **One column.** Everything lives in a single `container-4xl` (56rem) column with a `space-6` gutter and `space-16` top and bottom padding.

## Content fundamentals

- Voice is a precise engineer's: plain, technical, unembellished. Name the thing exactly — "Track A (Design System, measured)", "fidelity: inferred", "skipped (no key)".
- Titles and controls use **Title Case**: "URL Input", "Design System Preview", "Download Layout Structure .md", "Analyze Images". Body sentences use sentence case.
- Labels say what happens to *what*: "Download Design System .md", not "Download". Button labels follow count: "Analyze Image" / "Analyze Images".
- Progress copy says what is being measured, ending in an ellipsis character: "Rendering, measuring palette, typography, layout tokens & harvesting structure…". The busy button reads "Analyzing…".
- Errors lead with a bold one-line verdict, then the detail: **Couldn't analyze this input.** Request failed (413).
- Honesty about limits is part of the copy: "Layout structure from an image is vision-inferred, not measured (no DOM to walk)".
- Use `&` and `→` freely; use em dashes for asides. Code identifiers (`GEMINI_API_KEY`, `fidelity: inferred`) are always set in `code`.
- Emoji: none in the interface, with one existing exception — the 💡 before **Setup Hint:**. Don't add more.

## Colour

Two layers. **Primitives** (`neutral-50` … `neutral-950`, `red-*`, `amber-*`, `green-*`, `white`, `black`) are Tailwind's values, only the steps the app uses. **Semantic tokens** name the roles the code gives them, with a light and a dark value each; build with semantic tokens only.

- Page: `ink` on `bg`. Raised fields (inputs, cards): `surface`. Code and hints: `surface-sunken`.
- Secondary text `ink-muted`; tertiary `ink-subtle`; annotations nobody must read `ink-faint`.
- The primary action is `action` with `on-action` text; hover moves to `action-hover`. It *inverts* by theme — near-black in light, white in dark.
- Quiet fills: `fill` (chips, hover wash), `fill-strong` (badges).
- Borders: `line` for hairlines, `line-strong` for control outlines, `line-hover` on dropzone hover, `line-focus` + `ring` on a focused input.
- States: `danger-bg` / `danger-line` / `danger-ink` for errors; `warning-*` for the structure-unavailable notice; `pass-ink` and `fail-ink` for the WCAG verdict word in contrast chips — the word always carries the meaning, never the colour alone.
- `scrim` (black at 60%) under the white × that removes a thumbnail.
- Theme switching: the app follows `prefers-color-scheme` (`color-scheme: light dark`); there is no manual toggle.

Known source misses, kept exact: `ink-faint` is ≈2.6:1 on `surface` in light; `ink-subtle` drops to 4.2:1 on `bg` and 3.8:1 on `surface` in dark; `line-strong` and `ring` are under 3:1 in both themes.

## Typography

One family: the platform system UI stack (`sans`: -apple-system, Segoe UI, Roboto…), with `mono` (ui-monospace, SF Mono, Menlo…) for values and code. No web fonts are loaded.

- `display` — the product name only (36/40, semibold, −0.025em).
- `heading` — results section titles (18/28, semibold), each followed by a provenance `Badge`.
- `body` for paragraphs; `body-sm` for inputs, alerts and lists; `ui` (14/20 medium) for every button, tab and control label.
- `caption` for help copy and chips; `caption-strong` for small buttons and the header kicker; `micro` (11px) for swatch usage lines.
- `overline` — meta labels and list headings, set uppercase with wide tracking in `ink-subtle`. `badge` — 10px uppercase provenance labels.
- `mono-sm` for hex codes, token names and pixel values; `code-block` (12px, 1.625 leading) for the Markdown output panes.
- Weights in use: 400, 500 (`font-medium`), 600 (`font-semibold`). Nothing bold beyond the `<strong>` verdicts.

## Space, shape, layout

- Spacing is Tailwind's 0.25rem unit. Controls pad `space-2.5`×`space-5` (buttons) or `space-1.5`×`space-3` (tabs, small buttons). Rows of chips, tabs and thumbnails gap `space-2`. Sections stack `space-10` apart; result blocks `space-8`.
- Radii by size: `radius-sm` for badges, `radius-md` for tabs, tags, small buttons, thumbnails and list items, `radius-lg` for primary buttons, inputs, the dropzone, alerts, swatch cards and code blocks, `radius-full` for chips.
- Borders are `border-hairline` (1px) everywhere; `border-thick` (2px) for the dashed dropzone and radius samples.
- Grids collapse with the viewport: swatches 2 → 3 → 4 columns (`sm`, `md`), meta 2 → 4, mood lists and screenshots 1 → 2.

## States and motion

- Hover: primary buttons go to `action-hover`; inactive tabs and secondary buttons gain a `fill` wash; the dropzone border goes to `line-hover`.
- Focus: inputs switch to a `line-focus` border plus a 2px `ring`. Buttons keep the browser's default focus outline — the source sets none; don't remove it.
- Disabled: `opacity-disabled` and `cursor: not-allowed`. Every enabled button gets `cursor: pointer`.
- Busy: the submit button relabels ("Analyzing…") and disables; a status line in `ink-subtle` pulses (opacity 1 → `opacity-pulse`, 2s, cubic-bezier(0.4, 0, 0.6, 1), infinite).
- Transitions: Tailwind's default — 150ms, cubic-bezier(0.4, 0, 0.2, 1) — on colour, background and border changes. Nothing moves or scales.
- The thumbnail remove button is hidden until the thumbnail is hovered.

## Iconography and imagery

There is no icon set and no logo: the wordmark is the name set in `display`. The only glyphs are text characters — `×` to remove, `→` and `·` as separators, `…` for progress. Keep it that way; if an icon is ever needed, prefer a text glyph. The images on screen are the user's own: uploaded thumbnails (`size-swatch`, `object-cover`) and full-width screenshots with `radius-lg`, a `line` border and `shadow-sm`.

## Components

`window.Distill` holds `Button`, `Tab`, `TextField`, `Dropzone`, `Thumbnail`, `Alert`, `Badge`, `Chip`, `Swatch`, `MetaItem`, `SectionTitle`, `MoodList`, `CodeBlock` and `TokenSample`, each recreated from `app/page.tsx` and styled by `components/bundle.css` (classes prefixed `dt-`). They need React on the page.

> **Not synced:** the repository ships no font files, logos or icons, and no component library — its components are local functions inside one page, so these are hand-written recreations of that markup (static Tailwind classes translated to tokens), not a build. Layout-only wrappers (`Home`, `Preview`) and the screenshot gallery are not cards. Tailwind's `rounded-full` (`calc(infinity * 1px)`) is stored as 9999px, and neutral hues written `none` are stored as `0`.
