import { chromium, type Browser, type Page } from "playwright";
import sharp from "sharp";
import { collectStyleDump, type StyleDump } from "@/lib/extract/styleDump";
import { harvestDomTree } from "@/lib/extract/structure/harvester";
import type { RawHarvestNode, ResponsiveHarvest } from "@/lib/extract/structureSchema";
import { assertSafeUrl } from "@/lib/security/ssrfGuard";

/**
 * Phase 0 ingestion: render a URL in headless Chromium and capture screenshots.
 *
 * This module is intentionally the single seam through which a live page enters
 * the pipeline. Later phases (§5 extraction) will read `getComputedStyle` off
 * the same rendered `Page` before it is torn down — so the shape here is built
 * to grow: navigate → settle → dismiss banners → capture, then hand back both
 * pixels (screenshots) and, eventually, a DOM style dump from one render.
 */

export interface RenderResult {
  /** URL after any redirects. */
  finalUrl: string;
  /** Document title of the rendered page. */
  title: string;
  /** Above-the-fold screenshot, PNG bytes as base64. */
  viewportShot: string;
  /** Full scrollable page screenshot, PNG bytes as base64. */
  fullPageShot: string;
  /** Viewport used for the capture. */
  viewport: { width: number; height: number };
  /** How long the render took, ms. */
  elapsedMs: number;
  /** Whether a consent/cookie banner was clicked away. */
  bannerDismissed: boolean;
  /** Per-node computed-style dump read off the same render (§5 extraction). */
  styleDump: StyleDump;
  /** DOM harvest tree for layout-structure extraction (Track B). */
  rawHarvestNode?: RawHarvestNode;
  /** Secondary-viewport DOM harvests off the same session (§P5-2). */
  responsiveHarvests?: ResponsiveHarvest[];
  /** Dark-color-scheme render off the same session (§P8-3) — whether it's
   *  actually a *different* scheme (vs. a single-scheme site) is decided in
   *  the extraction lane, not here. */
  darkCapture?: { viewportShot: string; styleDump: StyleDump };
  /** Additional screenshots scrolled toward the bottom of the page, same
   *  session, top-to-bottom order — the complete gapless viewport-tall tile
   *  set (one per viewport-height step, plus a possibly shorter final crop)
   *  used by the AI lane for full-page coverage. Omitted when the page fits
   *  in one viewport (nothing more to see). */
  scrollShots?: string[];
  /** Single seamless full-page screenshot stitched from gapless viewport
   *  tiles captured toward the bottom, same session — feeds the area-weight
   *  pixel pass and the frontend gallery. Not Playwright's native `fullPage`
   *  screenshot (see `fullPageShot`): that internally scroll-and-stitches
   *  too, which is known to duplicate `position: fixed`/sticky elements at
   *  tile boundaries on tall pages — this manual tile-and-composite path
   *  avoids that. Omitted when the page fits in one viewport, or on capture
   *  failure. */
  panoramaShot?: string;
}

export interface RenderOptions {
  /** Hard ceiling on navigation, ms. Default 30s. */
  navTimeoutMs?: number;
  viewport?: { width: number; height: number };
}

const DEFAULT_VIEWPORT = { width: 1440, height: 900 };
const DEFAULT_NAV_TIMEOUT = 30_000;

// A realistic desktop UA reduces (never eliminates) headless blocking. §12 risk.
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Common "accept cookies" affordances, matched case-insensitively by text. */
const CONSENT_BUTTON_PATTERNS = [
  /^accept all$/i,
  /^accept cookies$/i,
  /^accept$/i,
  /^i accept$/i,
  /^agree$/i,
  /^i agree$/i,
  /^got it$/i,
  /^allow all$/i,
  /^ok$/i,
];

/**
 * Best-effort consent-banner dismissal. Returns true if something was clicked.
 * Deliberately conservative: one quick pass, short timeouts, never throws —
 * a page that has no banner (or a stubborn one) must not fail the whole render.
 */
async function dismissConsentBanner(page: Page): Promise<boolean> {
  for (const pattern of CONSENT_BUTTON_PATTERNS) {
    try {
      const button = page.getByRole("button", { name: pattern }).first();
      if (await button.isVisible({ timeout: 500 })) {
        await button.click({ timeout: 1500 });
        // Let any dismissal animation settle before we screenshot.
        await page.waitForTimeout(400);
        return true;
      }
    } catch {
      // Not present / not clickable — try the next pattern.
    }
  }
  return false;
}

/** Secondary viewports for the responsive diff (§P5-2) — mobile (390×844) and
 *  tablet (768×1024), captured narrowest-first. */
const RESPONSIVE_VIEWPORTS: Array<{ width: number; height: number }> = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
];

/** Computed h1/h2 font sizes at the current viewport (§P5-2 item 4). */
async function measureHeadingSizesPx(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const sizes: Record<string, number> = {};
    for (const tag of ["h1", "h2"]) {
      const el = document.querySelector(tag);
      if (!el) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (Number.isFinite(px)) sizes[tag] = px;
    }
    return sizes;
  });
}

/**
 * Cheap second (and third) pass in the same session: resize, let media
 * queries settle, harvest — never a screenshot or style dump, since the
 * responsive diff only needs measured layout, not repainted pixels. Restores
 * the original viewport before returning so every later capture step still
 * sees the primary render. Best-effort per viewport: one failing resize
 * shouldn't drop the others.
 */
