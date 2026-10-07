# Result tabs and downloads

After a successful analysis, the user switches between the rendered preview, the raw design-system Markdown, and the layout-structure Markdown. They can download the active tab's Markdown or a Tailwind v4 `@theme` stylesheet built in the browser from the same report.

## Sub-features

- `tab-preview`: `Design System Preview` is the default tab.
- `tab-tokens`: `Design System Markdown` shows the report's Markdown (YAML frontmatter plus body) verbatim.
- `tab-structure`: `Layout Structure Markdown` shows the structure report's Markdown. It is present only when a structure report came back.
- `dl-markdown`: the Markdown button follows the active tab. It reads `Download Layout Structure .md` and saves `distill-structure-<host>.md` on the structure tab. On the other tabs it reads `Download Design System .md` and saves `distill-<host>.md`.
- `dl-tailwind`: `Download Tailwind @theme` saves `distill-theme-<host>.css` containing an `@theme { … }` block.

## How to get to it (user POV)

- Analyze a URL or images, then use the tab buttons and the download buttons on the right of the tab bar.

## Driving it with verify.sh

Preconditions:

- Baseline from the README.

- **All tabs and downloads.** Run `$V drive tabs-downloads`. It analyzes `clean-light`, then visits each tab and clicks each download. Expect `tokens tab shows the design markdown`, `"Download Design System .md" saves distill-127.0.0.1.md`, `downloaded design .md equals API markdown`, `structure tab shows the structure markdown`, `"Download Layout Structure .md" saves distill-structure-127.0.0.1.md`, `downloaded structure .md equals API structureReport.markdown`, `"Download Tailwind @theme" saves distill-theme-127.0.0.1.css`, `Tailwind theme contains an @theme block`, and `download label reverts on preview tab`. The saved files are in `downloads/`, and `tab-*.png` shows each tab.
- **Header layout stability.** Run `$V drive tab-layout`. At 1280, 1024, 768 and 390px it switches through all three tabs and records each header button's box, its rendered line count, the scrollbar gutter, and page overflow. Expect `header buttons keep their boxes on …`, `header labels stay on one line on …`, `scrollbar gutter unchanged on …` and `no horizontal page overflow on …` for every width. `tab-bar-layout.json` holds the raw geometry, and `tab-bar-<width>-<tab>.png` shows each state.
- **Image source host.** For an image analysis, the filename host comes from the first image's base name. The scenario doesn't cover this. Extend `drive.ts` before you claim it.

## Gotchas

- The download content is compared byte for byte with `response.json`'s source fields, not just checked for existence. Keep that standard.
- The structure tab disappears when a later analysis returns no structure, and the active tab falls back to preview. Don't assume a tab still exists after a re-analysis.
- `www.` is stripped from the host in filenames.
