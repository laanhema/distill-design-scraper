# Swatch

A palette card: a `size-swatch` block of the measured colour over its role, hex and usage.

- `line` border, `radius-lg`, colour block full-bleed at the top.
- Role in `ui`; hex in `mono-sm` / `ink-subtle`; usage and area share in `micro` / `ink-faint` ("background · 62%"). The faint "img" marker flags a colour sourced from image pixels.
- Grid of 2 → 3 → 4 columns with `space-3` gaps. The swatch colour is the user's data — never a token.

Consumer supplies: `role`, `hex`, optional `usage`, `areaWeight` (0–1), `imageSourced`.

Hand-written from `app/page.tsx`.
