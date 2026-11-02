import { chromium, type Browser, type Page, type Response } from "playwright";
import sharp from "sharp";
import {
  collectStyleDump,
  type CrossOriginSheetCache,
  type StyleDump,
} from "@/lib/extract/styleDump";
import { harvestDomTree } from "@/lib/extract/structure/harvester";
import type { RawHarvestNode, ResponsiveHarvest } from "@/lib/extract/structureSchema";
import { assertSafeUrl } from "@/lib/security/ssrfGuard";
import type { CaptureAccess, Mitigation, Obstruction } from "@/lib/schema";
import { preparePageForMitigation, collectMitigations } from "@/lib/mitigation";

/**
 * Thrown when navigation is blocked by access restrictions, HTTP error codes
 * (401, 403, 5xx), anti-bot challenge pages, or unreachable/timeout network errors.
 */
export class BlockedNavigationError extends Error {}

const BOT_CHALLENGE_TITLE_PATTERNS = [
  /^just a moment\b/i,
  /^attention required! \| cloudflare/i,
  /^security check/i,
  /^verify you are human/i,
  /^human verification/i,
  /^bot verification/i,
  /^checking your browser/i,
  /^access denied/i,
  /^403 forbidden/i,
  /^ddos-guard/i,
];

export function isBotChallengeTitle(title: string): boolean {
  const trimmed = title.trim();
  return BOT_CHALLENGE_TITLE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

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
  access?: CaptureAccess;
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
 * Measures whether the viewport is obstructed by an overlay, cookie banner,
 * modal dialog, or scroll lock via a 24×15 grid sample with `elementFromPoint`.
 * Landmark elements (header, nav, [role=banner], [role=navigation]) and
 * top-anchored banners shorter than 20% of viewport height count as headers
 * and are excluded from obstruction coverage.
 */
export async function measureObstruction(
  page: Page,
  at: "viewport" | "dark" | string = "viewport",
): Promise<Obstruction | null> {
  return page.evaluate((atParam) => {
    // Defensively ensure __name is defined if tsx rewrites inner functions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__name = (globalThis as any).__name || ((fn: any) => fn);

    if (!document.documentElement) return null;

    const htmlStyle = window.getComputedStyle(document.documentElement);
    const bodyStyle = document.body ? window.getComputedStyle(document.body) : null;
    const scrollLocked =
      htmlStyle.overflow === "hidden" ||
      htmlStyle.overflowY === "hidden" ||
      Boolean(bodyStyle && (bodyStyle.overflow === "hidden" || bodyStyle.overflowY === "hidden"));

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw <= 0 || vh <= 0) return null;

    const isLandmark = (el: Element | null): boolean => {
      if (!el) return false;
      return Boolean(
        el.closest('header, nav, [role="banner"], [role="navigation"]') ||
          el.matches('header, nav, [role="banner"], [role="navigation"]') ||
          el.querySelector('header, nav, [role="banner"], [role="navigation"]'),
      );
    };

    const getOutermostFixedAncestor = (el: Element): Element | null => {
      let curr: Element | null = el;
      let outermost: Element | null = null;
      while (curr && curr !== document.documentElement && curr !== document.body) {
        const style = window.getComputedStyle(curr);
        if (style.position === "fixed") {
          outermost = curr;
        }
        curr = curr.parentElement;
      }
      return outermost;
    };

    // Check visible dialogs/modals confirmed via hit test at center
    const modalCandidates = Array.from(
      document.querySelectorAll<HTMLElement>('dialog[open], [aria-modal="true"]'),
    );
    const confirmedModals: HTMLElement[] = [];
    for (const modal of modalCandidates) {
      if (!modal.isConnected) continue;
      const style = window.getComputedStyle(modal);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0" ||
        style.pointerEvents === "none"
      ) {
        continue;
      }
      const rect = modal.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      if (cx >= 0 && cx < vw && cy >= 0 && cy < vh) {
        let hit = document.elementFromPoint(cx, cy);
        while (hit && (hit as HTMLElement).shadowRoot) {
          const inner = (hit as HTMLElement).shadowRoot?.elementFromPoint(cx, cy);
          if (!inner || inner === hit) break;
          hit = inner;
        }
        if (hit && (modal === hit || modal.contains(hit))) {
          confirmedModals.push(modal);
        }
      }
    }

    const getDescriptor = (node: Element): string => {
      const tag = node.tagName.toLowerCase();
      if (node.id) return `${tag}#${node.id}`;
      const className = typeof node.className === "string" ? node.className.trim() : "";
      if (className) {
        const firstClass = className.split(/\s+/)[0];
        if (firstClass) return `${tag}.${firstClass}`;
      }
      return tag;
    };

    const culpritCounts: Record<string, number> = {};
    let coveredPoints = 0;
    const totalPoints = 24 * 15; // 360

    for (let r = 0; r < 15; r++) {
      const y = (r + 0.5) * (vh / 15);
      for (let c = 0; c < 24; c++) {
        const x = (c + 0.5) * (vw / 24);

        let el = document.elementFromPoint(x, y);
        while (el && (el as HTMLElement).shadowRoot) {
          const inner = (el as HTMLElement).shadowRoot?.elementFromPoint(x, y);
          if (!inner || inner === el) break;
          el = inner;
        }
        if (!el) continue;

        // Skip landmark elements
        if (isLandmark(el)) continue;

        // Check if inside a confirmed modal
        let obstructingElement: Element | null = null;
        for (const modal of confirmedModals) {
          if (modal === el || modal.contains(el)) {
            obstructingElement = modal;
            break;
          }
        }

        // Check fixed layers
        if (!obstructingElement) {
          const fixedAncestor = getOutermostFixedAncestor(el);
          if (fixedAncestor) {
            if (isLandmark(fixedAncestor)) continue;

            const rect = fixedAncestor.getBoundingClientRect();
            // Top-anchored banners shorter than 20% of viewport height count as headers
            const isTopAnchored = rect.top <= 1 && rect.left <= 5 && rect.width >= vw * 0.5;
            const isShortHeader = rect.height < 0.20 * vh;
            if (isTopAnchored && isShortHeader) {
              continue;
            }
            obstructingElement = fixedAncestor;
          }
        }

        if (obstructingElement) {
          coveredPoints++;
          const desc = getDescriptor(obstructingElement);
          culpritCounts[desc] = (culpritCounts[desc] || 0) + 1;
        }
      }
    }

    let topCulprit: string | undefined;
    let maxCount = 0;
    for (const [desc, count] of Object.entries(culpritCounts)) {
      if (count > maxCount) {
        maxCount = count;
        topCulprit = desc;
      }
    }

    const coverage = Math.round((coveredPoints / totalPoints) * 1000) / 1000;
    if (coverage === 0 && !scrollLocked) {
      return null;
    }

    return {
      coverage,
      scrollLocked,
      ...(topCulprit ? { culprit: topCulprit } : {}),
      at: atParam,
    };
  }, at);
}

