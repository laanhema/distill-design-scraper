# Dropzone

The image-mode drop target: a dashed `border-thick` `line-strong` box that also opens the file picker.

- Label in `ui` / `ink-soft`, with the action word underlined: "Drag & drop image(s) here, or browse". Once files are chosen it reads "N images selected — add more".
- Border goes to `line-hover` on hover. Padding `space-8`, `radius-lg`.
- Follow it with the Thumbnail strip and a `caption` help line in `ink-subtle` that states the limits plainly.

Consumer supplies: `onFiles(files)`, `count` of files already selected, optional `accept` and `id`.

Hand-written from `app/page.tsx`.
