import { renderUrl, type RenderResult } from "@/lib/ingest";
import { extractPalette, extractDarkPalette } from "@/lib/extract/palette";
import { extractTypography, applyMobileTypeSizes } from "@/lib/extract/typography";
import { extractTokens } from "@/lib/extract/tokens";
import { buildRecipes } from "@/lib/extract/recipes";
import { buildStates } from "@/lib/extract/states";
import { extractMotion } from "@/lib/extract/motion";
import { extractImagePalette } from "@/lib/extract/imagePalette";
import { extractStructure } from "@/lib/extract/structure";
import { structureFromImages } from "@/lib/extract/structureFromImage";
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
  viewport?: { width: number; height: number };
  styleDump: StyleDump;
  /** Base64 PNG of the viewport screenshot (area-weight pixel pass). */
  viewportShot: string;
  /** DOM harvest tree for layout-structure extraction (Track B). */
  rawHarvestNode?: RawHarvestNode;
  /** Secondary-viewport DOM harvests off the same session (§P5-2). */
  responsiveHarvests?: ResponsiveHarvest[];
  /** Dark-color-scheme render off the same session (§P8-3). */
  darkCapture?: { viewportShot: string; styleDump: StyleDump };
  /** Additional screenshots scrolled toward the bottom of the page, same
   *  session (§ scroll capture) — the complete gapless viewport-tall tile
   *  set sent to the AI lane (subsampled for full-page coverage). The
   *  area-weight pixel pass reads `panoramaShot` instead. */
  scrollShots?: string[];
  /** Single seamless full-page screenshot stitched from gapless viewport
   *  tiles (§ panorama capture) — feeds the area-weight pixel pass and the
   *  frontend gallery. Omitted when the page fits in one viewport, or on
   *  capture failure. */
  panoramaShot?: string;
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
    screenshotPngBase64: capture.panoramaShot ?? capture.viewportShot,
  });
  let typography = extractTypography(capture.styleDump);
  const tokens = extractTokens(capture.styleDump);
  const recipes = buildRecipes(capture.styleDump, { palette, typography });
  const states = buildStates(capture.styleDump, palette);
  const motion = extractMotion(capture.styleDump);

  const mobileTypeSizes = capture.responsiveHarvests?.find(
    (h) => h.viewport.width === 390,
  )?.typeSizesPx;
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
    motion,
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
  opts?: {
    forceHeuristicNaming?: boolean
  },
): Promise<StructureReport> {
  if (!capture.rawHarvestNode) {
    throw new Error("Capture does not contain rawHarvestNode for structure extraction.");
  }
  return extractStructure({
    sourceUrl: capture.source.ref,
    capturedAt: capture.source.capturedAt,
    viewport: capture.viewport,
    rawHarvestNode: capture.rawHarvestNode,
    dump: report ? capture.styleDump : undefined,
    report,
    responsiveHarvests: capture.responsiveHarvests,
    forceHeuristicNaming: opts?.forceHeuristicNaming,
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
  screenshotsPngBase64: string[],
): Promise<AnalyzeResult & { refinements: RefinementChange[] }> {
  if (!aiLaneAvailable()) return { ...measured, refinements: [] };

  const interpretation = await interpret({
    screenshotsPngBase64,
    palette: measured.report.palette,
    typography: measured.report.typography,
  });
  if (!interpretation) return { ...measured, refinements: [] };

  const { palette, changes } = applyRoleRefinements(
    measured.report.palette,
    interpretation.roleRefinements,
  );

  // Spread the measured report rather than re-listing its fields: this pass
  // only *adds* interpretive lanes and swaps in the refined palette, so every
  // measured lane must survive it untouched. Enumerating them by hand silently
  // dropped `motion` when that lane was added — a spread can't drift.
  const report = buildReport({
    ...measured.report,
    palette,
    identity: interpretation.identity,
    imageMood: interpretation.imageMood,
  });

  return { report, markdown: renderMarkdown(report), refinements: changes };
}

export interface ImageInput {
  data: Buffer | string;
  name?: string;
}

/**
 * Phase 3 / §P6-1: Full image processing path ("Palette & Mood" report).
 * Accepts one or more images of the same subject — palettes are merged at the
 * pixel-cluster level (§P6-1, `extractImagePalette`) rather than averaged
 * after role-assignment, so the result is still one coherent, unique-per-role
 * palette instead of N colliding ones.
 */
export async function analyzeImages(
  images: ImageInput[],
  mode: "tokens" | "structure" | "both" = "tokens",
): Promise<
  AnalyzeResult & {
    refinements: RefinementChange[];
    structureReport?: StructureReport;
    /** Set when structure was requested but couldn't be produced — no API
     *  key, or the vision model failed — so the caller can explain the gap
     *  instead of silently omitting it (§P6-2 step 2). */
    structureUnavailableReason?: string;
    meta: {
      finalUrl: string;
      title: string;
      elapsedMs: number;
      bannerDismissed: boolean;
      aiApplied: boolean;
    };
  }
> {
  if (images.length === 0) {
    throw new Error("analyzeImages requires at least one image.");
  }

  const startedAt = Date.now();
  const capturedAt = new Date().toISOString();
  const names = images.map((img, i) => img.name || `uploaded-image-${i + 1}`);
  const ref = names.length === 1 ? names[0] : `${names[0]} +${names.length - 1} more`;

  const palette = await extractImagePalette(images.map((img) => img.data));

  const baseReport = buildReport({
    reportKind: "palette-mood",
    source: {
      type: "image",
      ref,
      ...(names.length > 1 ? { refs: names } : {}),
      capturedAt,
    },
    palette,
  });

  const measuredResult: AnalyzeResult = {
    report: baseReport,
    markdown: renderMarkdown(baseReport),
  };

  const screenshotsBase64 = images.map((img) =>
    typeof img.data === "string" ? img.data : img.data.toString("base64"),
  );

  const wantsStructure = mode === "structure" || mode === "both";
  // A "structure"-only caller has no use for the identity/imageMood AI pass
  // over the palette-mood report, so skip it rather than paying for both.
  const wantsTokenEnrichment = mode === "tokens" || mode === "both";

  const [enriched, structureOutcome] = await Promise.all([
    wantsTokenEnrichment
      ? enrichWithAI(measuredResult, screenshotsBase64)
      : Promise.resolve({ ...measuredResult, refinements: [] as RefinementChange[] }),
    wantsStructure
      ? aiLaneAvailable()
        ? structureFromImages({
            imagesPngBase64: screenshotsBase64,
            sourceRef: ref,
            capturedAt,
          })
            .then((structureReport) => ({
              structureReport: structureReport ?? undefined,
              structureUnavailableReason: structureReport
                ? undefined
                : "Vision structure inference failed for this image.",
            }))
            .catch((err) => {
              console.warn("Image structure extraction error:", err);
              return {
                structureReport: undefined,
                structureUnavailableReason: "Vision structure inference failed for this image.",
              };
            })
        : Promise.resolve({
            structureReport: undefined as StructureReport | undefined,
            // Distinct from the vision-call failure above: this is a
            // persistent condition (no retry will fix it without config
            // changes), not a one-off flake — see the route.ts caching gate,
            // which relies on that distinction (DIST-050).
            structureUnavailableReason:
              "Structure inference for images requires an AI key — set GEMINI_API_KEY or OPENROUTER_API_KEY." as
                | string
                | undefined,
          })
      : Promise.resolve({
          structureReport: undefined as StructureReport | undefined,
          structureUnavailableReason: undefined as string | undefined,
        }),
  ]);

  const { structureReport, structureUnavailableReason } = structureOutcome;

  return {
    report: enriched.report,
    markdown: enriched.markdown,
    refinements: enriched.refinements,
    structureReport,
    structureUnavailableReason,
    meta: {
      finalUrl: ref,
      title: ref,
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
    viewport: render.viewport,
    styleDump: render.styleDump,
    viewportShot: render.viewportShot,
    rawHarvestNode: render.rawHarvestNode,
    responsiveHarvests: render.responsiveHarvests,
    darkCapture: render.darkCapture,
    scrollShots: render.scrollShots,
    panoramaShot: render.panoramaShot,
  };
}

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

/** Full URL path: render, extract (measured), then interpret (AI, §6). */
export async function analyzeUrl(
  url: string,
  mode: "tokens" | "structure" | "both" = "both",
): Promise<AnalyzeResult & {
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
  // A "structure"-only caller has no use for the identity/imageMood AI pass
  // over the palette-mood report, so skip it rather than paying for both.
  const wantsTokenEnrichment = mode === "tokens" || mode === "both";
  const enriched = wantsTokenEnrichment
    ? await enrichWithAI(measured, [
        capture.viewportShot,
        ...subsampleEvenly(capture.scrollShots ?? [], 3),
      ])
    : { ...measured, refinements: [] as RefinementChange[] };
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

