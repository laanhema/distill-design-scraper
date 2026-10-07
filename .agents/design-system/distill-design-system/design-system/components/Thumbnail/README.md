# Thumbnail

A 64px square preview of an uploaded image, with a hover-revealed remove button.

- `size-swatch` square, `radius-md`, `line` border, image `object-fit: cover`.
- The remove button is a `size-dismiss` `scrim` square in the top-right corner with a white `×`; it appears on hover (and on keyboard focus).
- Lay thumbnails in a wrapping row with `space-2` gaps, in the order the files were selected.

Consumer supplies: `src` (a data URL), `alt` (the file name), `onRemove`, optional `removeLabel` ("Remove image 2").

Hand-written from `app/page.tsx`.
