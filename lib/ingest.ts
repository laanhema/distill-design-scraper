import { chromium, type Browser, type Page } from "playwright";
import sharp from "sharp";
import {
  collectStyleDump,
  type CrossOriginSheetCache,
  type StyleDump,
} from "@/lib/extract/styleDump";
import { harvestDomTree } from "@/lib/extract/structure/harvester";
import type { RawHarvestNode, ResponsiveHarvest } from "@/lib/extract/structureSchema";
import { assertSafeUrl } from "@/lib/security/ssrfGuard";

/**
 * The single seam through which a live page enters the pipeline: every
 * screenshot, the style dump and the DOM harvests come off one render.
 */

export interface CaptureArtifacts {
  /** Above-the-fold screenshot, PNG bytes as base64. */
  viewportShot: string;
  styleDump: StyleDump;
  rawHarvestNode?: RawHarvestNode;
  responsiveHarvests?: ResponsiveHarvest[];
  /** Whether this is actually a *different* scheme (vs. a single-scheme site)
   *  is decided in the extraction lane, not here. */
  darkCapture?: { viewportShot: string; styleDump: StyleDump };
  /** The gapless viewport-tall tiles below the first, top to bottom (the last
   *  may be a shorter crop), for the AI lane's full-page coverage. Omitted
   *  when the page fits in one viewport. */
  scrollShots?: string[];
  /** Full-page screenshot stitched from the viewport tiles, for the
   *  area-weight pixel pass and the frontend gallery. Deliberately not
   *  Playwright's `page.screenshot({ fullPage: true })`, which duplicates
   *  `position: fixed`/sticky elements at tile boundaries on tall pages; don't
   *  switch to it as a simplification. Omitted when the page fits in one
   *  viewport, or on capture failure. */
  panoramaShot?: string;
}

export interface RenderResult extends CaptureArtifacts {
  /** URL after any redirects. */
  finalUrl: string;
  title: string;
  viewport: { width: number; height: number };
  elapsedMs: number;
  bannerDismissed: boolean;
}

export interface RenderOptions {
  navTimeoutMs?: number;
  viewport?: { width: number; height: number };
}

const DEFAULT_VIEWPORT = { width: 1440, height: 900 };
const DEFAULT_NAV_TIMEOUT = 30_000;

// A realistic desktop UA reduces (never eliminates) headless blocking.
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

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
 * Returns true if something was clicked. One quick pass with short timeouts
 * that never throws: a page with no banner (or a stubborn one) must not fail
 * the whole render.
 */
async function dismissConsentBanner(page: Page): Promise<boolean> {
  for (const pattern of CONSENT_BUTTON_PATTERNS) {
    try {
      const button = page.getByRole("button", { name: pattern }).first();
      if (await button.isVisible({ timeout: 500 })) {
        await button.click({ timeout: 1500 });
        await page.waitForTimeout(400);
        return true;
      }
    } catch {}
  }
  return false;
}

const RESPONSIVE_VIEWPORTS: Array<{ width: number; height: number }> = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
];

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
 * Harvest only, never a screenshot or style dump: the responsive diff needs
 * measured layout, not pixels. Restores the primary viewport, which every
 * later capture step relies on.
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
 * `sheetCache` is the capture's one cross-origin stylesheet cache: this dump
 * re-parses the CSS text that the light dump already fetched.
 */
async function captureDarkScheme(
  page: Page,
  sheetCache: CrossOriginSheetCache,
): Promise<{ viewportShot: string; styleDump: StyleDump } | undefined> {
  try {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForTimeout(200);
    const viewportShotBuf = await page.screenshot({ fullPage: false });
    const styleDump = await collectStyleDump(page, sheetCache);
    return { viewportShot: viewportShotBuf.toString("base64"), styleDump };
  } catch (err) {
    console.warn("Dark-scheme capture failed:", err);
    return undefined;
  } finally {
    await page.emulateMedia({ colorScheme: "light" }).catch(() => {});
  }
}

/** Cap on the tile capture, in viewport heights: bounds capture time and
 *  stitched-image memory on infinite-scroll pages. */