/**
 * Everything after navigation. Separate from `renderUrl` so the eval harness
 * can drive it against local fixture pages without the SSRF guard.
 */
export async function capturePage(
  page: Page,
  options?: { mitigations?: Mitigation[] },
): Promise<CaptureArtifacts & { bannerDismissed: boolean }> {
  const initialTitle = await page.title();
  if (isBotChallengeTitle(initialTitle)) {
    throw new BlockedNavigationError(
      `Navigation was blocked by a bot challenge or access restriction (title: "${initialTitle}").`,
    );
  }

  const primaryViewport = page.viewportSize() ?? DEFAULT_VIEWPORT;
  const bannerDismissed = await dismissConsentBanner(page);

  // Nudge lazy/scroll-triggered content into loading.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  const mitigations = options?.mitigations ?? [];
  const obstruction = await measureObstruction(page, "viewport");
  const access: CaptureAccess = obstruction
    ? { state: "obstructed", mitigations, obstructions: [obstruction] }
    : { state: "clear", mitigations };

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
    access,
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
    const { tracker } = await preparePageForMitigation(page);

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
    let response: Response | null = null;
    try {
      response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: navTimeout });
    } catch (err) {
      await Promise.allSettled(pendingRedirectValidations);
      if (redirectSsrfError) {
        throw redirectSsrfError;
      }
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof Error && (err.name === "TimeoutError" || message.includes("Timeout"))) {
        throw new BlockedNavigationError(
          `Navigation to "${url}" timed out after ${navTimeout}ms. The site may be down or unreachable.`,
        );
      }
      if (
        message.includes("net::ERR_") ||
        message.includes("NS_ERROR_") ||
        message.includes("Navigation failed")
      ) {
        const firstLine = message.split("\n")[0].trim();
        throw new BlockedNavigationError(
          `Failed to reach "${url}": ${firstLine.replace(/^page\.goto:\s*/, "")}`,
        );
      }
      throw err;
    }
    await Promise.allSettled(pendingRedirectValidations);
    if (redirectSsrfError) {
      throw redirectSsrfError;
    }

    if (response) {
      const status = response.status();
      if (status >= 400) {
        const statusText = response.statusText();
        const detail = statusText ? `HTTP ${status} ${statusText}` : `HTTP ${status}`;
        if (status === 401 || status === 403) {
          throw new BlockedNavigationError(`Access denied to "${url}": ${detail}.`);
        }
        if (status >= 500) {
          throw new BlockedNavigationError(`Server error reaching "${url}": ${detail}.`);
        }
        throw new BlockedNavigationError(`Navigation to "${url}" failed with ${detail}.`);
      }
    }

    const titleAfterGoto = await page.title();
    if (isBotChallengeTitle(titleAfterGoto)) {
      throw new BlockedNavigationError(
        `Navigation to "${url}" was blocked by a bot challenge or access restriction (title: "${titleAfterGoto}").`,
      );
    }
    try {
      await page.waitForLoadState("networkidle", { timeout: 8_000 });
    } catch {}

    const mitigations = await collectMitigations(page, tracker);
    const { bannerDismissed, ...artifacts } = await capturePage(page, { mitigations });

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

