# Task: Full-page panorama capture for URL analysis

This is a self-contained implementation brief for the `distill-design-scraper` repo. It assumes no prior context beyond what's written here and in the repo's own `CLAUDE.md` (read that first — it documents the project's architecture and conventions, especially the "measured, never faked" invariant and the eval-harness workflow for touching anything under `lib/extract/**`).

## Goal

Replace the current "scroll shots" capture (`captureScrollShots` in `lib/ingest.ts`) with a full-page panorama capture: scroll all the way to the true bottom of the page in contiguous, non-overlapping viewport-tall tiles (as many as needed, not capped at a fixed shot count), then stitch every tile into one seamless composite PNG server-side.

## Why (current behavior is broken for tall pages)

`captureScrollShots` (lib/ingest.ts, current implementation below) takes up to 3 extra screenshots **evenly spaced** between the top and bottom of the page, hard-capped at `MAX_TOTAL_SHOTS = 4` total (including the primary top shot):

```ts
/** Total screenshots (including the primary top-of-page shot) captured while
 *  scrolling toward the bottom — matches `MAX_INTERPRET_IMAGES` in
 *  `lib/interpret.ts` so every shot captured is actually used by the AI lane. */
const MAX_TOTAL_SHOTS = 4;

async function captureScrollShots(
  page: Page,
  viewport: { width: number; height: number },
): Promise<string[]> {
  const shots: string[] = [];
  try {
    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
    const maxScroll = Math.max(0, scrollHeight - viewport.height);
    if (maxScroll <= 0) return shots;

    const numPages = Math.ceil(scrollHeight / viewport.height);
    const totalShots = Math.min(MAX_TOTAL_SHOTS, Math.max(2, numPages));
    for (let i = 1; i < totalShots; i++) {
      const y = Math.round((maxScroll * i) / (totalShots - 1));
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
      await page.waitForTimeout(200);
      shots.push((await page.screenshot({ fullPage: false })).toString("base64"));
    }
  } catch (err) {
    console.warn("Scroll-shot capture failed:", err);
  } finally {
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
    await page.waitForTimeout(150);
  }
  return shots;
}
```

For any page taller than ~4 viewports, this leaves **gaps** of unphotographed content between shots — it does not cover the whole page, and consecutive shots don't align into anything continuous.

## Design decisions (already made — do not re-litigate)

1. **Stitch one composite panorama image server-side (via `sharp`, already a project dependency used in `lib/extract/palette.ts`), but keep the AI vision lane on separate full-resolution tiles**, not the giant stitched image. Reason: Claude's vision API downscales images to fit within roughly 1568px on the long edge — a single extremely tall/thin stitched image would get destructively downscaled, losing detail for anything below the fold. The stitched panorama is used for (a) the pixel area-weighting pass and (b) the frontend gallery display; the AI lane keeps receiving discrete, full-resolution tiles.
2. **Safety cap: ~12 viewport-heights total.** Stop capturing once the page exceeds roughly 12× the viewport height (~10,800px at the default 1440×900 viewport). This bounds worst-case capture time and stitched-image memory against pathological infinite-scroll pages, while comfortably covering virtually all real marketing/landing/product pages. Log a warning (matching this file's existing `console.warn` idiom) when truncated.
3. **AI lane coverage fix:** today's `scrollShots` is a small (≤3) evenly-spread sample giving the AI lane rough top/middle/bottom coverage. After this change, `scrollShots` becomes the *complete* gapless tile set (potentially 10+ tiles for a tall page). But `lib/interpret.ts`'s `MAX_INTERPRET_IMAGES = 4` unconditionally slices the *first* 4 — so without a fix, the AI lane would regress to only ever seeing the top of the page. Fix: at the `analyzeUrl` call site, evenly subsample up to 3 tiles across the *full* tile set (always including something near the top and near the bottom) before handing them to the AI lane, preserving full-page coverage using full-resolution (non-stitched) crops.
4. **Surfacing in the API/frontend: fold the panorama into the existing `meta.viewportShots` array** (`[viewportShot, panoramaShot]`), reusing the gallery grid that already exists in `app/page.tsx` — **no new frontend code**. Accepted tradeoff: the panorama (tall, narrow aspect ratio) will render in one cell of a 2-column grid alongside the normal viewport shot, rather than getting bespoke full-width treatment. This was chosen deliberately over adding a dedicated field + new frontend branch, to keep the diff small.
5. **Do not reuse Playwright's native `fullPage: true` screenshot** (`fullPageShot`, already captured today at `lib/ingest.ts` inside `capturePage`, but its result is silently dropped and never threaded into `Capture` — dead code downstream today). This is deliberate, not an oversight to "fix": Playwright's native full-page screenshot internally scrolls-and-stitches too for tall pages, which is a known Chromium behavior that can duplicate `position: fixed`/sticky elements (headers, nav bars) at each internal tile boundary. Manual tiling (this plan) gives control over exactly that problem. Leave `fullPageShot` exactly as it is today — captured, unused — and add a one-line comment at its capture site noting it's intentionally not the panorama source, so a future reader doesn't "simplify" by swapping it in.

## Relevant current code (read before editing)

### `lib/ingest.ts` — full file is short; key pieces:

```ts
export interface RenderResult {
  finalUrl: string;
  title: string;
  /** Above-the-fold screenshot, PNG bytes as base64. */
  viewportShot: string;
  /** Full scrollable page screenshot, PNG bytes as base64. */
  fullPageShot: string;
  viewport: { width: number; height: number };
  elapsedMs: number;
  bannerDismissed: boolean;
  styleDump: StyleDump;
  rawHarvestNode?: RawHarvestNode;
  responsiveHarvests?: ResponsiveHarvest[];
  darkCapture?: { viewportShot: string; styleDump: StyleDump };
  /** Additional screenshots scrolled toward the bottom of the page, same
   *  session, top-to-bottom order — omitted when the page fits in one
   *  viewport (nothing more to see). */
  scrollShots?: string[];
}

const DEFAULT_VIEWPORT = { width: 1440, height: 900 };

// ... captureDarkScheme() is the sibling best-effort-pass idiom to match:
async function captureDarkScheme(
  page: Page,
): Promise<{ viewportShot: string; styleDump: StyleDump } | undefined> {
  try {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForTimeout(200);
    const viewportShotBuf = await page.screenshot({ fullPage: false });
    const styleDump = await collectStyleDump(page);
    return { viewportShot: viewportShotBuf.toString("base64"), styleDump };
  } catch (err) {
    console.warn("Dark-scheme capture failed:", err);
    return undefined;
  } finally {
    await page.emulateMedia({ colorScheme: "light" }).catch(() => {});
  }
}

// captureScrollShots() — see "Why" section above for full current code.

export async function capturePage(page: Page): Promise<{
  viewportShot: string;
  fullPageShot: string;
  bannerDismissed: boolean;
  styleDump: StyleDump;
  rawHarvestNode?: RawHarvestNode;
  responsiveHarvests?: ResponsiveHarvest[];
  darkCapture?: { viewportShot: string; styleDump: StyleDump };
  scrollShots?: string[];
}> {
  const primaryViewport = page.viewportSize() ?? DEFAULT_VIEWPORT;
  const bannerDismissed = await dismissConsentBanner(page);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  const viewportShotBuf = await page.screenshot({ fullPage: false });
  const fullPageShotBuf = await page.screenshot({ fullPage: true });
  const styleDump = await collectStyleDump(page);
  let rawHarvestNode: RawHarvestNode | undefined;
  try {
    rawHarvestNode = await harvestDomTree(page);
  } catch (err) {
    console.warn("DOM Harvest for structure failed:", err);
  }

  const responsiveHarvests = await captureResponsiveHarvests(page, primaryViewport);
  const darkCapture = await captureDarkScheme(page);
  const scrollShots = await captureScrollShots(page, primaryViewport);

  return {
    viewportShot: viewportShotBuf.toString("base64"),
    fullPageShot: fullPageShotBuf.toString("base64"),
    bannerDismissed,
    styleDump,
    rawHarvestNode,
    ...(responsiveHarvests.length > 0 ? { responsiveHarvests } : {}),
    ...(darkCapture ? { darkCapture } : {}),
    ...(scrollShots.length > 0 ? { scrollShots } : {}),
  };
}

export async function renderUrl(
  rawUrl: string,
  options: RenderOptions = {},
): Promise<RenderResult> {
  // ... navigation setup ...
  const captured = await capturePage(page);
  const result: RenderResult = {
    finalUrl: page.url(),
    title: await page.title(),
    viewportShot: captured.viewportShot,
    fullPageShot: captured.fullPageShot,
    viewport,
    elapsedMs: Date.now() - startedAt,
    bannerDismissed: captured.bannerDismissed,
    styleDump: captured.styleDump,
    rawHarvestNode: captured.rawHarvestNode,
    responsiveHarvests: captured.responsiveHarvests,
    darkCapture: captured.darkCapture,
    scrollShots: captured.scrollShots,
  };
  // ...
}
```

No `sharp` import currently exists in `lib/ingest.ts`.

### `lib/analyze.ts` — relevant pieces:

```ts
export interface Capture {
  source: { type: "url"; ref: string; capturedAt: string };
  finalUrl: string;
  title: string;
  styleDump: StyleDump;
  /** Base64 PNG of the viewport screenshot (area-weight pixel pass). */
  viewportShot: string;
  rawHarvestNode?: RawHarvestNode;
  responsiveHarvests?: ResponsiveHarvest[];
  darkCapture?: { viewportShot: string; styleDump: StyleDump };
  /** Additional screenshots scrolled toward the bottom of the page, same
   *  session (§ scroll capture) — merged into the area-weight pixel pass and
   *  sent to the AI lane alongside `viewportShot`. */
  scrollShots?: string[];
}

export async function extractFromCapture(
  capture: Capture,
): Promise<AnalyzeResult> {
  const palette = await extractPalette({
    dump: capture.styleDump,
    screenshotPngBase64: capture.viewportShot,
    additionalScreenshotsPngBase64: capture.scrollShots,
  });
  // ...
}

export function captureFromRender(
  render: RenderResult,
  ref: string,
  capturedAt: string,
): Capture {
  return {
    source: { type: "url", ref, capturedAt },
    finalUrl: render.finalUrl,
    title: render.title,
    styleDump: render.styleDump,
    viewportShot: render.viewportShot,
    rawHarvestNode: render.rawHarvestNode,
    responsiveHarvests: render.responsiveHarvests,
    darkCapture: render.darkCapture,
    scrollShots: render.scrollShots,
  };
}

export async function analyzeUrl(url: string): Promise<AnalyzeResult & {
  capture: Capture;
  refinements: RefinementChange[];
  meta: { finalUrl: string; title: string; elapsedMs: number; bannerDismissed: boolean; aiApplied: boolean };
}> {
  const capturedAt = new Date().toISOString();
  const render = await renderUrl(url);
  const capture = captureFromRender(render, url, capturedAt);
  const measured = await extractFromCapture(capture);
  const enriched = await enrichWithAI(measured, [capture.viewportShot, ...(capture.scrollShots ?? [])]);
  return {
    report: enriched.report,
    markdown: enriched.markdown,
    refinements: enriched.refinements,
    capture,
    meta: {
      finalUrl: render.finalUrl,
      title: render.title,
      elapsedMs: render.elapsedMs,
      bannerDismissed: render.bannerDismissed,
      aiApplied: Boolean(enriched.report.identity),
    },
  };
}
```

### `lib/extract/palette.ts` — relevant piece (confirms no change needed here):

```ts
export async function extractPalette({
  dump,
  screenshotPngBase64,
  additionalScreenshotsPngBase64,
}: PaletteInput): Promise<Palette> {
  const canon = collectCanonical(dump);
  await assignAreaWeights(canon, [screenshotPngBase64, ...(additionalScreenshotsPngBase64 ?? [])]);
  // ...
}
```

`assignAreaWeights` resizes each input image independently via `sharp(buf).resize({ width: PIXEL_SAMPLE_WIDTH /* 640 */, withoutEnlargement: true })` (height auto-scales, aspect preserved), and pools matched pixels into a shared running total across every image in the array — it is completely agnostic to image count or size. **No changes needed in this file.**

### `lib/interpret.ts` — relevant piece:

```ts
/** Vision calls stay cheap and grounded — more images add cost without adding read. */
const MAX_INTERPRET_IMAGES = 4;

export interface InterpretInput {
  /** Base64 PNG(s) — viewport screenshot(s) for URLs, uploaded image(s) for image mode.
   *  Capped to `MAX_INTERPRET_IMAGES`; extras are ignored (§P6-1). */
  screenshotsPngBase64: string[];
  palette: Palette;
  typography?: Typography;
}
```
`interpret()` does `input.screenshotsPngBase64.slice(0, MAX_INTERPRET_IMAGES)` then sends each image as an independent Anthropic vision content block, unresized. **No changes needed in this file** — it just needs to keep receiving ≤4 well-chosen images.

### `eval/capture.ts` — relevant piece:

```ts
async function captureEntry(entry: CorpusEntry): Promise<Capture> {
  // ...
  const captured = await capturePage(page);
  const capture: Capture = {
    source: { type: "url", ref: entry.url ?? entry.fixture!, capturedAt: new Date().toISOString() },
    finalUrl: page.url(),
    title: await page.title(),
    styleDump: captured.styleDump,
    viewportShot: captured.viewportShot,
    responsiveHarvests: captured.responsiveHarvests,
    darkCapture: captured.darkCapture,
    scrollShots: captured.scrollShots,
  };
  await context.close();
  return capture;
}
```

### `app/api/analyze/route.ts` — relevant piece (URL-mode branch):

```ts
const responsePayload = {
  ok: true,
  report,
  markdown,
  structureReport,
  refinements,
  meta: {
    ...meta,
    capturedAt: capture.source.capturedAt,
    viewportShot: `data:image/png;base64,${capture.viewportShot}`,
    viewportShots: [capture.viewportShot, ...(capture.scrollShots ?? [])].map(
      (shot) => `data:image/png;base64,${shot}`,
    ),
  },
};
```
(There's a separate image-mode branch earlier in the same file that builds `viewportShots` from raw uploaded images — unrelated to this feature, must stay untouched.)

### `app/page.tsx` — relevant piece (confirms no change needed here):

```ts
interface Meta {
  finalUrl: string;
  title: string;
  elapsedMs: number;
  bannerDismissed: boolean;
  capturedAt: string;
  viewportShot: string;
  viewportShots?: string[];
  aiApplied: boolean;
}
```
```tsx
{meta.viewportShots && meta.viewportShots.length > 1 ? (
  <div className="grid gap-3 sm:grid-cols-2">
    {meta.viewportShots.map((src, i) => (
      <img key={i} src={src} alt={`Source image ${i + 1} of ${meta.finalUrl}`}
        className="w-full rounded-lg border border-neutral-200 shadow-sm dark:border-neutral-800" />
    ))}
  </div>
) : (
  <img src={meta.viewportShot} alt={`Screenshot of ${meta.finalUrl}`}
    className="w-full rounded-lg border border-neutral-200 shadow-sm dark:border-neutral-800" />
)}
```
This already handles an array of any length generically — with the `route.ts` change below, `viewportShots` becomes either `[viewportShot]` (falls through to the single-image branch, unchanged) or `[viewportShot, panoramaShot]` (renders in the existing grid). **No frontend code change required.**

## Implementation steps

### 1. `lib/ingest.ts`

- Add `import sharp from "sharp";`.
- Replace `const MAX_TOTAL_SHOTS = 4;` with `const MAX_PANORAMA_VIEWPORTS = 12;` (a height-multiple safety cap, not a shot-count cap).
- Replace `captureScrollShots` with:

```ts
/** Safety cap on how far down we tile-capture, expressed as a multiple of
 *  viewport height — guards against pathological infinite-scroll pages
 *  blowing up capture time / stitched-image memory. ~12 viewports covers
 *  virtually all marketing/landing/product pages. */
const MAX_PANORAMA_VIEWPORTS = 12;

/**
 * Full-page panorama pass, same session: walks the page in contiguous,
 * non-overlapping viewport-tall tiles from just past the top down to the true
 * bottom (capped at MAX_PANORAMA_VIEWPORTS), then stitches every tile
 * (including the already-captured top-of-page shot) into one seamless PNG via
 * sharp. Returns the discrete tiles (`scrollShots`, kept at full resolution
 * for the AI lane) and the stitched composite (`panoramaShot`, used for pixel
 * area-weighting + the frontend gallery). Short pages that fit in one
 * viewport yield neither — nothing more to see, nothing to stitch, matching
 * the "omit, don't fabricate" convention used elsewhere in this file.
 * Best-effort: a failure logs and returns whatever was captured so far;
 * scroll position is always restored.
 */
async function captureFullPageTiles(
  page: Page,
  viewport: { width: number; height: number },
  topShotBase64: string,
): Promise<{ scrollShots: string[]; panoramaShot?: string }> {
  const scrollShots: string[] = [];
  try {
    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
    const cappedHeight = Math.min(scrollHeight, viewport.height * MAX_PANORAMA_VIEWPORTS);
    if (scrollHeight > cappedHeight) {
      console.warn(
        `Page height ${scrollHeight}px exceeds panorama cap ${cappedHeight}px — truncating.`,
      );
    }
    const maxScroll = cappedHeight - viewport.height;
    if (maxScroll <= 0) return { scrollShots };

    const tileBuffers: Buffer[] = [Buffer.from(topShotBase64, "base64")];
    const fullTiles = Math.floor(cappedHeight / viewport.height);
    for (let i = 1; i < fullTiles; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), i * viewport.height);
      await page.waitForTimeout(200);
      const buf = await page.screenshot({ fullPage: false });
      tileBuffers.push(buf);
      scrollShots.push(buf.toString("base64"));
    }

    const remainder = cappedHeight - fullTiles * viewport.height;
    if (remainder > 0) {
      await page.evaluate((y) => window.scrollTo(0, y), maxScroll);
      await page.waitForTimeout(200);
      const bottomBuf = await page.screenshot({ fullPage: false });
      const croppedBuf = await sharp(bottomBuf)
        .extract({
          left: 0,
          top: viewport.height - remainder,
          width: viewport.width,
          height: remainder,
        })
        .png()
        .toBuffer();
      tileBuffers.push(croppedBuf);
      scrollShots.push(croppedBuf.toString("base64"));
    }

    // tileBuffers is strictly top-to-bottom: tile at array index i starts at
    // i * viewport.height px from the top for every tile, including the
    // (possibly shorter) cropped final tile — no special-casing needed here.
    const panoramaBuf = await sharp({
      create: {
        width: viewport.width,
        height: cappedHeight,
        channels: 3,
        // Browser screenshots have no real transparency (alpha always 255) —
        // flattening the composite canvas to RGB is a pure size win.
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite(tileBuffers.map((input, i) => ({ input, top: i * viewport.height, left: 0 })))
      .png()
      .toBuffer();

    return { scrollShots, panoramaShot: panoramaBuf.toString("base64") };
  } catch (err) {
    console.warn("Full-page panorama capture failed:", err);
    return { scrollShots };
  } finally {
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
    await page.waitForTimeout(150);
  }
}
```

- In `capturePage()`: update the return-type annotation to add `panoramaShot?: string`; replace the `captureScrollShots(page, primaryViewport)` call with:
  ```ts
  const { scrollShots, panoramaShot } = await captureFullPageTiles(
    page,
    primaryViewport,
    viewportShotBuf.toString("base64"),
  );
  ```
  and spread both into the returned object: `...(scrollShots.length > 0 ? { scrollShots } : {})` and `...(panoramaShot ? { panoramaShot } : {})`.
- Add a one-line comment at `const fullPageShotBuf = await page.screenshot({ fullPage: true });` noting it's intentionally not the panorama source (see "Design decisions" #5 above).
- `RenderResult`: add, right after `scrollShots?: string[]`:
  ```ts
  /** Single seamless full-page screenshot stitched from gapless viewport
   *  tiles captured toward the bottom, same session — feeds the area-weight
   *  pixel pass and the frontend gallery. Not Playwright's native `fullPage`
   *  screenshot (see `fullPageShot`): that internally scroll-and-stitches
   *  too, which is known to duplicate `position: fixed`/sticky elements at
   *  tile boundaries on tall pages — this manual tile-and-composite path
   *  avoids that. Omitted when the page fits in one viewport, or on capture
   *  failure. */
  panoramaShot?: string;
  ```
  and update `scrollShots`'s doc comment: it's now the complete gapless tile set (top-to-bottom, contiguous), not an evenly-spaced sample with gaps.
- `renderUrl()`: thread `captured.panoramaShot` into the returned `RenderResult`, same as the sibling optional fields.

### 2. `lib/analyze.ts`

- `Capture` interface: add `panoramaShot?: string` (mirroring doc comment), and update `scrollShots`'s doc comment — it no longer feeds the area-weight pixel pass, only the AI lane, now as the complete tile set.
- `captureFromRender`: add `panoramaShot: render.panoramaShot`.
- `extractFromCapture`: change
  ```ts
  additionalScreenshotsPngBase64: capture.scrollShots,
  ```
  to
  ```ts
  additionalScreenshotsPngBase64: capture.panoramaShot ? [capture.panoramaShot] : undefined,
  ```
- `analyzeUrl`: add a local helper and use it so the AI lane gets top/middle/bottom coverage instead of an unconditional first-4 slice:
  ```ts
  /** Picks up to `maxCount` items evenly spread across `items` (always
   *  including the first and last), so a long top-to-bottom tile sequence
   *  still gives the AI lane full-page coverage instead of just whatever the
   *  first few happen to be. */
  function subsampleEvenly<T>(items: T[], maxCount: number): T[] {
    if (items.length <= maxCount) return items;
    const result: T[] = [];
    for (let i = 0; i < maxCount; i++) {
      result.push(items[Math.round((i * (items.length - 1)) / (maxCount - 1))]);
    }
    return result;
  }
  ```
  and change
  ```ts
  const enriched = await enrichWithAI(measured, [capture.viewportShot, ...(capture.scrollShots ?? [])]);
  ```
  to
  ```ts
  const enriched = await enrichWithAI(measured, [
    capture.viewportShot,
    ...subsampleEvenly(capture.scrollShots ?? [], 3),
  ]);
  ```
  This caps the AI lane at exactly 4 images (`viewportShot` + 3 subsampled tiles), matching `MAX_INTERPRET_IMAGES` in `lib/interpret.ts` exactly — that file's existing `.slice(0, MAX_INTERPRET_IMAGES)` becomes a no-op safety net rather than the actual truncation point.

### 3. `lib/extract/palette.ts` — no changes

Confirmed already count/size-agnostic; only the caller in `lib/analyze.ts` changes.

### 4. `eval/capture.ts`

Add `panoramaShot: captured.panoramaShot,` to the `Capture` object literal in `captureEntry`, next to the existing `scrollShots: captured.scrollShots,` line.

**Do not** run `npm run eval:capture` against the committed corpus as part of this change (per this repo's CLAUDE.md policy on additive optional fields). Both committed fixtures (`eval/corpus/clean-light`, `eval/corpus/dark-mode`) are single-viewport-tall, so `scrollShots`/`panoramaShot` are empty/absent for them either way — `npm run eval` must pass byte-for-byte unchanged after this change.

### 5. `app/api/analyze/route.ts`

In the URL-mode branch, change:
```ts
viewportShots: [capture.viewportShot, ...(capture.scrollShots ?? [])].map(
  (shot) => `data:image/png;base64,${shot}`,
),
```
to:
```ts
viewportShots: [capture.viewportShot, ...(capture.panoramaShot ? [capture.panoramaShot] : [])].map(
  (shot) => `data:image/png;base64,${shot}`,
),
```
Leave the image-mode branch (unrelated multi-upload feature, earlier in the same file) untouched.

### 6. `app/page.tsx` — no changes needed

Confirmed above: the existing render logic already handles this generically.

## Verification

1. Per this repo's `CLAUDE.md` ("Manually verifying extraction changes" section): write a scratch script (delete after use) that spins up `http.createServer` serving a synthetic multi-section HTML page, and run it via `npx tsx` **from the project root** (required for module resolution), calling `capturePage`/`captureFullPageTiles` (or `renderUrl` end-to-end) against it. Test two cases:
   - A page taller than 12 viewports — confirm the truncation warning fires and `panoramaShot`'s height equals the capped height (`viewport.height * 12`), not the real (larger) `scrollHeight`.
   - A page whose height is *not* an exact multiple of the viewport height — confirm the remainder-crop math produces a panorama of exactly `scrollHeight` px with no gap or duplicated band at the final tile boundary. Render distinct solid-color bands per synthetic section in the test HTML and assert continuity by reading pixel rows at each expected boundary y-coordinate via `sharp(panoramaBuf).extract(...)`.
2. `npm run typecheck` — must pass.
3. `npm run eval` — must pass unchanged (both committed corpus fixtures are single-viewport-tall, so this change is a no-op against them; do not touch `eval/baseline.json`).
4. Do not run `npm run eval:capture` against the committed corpus. Optionally run the updated `eval/capture.ts` against a local (uncommitted) tall test page to eyeball a real capture → stitch → `capture.json` round trip.
5. `npm run dev` and manually test against a known-tall real site end-to-end via the browser: confirm capture completes in reasonable time, the panorama appears in the gallery (`app/page.tsx`), and the AI-enriched report/identity output still looks sane (i.e. the subsampled tiles reaching the AI lane give it real top/middle/bottom coverage, not just the top of the page).