const MAX_PANORAMA_VIEWPORTS = 12;

/**
 * Best-effort: a failure logs and returns the tiles captured so far, and the
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
 * Everything after navigation. Separate from `renderUrl` so the eval harness
 * can drive it against local fixture pages without the SSRF guard.
 */
export async function capturePage(
  page: Page,
): Promise<CaptureArtifacts & { bannerDismissed: boolean }> {
  const primaryViewport = page.viewportSize() ?? DEFAULT_VIEWPORT;
  const bannerDismissed = await dismissConsentBanner(page);

  // Nudge lazy/scroll-triggered content into loading.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  const viewportShotBuf = await page.screenshot({ fullPage: false });
  // One cache per capture, shared by the light and the dark style dump, so
  // each cross-origin stylesheet is downloaded once per analysis.
  const sheetCache: CrossOriginSheetCache = new Map();
  const styleDump = await collectStyleDump(page, sheetCache);
  let rawHarvestNode: RawHarvestNode | undefined;
  try {
    rawHarvestNode = await harvestDomTree(page);
  } catch (err) {
    console.warn("DOM Harvest for structure failed:", err);
  }

  const responsiveHarvests = await captureResponsiveHarvests(page, primaryViewport);
  const darkCapture = await captureDarkScheme(page, sheetCache);
  const { scrollShots, panoramaShot } = await captureFullPageTiles(
    page,
    primaryViewport,
    viewportShotBuf.toString("base64"),
  );

  return {
    viewportShot: viewportShotBuf.toString("base64"),
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
      // Explicit, not the OS/CI default: the dark-scheme pass needs a known
      // light baseline to be a second sample.
      colorScheme: "light",
    });
    const page = await context.newPage();

    // Redirect-target guard. Playwright does not await `on()` handlers, so a
    // fast redirect could finish navigating before `assertSafeUrl` resolves:
    // every validation is collected and `Promise.allSettled` before the render
    // counts as safe. Each hop's response arrives before `domcontentloaded`,
    // so that wait covers every validation the navigation triggers.
    //
    // `page.route()` cannot replace this: it fires only for the first URL of a
    // redirect chain (Playwright docs; microsoft/playwright#34994), since
    // Chromium follows server-side redirects itself. So the redirect target's
    // request is always sent before this check acts; `page.close()` only
    // aborts early and limits how long the page's JS runs.
    //
    // Chromium re-resolves DNS at connect time, so DNS rebinding remains a
    // residual gap; network egress filtering (README "Layer 2") is the real
    // boundary for it.
    let redirectSsrfError: Error | null = null;
    const pendingRedirectValidations: Promise<void>[] = [];
    page.on("response", (response) => {
      const status = response.status();
      if (status >= 300 && status < 400) {
        const location = response.headers()["location"];
        if (location) {
          const validation = (async () => {
            try {
              const targetUrl = new URL(location, response.url()).toString();
              await assertSafeUrl(targetUrl);
            } catch (err) {
              redirectSsrfError = err instanceof Error ? err : new Error(String(err));
              await page.close().catch(() => {});
            }
          })();
          pendingRedirectValidations.push(validation);
        }
      }
    });

    // `networkidle` is best-effort: chatty/analytics-heavy sites never idle.
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: navTimeout });
    } catch (err) {
      await Promise.allSettled(pendingRedirectValidations);
      if (redirectSsrfError) {
        throw redirectSsrfError;
      }
      throw err;
    }
    await Promise.allSettled(pendingRedirectValidations);
    if (redirectSsrfError) {
      throw redirectSsrfError;
    }
    try {
      await page.waitForLoadState("networkidle", { timeout: 8_000 });
    } catch {}

    const { bannerDismissed, ...artifacts } = await capturePage(page);

    const result: RenderResult = {
      finalUrl: page.url(),
      title: await page.title(),
      viewport,
      elapsedMs: Date.now() - startedAt,
      bannerDismissed,
      ...artifacts,
    };

    await context.close();
    return result;
  } finally {
    if (browser) await browser.close();
  }
}