async function captureResponsiveHarvests(
  page: Page,
  primaryViewport: { width: number; height: number },
): Promise<ResponsiveHarvest[]> {
  const results: ResponsiveHarvest[] = [];
  for (const viewport of RESPONSIVE_VIEWPORTS) {
    try {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(200);
      const rawHarvestNode = await harvestDomTree(page);
      const typeSizesPx = await measureHeadingSizesPx(page);
      results.push({ viewport, rawHarvestNode, typeSizesPx });
    } catch (err) {
      console.warn(`Responsive harvest at ${viewport.width}×${viewport.height} failed:`, err);
    }
  }
  await page.setViewportSize(primaryViewport);
  await page.waitForTimeout(150);
  return results;
}

/**
 * Dark-color-scheme pass off the same session (§P8-3) — same cheap pattern as
 * the responsive harvest, but a screenshot + style dump instead of a DOM
 * harvest, since the palette lane needs pixels and computed colors, not
 * layout. Whether the result is actually a *different* scheme (vs. a
 * single-scheme site that ignores `prefers-color-scheme`) is a call for the
 * extraction lane, not this capture step.
 */
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

/**
 * Everything after navigation: dismiss banners, nudge lazy content, capture
 * both screenshots, and read the computed-style dump off the *same* settled
 * render (§9). Factored out so the eval harness can drive it against local
 * fixture pages without going through the http(s)-only `renderUrl` front door.
 */
export async function capturePage(page: Page): Promise<{
  viewportShot: string;
  fullPageShot: string;
  bannerDismissed: boolean;
  styleDump: StyleDump;
  rawHarvestNode?: RawHarvestNode;
  responsiveHarvests?: ResponsiveHarvest[];
  darkCapture?: { viewportShot: string; styleDump: StyleDump };
  scrollShots?: string[];
  panoramaShot?: string;
}> {
  const primaryViewport = page.viewportSize() ?? DEFAULT_VIEWPORT;
  const bannerDismissed = await dismissConsentBanner(page);

  // Nudge lazy/scroll-triggered content, then return to the top for the
  // above-the-fold shot.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  const viewportShotBuf = await page.screenshot({ fullPage: false });
  // Captured but intentionally NOT threaded into Capture — Playwright's native
  // `fullPage` screenshot internally scroll-and-stitches too, which is known to
  // duplicate `position: fixed`/sticky elements at tile boundaries on tall
  // pages. The manual tile-and-composite path in `captureFullPageTiles` is the
  // panorama source; this stays as a dead-code fallback so a future reader
  // doesn't "simplify" by swapping it in.
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
  const { scrollShots, panoramaShot } = await captureFullPageTiles(
    page,
    primaryViewport,
    viewportShotBuf.toString("base64"),
  );

  return {
    viewportShot: viewportShotBuf.toString("base64"),
    fullPageShot: fullPageShotBuf.toString("base64"),
    bannerDismissed,
    styleDump,
    rawHarvestNode,
    ...(responsiveHarvests.length > 0 ? { responsiveHarvests } : {}),
    ...(darkCapture ? { darkCapture } : {}),
    ...(scrollShots.length > 0 ? { scrollShots } : {}),
    ...(panoramaShot ? { panoramaShot } : {}),
  };
}

export async function renderUrl(
  rawUrl: string,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const url = rawUrl.trim();
  await assertSafeUrl(url);

  const viewport = options.viewport ?? DEFAULT_VIEWPORT;
  const navTimeout = options.navTimeoutMs ?? DEFAULT_NAV_TIMEOUT;
  const startedAt = Date.now();

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport,
      userAgent: USER_AGENT,
      deviceScaleFactor: 1,
      // Explicit, not left to the OS/CI default (§P8-3) — the dark-scheme
      // pass needs a known "light" baseline to actually be a second sample.
      colorScheme: "light",
    });
    const page = await context.newPage();

    let redirectSsrfError: Error | null = null;
    page.on("response", async (response) => {
      const status = response.status();
      if (status >= 300 && status < 400) {
        const location = response.headers()["location"];
        if (location) {
          try {
            const targetUrl = new URL(location, response.url()).toString();
            await assertSafeUrl(targetUrl);
          } catch (err) {
            redirectSsrfError = err instanceof Error ? err : new Error(String(err));
            await page.close().catch(() => {});
          }
        }
      }
    });

    // `domcontentloaded` is the reliable gate; `networkidle` is best-effort on
    // top of it because chatty/analytics-heavy sites may never fully idle.
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: navTimeout });
    } catch (err) {
      if (redirectSsrfError) {
        throw redirectSsrfError;
      }
      throw err;
    }
    if (redirectSsrfError) {
      throw redirectSsrfError;
    }
    try {
      await page.waitForLoadState("networkidle", { timeout: 8_000 });
    } catch {
      // Never idled — proceed with whatever has painted so far.
    }

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
      panoramaShot: captured.panoramaShot,
    };

    await context.close();
    return result;
  } finally {
    // Always release the browser, even on nav timeout / crash.
    if (browser) await browser.close();
  }
}

