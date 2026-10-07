# Chip

Small `caption` pills for listing measured facts.

- `variant="outline"` (default): `line` border, `radius-full`. Contrast pairs; add `verdict` to append the bold WCAG word in `pass-ink` or `fail-ink`. The word carries the meaning — never colour alone.
- `variant="filled"`: `fill`, `radius-full`. Identity adjectives.
- `variant="tag"`: `fill`, `radius-md`. Font families as **name** · role · classification.
- Wrap them in a row with `space-2` gaps.

Consumer supplies: the text (children), optional `verdict`.

Hand-written from `app/page.tsx`.
