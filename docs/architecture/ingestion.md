# Ingestion (`lib/ingest.ts`)

The single seam where a live URL becomes captured artifacts: `renderUrl` first runs the SSRF guard (`assertSafeUrl` — see [`security.md`](security.md)), then Playwright launches Chromium, navigates, dismisses cookie/consent banners, and captures screenshots + `styleDump` + `rawHarvestNode` off the _same_ rendered page/session. Cheap follow-up passes then reuse that session:

- **Full-page panorama** (`captureFullPageTiles`): scrolls the page in contiguous viewport-tall tiles (capped at `MAX_PANORAMA_VIEWPORTS = 12`) and stitches them into one seamless PNG via `sharp`. Returns the discrete tiles (`scrollShots`, full resolution, for the AI lane) and the stitched composite (`panoramaShot`, for the palette's area-weight pass + the frontend gallery). Pages that fit in one viewport yield neither — omit, don't fabricate.
- **Responsive harvests** (`RESPONSIVE_VIEWPORTS`, currently 390×844 mobile and 768×1024 tablet, narrowest-first): resize → DOM harvest + computed h1/h2 sizes only — no screenshot, no style dump. The primary viewport is restored afterwards.
- **Dark-scheme capture**: `page.emulateMedia({ colorScheme: "dark" })` → screenshot + style dump only. The dark style dump receives the capture's `CrossOriginSheetCache` and reuses the cross-origin CSS text that the light dump fetched, so no stylesheet is downloaded a second time. Whether it's actually a different scheme is decided downstream in `extractDarkPalette`, never here.

All passes are best-effort — a failure logs a warning and the field is simply absent, which every consumer already treats as "nothing observed". `lib/analyze.ts`'s `captureFromRender` turns the render into the `Capture` shape the rest of the pipeline consumes.
