# TokenSample

Visual samples of measured scale values: spacing bars, radius squares, shadow cards.

- `kind="spacing"`: a `mark` bar (capped at 32px wide) and the px value in `mono-sm`, in a `line`-bordered pill.
- `kind="radius"`: a `size-sample` square, `border-thick` `mark` outline on `fill`, the value inside.
- `kind="shadow"`: a `surface` card wearing the measured shadow, its name and value in `mono-sm`.
- The sampled value is the user's data and is applied inline; the frame around it uses tokens.

Consumer supplies: `kind`, `value`, and for shadows `name`.

Hand-written from `app/page.tsx`.
