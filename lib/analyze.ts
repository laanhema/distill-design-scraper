import { renderUrl, type RenderResult } from "@/lib/ingest";
import { extractPalette } from "@/lib/extract/palette";
import { extractTypography } from "@/lib/extract/typography";
import { buildReport, renderMarkdown } from "@/lib/emit";
import {
  aiLaneAvailable,
  applyRoleRefinements,
  interpret,
  type RefinementChange,
} from "@/lib/interpret";
import type { StyleDump } from "@/lib/extract/styleDump";
import type { Report } from "@/lib/schema";

/**
 * Orchestration (§8, URL pipeline). Extraction is split from rendering on
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
  const typography = extractTypography(capture.styleDump);

  const report = buildReport({
    reportKind: "design-system",
    source: capture.source,
    palette,
    typography,
  });

  return { report, markdown: renderMarkdown(report) };
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
    typography: measured.report.typography,
    identity: interpretation.identity,
    imageMood: interpretation.imageMood,
  });

  return { report, markdown: renderMarkdown(report), refinements: changes };
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
