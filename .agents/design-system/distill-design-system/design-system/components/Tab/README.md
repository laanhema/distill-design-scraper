# Tab

A segmented tab: switches the input mode (URL / Image) and the results pane (Preview / Markdown / Structure).

- Put tabs in a row with `space-2` gaps over a `line` rule (`dt-tabbar`); actions may sit at the right end of the same bar.
- The `active` tab fills with `action` and `on-action` text; others are `ink-muted` and wash to `fill` on hover. Labels are `ui`, Title Case.
- A tab whose pane may not exist (structure) is hidden, not disabled; if the active pane disappears, fall back to the first tab.

Consumer supplies: `active`, `onClick`, the label.

Hand-written from `app/page.tsx`.
