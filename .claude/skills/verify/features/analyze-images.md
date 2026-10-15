# Analyze images

A user drops or browses one to six screenshots of a design. Distill merges them into one measured palette-and-mood report. With an AI key, it also produces a vision-inferred layout skeleton. Without a key, an amber banner explains that structure is unavailable.

## Sub-features

- `img-select`: selected or dropped files show as thumbnails, and the label reads `N image(s) selected — add more`.
- `img-remove`: hovering a thumbnail reveals `Remove image N`, which removes that image and updates the count.
- `img-cap`: at most 6 images are accepted, as the hint below the zone says (`up to 6`). Extra files are dropped silently, in the form and again by the API.
- `img-analyze`: `Analyze Image` or `Analyze Images` returns Report Kind `palette-mood` and a Palette section. The response carries no screenshots; the Preview tab shows one picture per kept image, taken from the uploads the page held at submit.
- `img-structure`: with the AI lane on, a `Layout Structure Markdown (inferred)` tab appears, labelled so because its `fidelity` is `inferred`. With it off, the banner reads `Structure inference for images requires an AI key — set OPENROUTER_API_KEY.` and there is no structure tab.

## How to get to it (user POV)

- Choose `Image Input`, then choose the `browse` label to open the file picker.
- Choose `Image Input`, then drag files onto the dashed drop zone.

## Driving it with verify.sh

Preconditions:

- Baseline from the README.

- **Select, remove, analyze.** Run `$V drive analyze-images`. It screenshots the three fixtures into `inputs/*.png`, uploads all three through `#image-input`, and removes image 3. Expect `label reads "3 images selected"`, three `thumbnail … shown` checks, `after removing image 3, label reads "2 images selected"`, `adversarial-shell.png thumbnail is gone`, `API answered 200 ok`, `reportKind is palette-mood`, `response returns no screenshots (no viewportShot, no viewportShots)`, `Preview shows the 2 uploaded image(s), in order`, `meta.aiOutcome is no-key`, and `Preview renders the Palette section`. With the AI lane off, also expect `structureUnavailableReason returned without a key`, `structure-unavailable banner is shown` and `no structure tab without a key`. The scenario then removes image 1 from the form. Expect `clean-light.png thumbnail is gone after the analysis` and `Preview still shows the images held at submit time`; `04-form-edited-after-result.png` shows one thumbnail and two preview pictures.
- **Single image.** Run `$V drive analyze-images --fixtures clean-light --remove 0`. Expect `label reads "1 image selected"` and `Preview shows the 1 uploaded image(s), in order`. No check asserts the singular button label; `00-images-selected.aria.yaml` shows `button "Analyze Image"`.
- **Cap.** No scenario picks more than 6 files. The API cap is checkable with `curl`: post 7 entries built from `inputs/clean-light.png`, and `jq '.report.source.refs|length'` is `6`.
- **Drag and drop.** Run `$V drive drop-images`. Expect `label reads "2 images selected"`, `dropped … shows as a thumbnail` for each file, `API answered 200 ok`, `reportKind is palette-mood`, and `Preview shows the 2 dropped image(s), in order`. With the zone's `onDrop` disabled, the scenario fails on the label and thumbnail checks.
- **Inferred structure.** Run `VERIFY_AI=1 $V up`, then `$V drive analyze-images`. Expect `inferred structure tab is shown`. This makes real paid model calls.

## Gotchas

- `analyze-images` uses the file picker path (`setInputFiles`). The drop zone has its own scenario: `$V drive drop-images` dispatches `dragover` and `drop` with a real `DataTransfer` on the zone's `Drag & drop image(s) here` text, which bubbles to the `onDrop` of the wrapping zone. A real OS drag is not simulated.
- The `Remove image N` button has opacity 0 until hovered. Hover the thumbnail first.
- After a result, a thumbnail's file name is also part of each preview picture's alt text (`Source image 1 of clean-light.png +1 more`). Match a thumbnail with `exact: true`, and find preview pictures by `Screenshot of` or `Source image N of`.
- With the AI lane off, the no-key image response is cached, because a missing key is a persistent condition. A structure failure while a key is set is not cached.
- The cache key is the image bytes plus `mode`, not the file name. Re-uploading the same bytes under another name within 10 minutes returns the earlier response, whose `report.source.ref` still names the first file. Use fresh bytes, or restart the instance, when a run depends on the name.
- When no image yields a colour (fully transparent or unreadable), the API returns `422` with an actionable message. See [Error handling](./error-handling.md). An unreadable image among readable ones is skipped, and the request returns `200`.
