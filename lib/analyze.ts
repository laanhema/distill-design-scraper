import { renderUrl, type RenderResult } from "@/lib/ingest";
import { extractPalette, extractDarkPalette } from "@/lib/extract/palette";
import { extractTypography, applyMobileTypeSizes } from "@/lib/extract/typography";
import { extractTokens } from "@/lib/extract/tokens";
import { buildRecipes } from "@/lib/extract/recipes";
import { buildStates } from "@/lib/extract/states";
import { extractImagePalette } from "@/lib/extract/imagePalette";
import { extractStructure } from "@/lib/extract/structure";
import { buildReport, renderMarkdown } from "@/lib/emit";
import {
  aiLaneAvailable,
  applyRoleRefinements,
  interpret,
  type RefinementChange,
} from "@/lib/interpret";
import type { StyleDump } from "@/lib/extract/styleDump";
import type { Report, RawHarvestNode, ResponsiveHarvest, StructureReport } from "@/lib/schema";

/**
 * Orchestration (§8, URL & Image pipelines). Extraction is split from rendering on
 * purpose: `extractFromCapture` takes only the captured artifacts (style dump +
 * screenshot), so the eval harness (§10) can replay a cached render offline and
 * exercise every heuristic without launching a browser.
 */

export interface Capture {
  source: { type: "url"; ref: string; capturedAt: string };
  finalUrl: string;
  title: string;
  styleDump: StyleDump;
  /** Base64 PNG of the viewport screenshot (area-weight pixel pass). */
  viewportShot: string;
  /** DOM harvest tree for layout-structure extraction (Track B). */
  rawHarvestNode?: RawHarvestNode;
  /** Secondary-viewport DOM harvests off the same session (§P5-2). */
  responsiveHarvests?: ResponsiveHarvest[];
  /** Dark-color-scheme render off the same session (§P8-3). */
  darkCapture?: { viewportShot: string; styleDump: StyleDump };
}

export interface AnalyzeResult {
  report: Report;
  markdown: string;
}

/** Run the measured lanes over an already-captured page. Browser-free. */
export async function extractFromCapture(
  capture: Capture,
): Promise<AnalyzeResult> {
  const palette = await extractPalette({
    dump: capture.styleDump,
    screenshotPngBase64: capture.viewportShot,
  });
  let typography = extractTypography(capture.styleDump);
  const tokens = extractTokens(capture.styleDump);
  const recipes = buildRecipes(capture.styleDump, { palette, typography });
  const states = buildStates(capture.styleDump, palette);

  const mobileTypeSizes = capture.responsiveHarvests?.[0]?.typeSizesPx;
  if (typography && mobileTypeSizes) {
    typography = applyMobileTypeSizes(typography, mobileTypeSizes);
  }

  const paletteDark = capture.darkCapture
    ? await extractDarkPalette(
        { dump: capture.darkCapture.styleDump, screenshotPngBase64: capture.darkCapture.viewportShot },
        palette,
      )
    : undefined;

  const report = buildReport({
    reportKind: "design-system",
    source: capture.source,
    palette,
    paletteDark,
    typography,
    spacing: tokens.spacing,
    radius: tokens.radius,
    elevation: tokens.elevation,
    recipes,
    states,
  });

  return { report, markdown: renderMarkdown(report) };
}

/**
 * Run the structure lane over an already-captured page. Pass `report` (the
 * already-built design-tokens report) in `both` mode to enable the P3-1
 * component → token cross-link; omitted, the structure report has no hints.
 */
export async function extractStructureFromCapture(
  capture: Capture,
  report?: Report,
): Promise<StructureReport> {
  if (!capture.rawHarvestNode) {
    throw new Error("Capture does not contain rawHarvestNode for structure extraction.");
  }
  return extractStructure({
    sourceUrl: capture.source.ref,
    capturedAt: capture.source.capturedAt,
    rawHarvestNode: capture.rawHarvestNode,
    dump: report ? capture.styleDump : undefined,
    report,
    responsiveHarvests: capture.responsiveHarvests,
  });
}

