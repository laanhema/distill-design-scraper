# TextField

The URL input: a single-line `surface` field with a `line-strong` border.

- `body-sm` text in `ink`; placeholder is an example value ("https://stripe.com"), not an instruction.
- On focus the border becomes `line-focus` and a 2px `ring` appears. Don't remove either.
- Pair it with the primary Button in a `dt-field` row (`space-3` gap); the field takes the remaining width.

Consumer supplies: `value`, `onChange`, `type` (defaults to `url`), `placeholder`, `required`, and other native input props.

Hand-written from `app/page.tsx`.
