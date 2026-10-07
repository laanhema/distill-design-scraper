# Analyze images

A user drops or browses one to six screenshots of a design. Distill merges them into one measured palette-and-mood report. With an AI key, it also produces a vision-inferred layout skeleton. Without a key, an amber banner explains that structure is unavailable.

## Sub-features

- `img-select`: selected files show as thumbnails, and the label reads `N image(s) selected — add more`.
- `img-remove`: hovering a thumbnail reveals `Remove image N`, which removes that image and updates the count.
- `img-cap`: at most 6 images are accepted. Extra files are dropped silently.
- `img-analyze`: `Analyze Image` or `Analyze Images` returns Report Kind `palette-mood`, a Palette section, and one preview per kept image.
- `img-structure`: with the AI lane on, a `Layout Structure Markdown (inferred)` tab appears. With it off, the banner reads `Structure inference for images requires an AI key — set GEMINI_API_KEY or OPENROUTER_API_KEY.` and there is no structure tab.

## How to get to it (user POV)

- Choose `Image Input`, then choose the `browse` label to open the file picker.
- Choose `Image Input`, then drag files onto the dashed drop zone.

## Driving it with verify.sh

Preconditions:

- Baseline from the README.

- **Select, remove, analyze.** Run `$V drive analyze-images`. It screenshots the three fixtures into `inputs/*.png`, uploads all three through `#image-input`, and removes image 3. Expect `label reads "3 images selected"`, three `thumbnail … shown` checks, `after removing image 3, label reads "2 images selected"`, `API answered 200 ok`, `reportKind is palette-mood`, and `viewportShots has one entry per kept image (2)`. With the AI lane off, also expect `structure-unavailable banner is shown` and `no structure tab without a key`.
- **Single image.** Run `$V drive analyze-images --fixtures clean-light --remove 0`. The button reads `Analyze Image` and one preview is returned.
- **Inferred structure.** Run `VERIFY_AI=1 $V up`, then `$V drive analyze-images`. Expect `inferred structure tab is shown`. This makes real paid model calls.

## Gotchas

- The scenario uses the file picker path (`setInputFiles`). Drag and drop calls the same `handleFilesSelect`, but the scenario does not drive it. Don't claim the drop zone was verified.
- The `Remove image N` button has opacity 0 until hovered. Hover the thumbnail first.
- With the AI lane off, the no-key image response is cached, because a missing key is a persistent condition. A structure failure while a key is set is not cached.
- A fully transparent or unreadable image returns `422` with an actionable message. See [Error handling](./error-handling.md).