/**
 * Interpretation pass (§6): run the AI lane over an already-measured report and
 * merge its identity/imageMood plus Stage E role refinements (§5). Kept
 * separate from `extractFromCapture` on purpose — the measured lane must stay
 * browser- and network-free so the eval harness can replay captures offline;
 * only the live URL/image paths reach for the model. Falls back to the measured
 * report untouched when no API key is set or the model fails (§6, §9).
 */
export async function enrichWithAI(
  measured: AnalyzeResult,
  screenshotPngBase64: string,
): Promise<AnalyzeResult & { refinements: RefinementChange[] }> {
  if (!aiLaneAvailable()) return { ...measured, refinements: [] };

  const interpretation = await interpret({
    screenshotPngBase64,
    palette: measured.report.palette,
    typography: measured.report.typography,
  });
  if (!interpretation) return { ...measured, refinements: [] };

  const { palette, changes } = applyRoleRefinements(
    measured.report.palette,
    interpretation.roleRefinements,
  );

  const report = buildReport({
    reportKind: measured.report.reportKind,
    source: measured.report.source,
    palette,
    paletteDark: measured.report.paletteDark,
    typography: measured.report.typography,
    spacing: measured.report.spacing,
    radius: measured.report.radius,
    elevation: measured.report.elevation,
    recipes: measured.report.recipes,
    states: measured.report.states,
    identity: interpretation.identity,
    imageMood: interpretation.imageMood,
  });

  return { report, markdown: renderMarkdown(report), refinements: changes };
}

/** Phase 3: Full image processing path ("Palette & Mood" report, §3, §8). */
export async function analyzeImage(
  imageInput: Buffer | string,
  refName = "uploaded-image",
): Promise<
  AnalyzeResult & {
    refinements: RefinementChange[];
    meta: {
      finalUrl: string;
      title: string;
      elapsedMs: number;
      bannerDismissed: boolean;
      aiApplied: boolean;
    };
  }
> {
  const startedAt = Date.now();
  const capturedAt = new Date().toISOString();
  const palette = await extractImagePalette(imageInput);

  const baseReport = buildReport({
    reportKind: "palette-mood",
    source: { type: "image", ref: refName, capturedAt },
    palette,
  });

  const measuredResult: AnalyzeResult = {
    report: baseReport,
    markdown: renderMarkdown(baseReport),
  };

  const imageBase64 =
    typeof imageInput === "string"
      ? imageInput
      : imageInput.toString("base64");

  const enriched = await enrichWithAI(measuredResult, imageBase64);

  return {
    report: enriched.report,
    markdown: enriched.markdown,
    refinements: enriched.refinements,
    meta: {
      finalUrl: refName,
      title: refName,
      elapsedMs: Date.now() - startedAt,
      bannerDismissed: false,
      aiApplied: Boolean(enriched.report.identity),
    },
  };
}

/** Turn a live render into the artifacts the extraction lane consumes. */
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
  };
}

/** Full URL path: render, extract (measured), then interpret (AI, §6). */
export async function analyzeUrl(url: string): Promise<AnalyzeResult & {
  capture: Capture;
  refinements: RefinementChange[];
  meta: {
    finalUrl: string;
    title: string;
    elapsedMs: number;
    bannerDismissed: boolean;
    aiApplied: boolean;
  };
}> {
  const capturedAt = new Date().toISOString();
  const render = await renderUrl(url);
  const capture = captureFromRender(render, url, capturedAt);
  const measured = await extractFromCapture(capture);
  const enriched = await enrichWithAI(measured, capture.viewportShot);
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

/** Full URL path for Track B structure extraction alone or combined. */
export async function analyzeUrlStructure(url: string): Promise<StructureReport> {
  const capturedAt = new Date().toISOString();
  const render = await renderUrl(url);
  const capture = captureFromRender(render, url, capturedAt);
  return extractStructureFromCapture(capture);
}

