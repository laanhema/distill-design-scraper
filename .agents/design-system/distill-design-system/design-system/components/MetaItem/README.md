# MetaItem

A label/value pair for the run summary at the top of the results.

- Label in `overline` (uppercase, `ink-subtle`); value in `ui` weight, truncated with an ellipsis and the full value in its tooltip.
- Place inside a `<dl class="dt-meta">`: 2 → 4 columns, `space-6` column gap, `space-2` row gap.
- Values are literal facts ("4210 ms", "skipped (no key)"), never adjectives.

Consumer supplies: `label`, `value` (a string).

Hand-written from `app/page.tsx`.
