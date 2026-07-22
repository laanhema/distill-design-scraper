import { chromium, type Browser, type Page } from "playwright";
import { collectStyleDump, type StyleDump } from "@/lib/extract/styleDump";
import { harvestDomTree } from "@/lib/extract/structure/harvester";
import type { RawHarvestNode, ResponsiveHarvest } from "@/lib/extract/structureSchema";

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

function isValidHttpUrl(candidate: string): boolean {
  try {
    const u = new URL(candidate);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

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

/** Secondary viewports for the responsive diff (§P5-2) — mobile only for now;
 *  the plan allows an optional tablet pass, added here if a second real delta
 *  case turns up. */
const RESPONSIVE_VIEWPORTS: Array<{ width: number; height: number }> = [
  { width: 390, height: 844 },
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

  return {
    viewportShot: viewportShotBuf.toString("base64"),
    fullPageShot: fullPageShotBuf.toString("base64"),
    bannerDismissed,
    styleDump,
    rawHarvestNode,
    ...(responsiveHarvests.length > 0 ? { responsiveHarvests } : {}),
    ...(darkCapture ? { darkCapture } : {}),
  };
}

export async function renderUrl(
  rawUrl: string,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const url = rawUrl.trim();
  if (!isValidHttpUrl(url)) {
    throw new Error(
      `Invalid URL: must be an http(s) address, got "${rawUrl}".`,
    );
  }

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

    // `domcontentloaded` is the reliable gate; `networkidle` is best-effort on
    // top of it because chatty/analytics-heavy sites may never fully idle.
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: navTimeout });
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
    };

    await context.close();
    return result;
  } finally {
    // Always release the browser, even on nav timeout / crash.
    if (browser) await browser.close();
  }
}

