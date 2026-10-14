# Analyze images

A user drops or browses one to six screenshots of a design. Distill merges them into one measured palette-and-mood report. With an AI key, it also produces a vision-inferred layout skeleton. Without a key, an amber banner explains that structure is unavailable.

## Sub-features

- `img-select`: selected files show as thumbnails, and the label reads `N image(s) selected — add more`.
- `img-remove`: hovering a thumbnail reveals `Remove image N`, which removes that image and updates the count.
- `img-cap`: at most 6 images are accepted. Extra files are dropped silently.
- `img-analyze`: `Analyze Image` or `Analyze Images` returns Report Kind `palette-mood` and a Palette section. The response carries no screenshots; the Preview tab shows one picture per kept image, taken from the uploads the page held at submit.
- `img-structure`: with the AI lane on, a `Layout Structure Markdown (inferred)` tab appears. With it off, the banner reads `Structure inference for images requires an AI key — set OPENROUTER_API_KEY.` and there is no structure tab.

## How to get to it (user POV)

- Choose `Image Input`, then choose the `browse` label to open the file picker.
- Choose `Image Input`, then drag files onto the dashed drop zone.

## Driving it with verify.sh

Preconditions:

- Baseline from the README.

- **Select, remove, analyze.** Run `$V drive analyze-images`. It screenshots the three fixtures into `inputs/*.png`, uploads all three through `#image-input`, and removes image 3. Expect `label reads "3 images selected"`, three `thumbnail … shown` checks, `after removing image 3, label reads "2 images selected"`, `API answered 200 ok`, `reportKind is palette-mood`, `response returns no screenshots (no viewportShot, no viewportShots)`, and `Preview shows the 2 uploaded image(s), in order`. With the AI lane off, also expect `structure-unavailable banner is shown` and `no structure tab without a key`. The scenario then removes image 1 from the form. Expect `clean-light.png thumbnail is gone after the analysis` and `Preview still shows the images held at submit time`; `04-form-edited-after-result.png` shows one thumbnail and two preview pictures.
- **Single image.** Run `$V drive analyze-images --fixtures clean-light --remove 0`. The button reads `Analyze Image` and one preview picture is shown.
- **Inferred structure.** Run `VERIFY_AI=1 $V up`, then `$V drive analyze-images`. Expect `inferred structure tab is shown`. This makes real paid model calls.

## Gotchas

- The scenario uses the file picker path (`setInputFiles`). Drag and drop calls the same `handleFilesSelect`, but the scenario does not drive it. Don't claim the drop zone was verified.
- The `Remove image N` button has opacity 0 until hovered. Hover the thumbnail first.
- After a result, a thumbnail's file name is also part of each preview picture's alt text (`Source image 1 of clean-light.png +1 more`). Match a thumbnail with `exact: true`, and find preview pictures by `Screenshot of` or `Source image N of`.
- With the AI lane off, the no-key image response is cached, because a missing key is a persistent condition. A structure failure while a key is set is not cached.
- A fully transparent or unreadable image returns `422` with an actionable message. See [Error handling](./error-handling.md).
